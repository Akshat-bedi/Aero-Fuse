"""Rule-based retasking engine (B6a): impact -> candidate plans -> ranked output.

The engine is pure and deterministic: given the same state version and event it
returns the same recommendation ids (based on ``state.next_recommendation_id``)
and the same scores. It applies its changes only to throwaway copies; the live
plan changes when the commander approves (B8a).

Three weighting profiles produce the primary plan and up to two alternatives:

- ``min_disruption``: prefer the smallest route/time delta;
- ``min_risk``: prefer the least threat exposure / freshest resources;
- ``max_coverage``: preserve priority-weighted coverage first.

``check_plan_lite`` filters every candidate; if fewer than three distinct plans
survive, labelled hold/delay variants are added so the comparison view always
has options when a plan exists. See ``backend/docs/RETASK_RULES.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from typing import Protocol

from app.domain import (
    AircraftStatus,
    Change,
    ChangeKind,
    EventType,
    ImpactAnalysis,
    Mission,
    MissionStatus,
    OpsEvent,
    Recommendation,
    RecommendationStatus,
    ThreatStatus,
    Tradeoff,
    TradeoffDirection,
    parse_timestamp,
    to_iso_z,
)
from app.retask import geometry_lite
from app.retask.apply import apply_changes
from app.retask.impact import analyse_impact, find_injected_threat
from app.retask.rules import aircraft as aircraft_rule
from app.retask.rules import base_ops
from app.retask.rules import crew as crew_rule
from app.retask.rules import priority as priority_rule
from app.retask.rules import threat as threat_rule
from app.retask.rules import weather as weather_rule
from app.retask.rules.common import PROFILES, CandidatePlan
from app.retask.validate import check_plan_lite
from app.sim.movement import CRUISE_SPEED_KMH, FUEL_BURN_PCT_PER_HOUR
from app.state.store import StateStore

PRIORITY_WEIGHTS = {1: 1000, 2: 300, 3: 100, 4: 30}
RESERVE_PCT = 15.0
_ACTIVE = frozenset(
    {
        MissionStatus.PLANNED,
        MissionStatus.APPROVED,
        MissionStatus.IN_PROGRESS,
        MissionStatus.AT_RISK,
    }
)
_HOLD_MINUTES = (10.0, 20.0)


class RetaskEngine(Protocol):
    """Engine boundary: impact analysis plus candidate plan generation."""

    def analyse_impact(self, event: OpsEvent, state: StateStore) -> ImpactAnalysis: ...

    def propose(
        self, event: OpsEvent, state: StateStore, impact: ImpactAnalysis
    ) -> RetaskProposal: ...


@dataclass(frozen=True)
class RetaskProposal:
    """Primary recommendation plus alternatives (alternatives also wire-ready)."""

    primary: Recommendation
    alternatives: list[Recommendation] = field(default_factory=list)
    no_feasible_plan: bool = False


@dataclass(frozen=True)
class _Metrics:
    score: float
    coverage: float
    threat_avoidance: float
    fuel_efficiency: float
    schedule: float
    fleet_margin: float
    delay_min: float


class RuleBasedEngine:
    """Deterministic rule slice; replaced by the CP-SAT optimiser in B5."""

    def analyse_impact(self, event: OpsEvent, state: StateStore) -> ImpactAnalysis:
        return analyse_impact(event, state)

    def propose(
        self, event: OpsEvent, state: StateStore, impact: ImpactAnalysis
    ) -> RetaskProposal:
        plans: list[CandidatePlan] = []
        failures: list[str] = []
        for profile in PROFILES:
            plan = _build_plan(state, event, impact.impacted_mission_ids, profile)
            if not plan.feasible:
                if plan.failure:
                    failures.append(plan.failure)
                continue
            violations = check_plan_lite(state, plan.changes)
            if violations:
                plan.relaxed.extend(f"Candidate rejected: {violation}" for violation in violations)
                failures.extend(violations)
                continue
            plans.append(plan)

        plans = _dedupe(plans)
        plans = _with_hold_variants(state, plans, impact)
        if not plans:
            return RetaskProposal(
                primary=self._no_feasible(event, state, impact, failures),
                alternatives=[],
                no_feasible_plan=True,
            )

        primary_plan = plans[0]
        recommendation_id = state.next_recommendation_id()
        alternatives = [
            self._recommendation(
                state,
                event,
                impact,
                plan,
                f"{recommendation_id}-ALT{index}",
                alternatives=None,
            )
            for index, plan in enumerate(plans[1:3], start=1)
        ]
        primary = self._recommendation(
            state,
            event,
            impact,
            primary_plan,
            recommendation_id,
            alternatives=alternatives,
        )
        return RetaskProposal(primary=primary, alternatives=alternatives)

    def _recommendation(
        self,
        state: StateStore,
        event: OpsEvent,
        impact: ImpactAnalysis,
        plan: CandidatePlan,
        recommendation_id: str,
        *,
        alternatives: list[Recommendation] | None = None,
    ) -> Recommendation:
        planned = apply_changes(state, plan.changes)
        metrics = _metrics(state, planned, impact, event)
        confidence = max(0.4, min(0.92, 0.86 - 0.05 * len(plan.relaxed)))
        explanation = list(plan.explanations)
        if not explanation:
            explanation = ["The current plan remains feasible; no changes are required."]
        if plan.relaxed:
            explanation.append(
                "Relaxed constraints are shown in amber and require commander acceptance."
            )
        return Recommendation(
            id=recommendation_id,
            trigger_event_id=event.id,
            summary=_summary(plan.changes, planned),
            score=metrics.score,
            changes=plan.changes,
            impacted_mission_ids=impact.impacted_mission_ids,
            tradeoffs=_tradeoffs(state, planned, plan.changes),
            explanation=explanation,
            constraints_satisfied=_satisfied_constraints(),
            constraints_relaxed=list(plan.relaxed),
            alternatives=alternatives,
            criteria_scores={
                "Overall Feasibility": metrics.score,
                "Threat Avoidance": metrics.threat_avoidance,
                "Fuel Efficiency": metrics.fuel_efficiency,
                "Schedule Adherence": metrics.schedule,
                "Fleet Margin Preserved": metrics.fleet_margin,
            },
            status=RecommendationStatus.PENDING,
            created_at=event.timestamp,
            state_version=state.version,
            confidence=round(confidence, 2),
            data_freshness_sec=0.0,
        )

    def _no_feasible(
        self,
        event: OpsEvent,
        state: StateStore,
        impact: ImpactAnalysis,
        failures: list[str],
    ) -> Recommendation:
        reasons = failures or ["no rule-generated plan passed the hard constraints"]
        return Recommendation(
            id=state.next_recommendation_id(),
            trigger_event_id=event.id,
            summary=(
                "NO FEASIBLE PLAN — no rule-generated option satisfies the hard "
                "constraints. Commander action required."
            ),
            score=10.0,
            changes=[],
            impacted_mission_ids=impact.impacted_mission_ids,
            tradeoffs=[
                Tradeoff(
                    label="Priority coverage",
                    delta=-100.0,
                    unit="%",
                    direction=TradeoffDirection.BAD,
                )
            ],
            explanation=[
                "The rule engine could not build a plan that preserves priority "
                "coverage under the current resources.",
                *reasons,
                "Consider relaxing the ROE, accepting a lower-priority cancellation "
                "or injecting additional resources.",
            ],
            constraints_satisfied=[],
            constraints_relaxed=list(reasons),
            alternatives=[],
            criteria_scores={
                "Overall Feasibility": 0.0,
                "Threat Avoidance": 0.0,
                "Fuel Efficiency": 0.0,
                "Schedule Adherence": 0.0,
                "Fleet Margin Preserved": 0.0,
            },
            status=RecommendationStatus.PENDING,
            created_at=event.timestamp,
            state_version=state.version,
            confidence=0.3,
            data_freshness_sec=0.0,
        )


def _build_plan(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    if event.type is EventType.THREAT_DETECTED:
        return threat_rule.build(state, event, impacted, profile)
    if event.type is EventType.AIRCRAFT_UNSERVICEABLE:
        return aircraft_rule.build(state, event, impacted, profile)
    if event.type is EventType.BASE_CLOSED:
        return base_ops.build(state, event, impacted, profile)
    if event.type is EventType.WEATHER_DEGRADED:
        return weather_rule.build(state, event, impacted, profile)
    if event.type is EventType.CREW_UNAVAILABLE:
        return crew_rule.build(state, event, impacted, profile)
    if event.type is EventType.NEW_PRIORITY_MISSION:
        return priority_rule.build(state, event, impacted, profile)
    raise AssertionError(f"unsupported event type {event.type}")


def _dedupe(plans: list[CandidatePlan]) -> list[CandidatePlan]:
    seen: set[tuple[tuple[str, str, str, str], ...]] = set()
    unique: list[CandidatePlan] = []
    for plan in plans:
        key = _plan_key(plan.changes)
        if key in seen:
            continue
        seen.add(key)
        unique.append(plan)
    return unique


def _plan_key(changes: list[Change]) -> tuple[tuple[str, str, str, str], ...]:
    return tuple(
        (
            change.mission_id,
            change.kind.value,
            _canonical(change.before),
            _canonical(change.after),
        )
        for change in changes
    )


def _canonical(value: object) -> str:
    if isinstance(value, dict):
        items = sorted((str(key), _canonical(item)) for key, item in value.items())
        return "{" + ",".join(f"{key}={item}" for key, item in items) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_canonical(item) for item in value) + "]"
    return repr(value)


def _with_hold_variants(
    state: StateStore, plans: list[CandidatePlan], impact: ImpactAnalysis
) -> list[CandidatePlan]:
    if not plans or len(plans) >= 3:
        return plans
    seed = plans[0]
    if not seed.changes:
        return plans
    target = _hold_target(state, impact, seed.changes)
    if target is None:
        return plans

    base_start = parse_timestamp(target.window_start)
    variants = list(plans)
    seen = {_plan_key(plan.changes) for plan in plans}
    for minutes in _HOLD_MINUTES:
        if len(variants) >= 3:
            break
        changes = [change.model_copy(deep=True) for change in seed.changes]
        changes.append(
            Change(
                mission_id=target.id,
                kind=ChangeKind.DELAY,
                before=target.window_start,
                after=to_iso_z(base_start + timedelta(minutes=minutes)),
                note=f"Hold {target.id} for {minutes:g} min to deconflict resources",
            )
        )
        if _plan_key(changes) in seen:
            continue
        if check_plan_lite(state, changes):
            continue
        seen.add(_plan_key(changes))
        variants.append(
            CandidatePlan(
                profile=f"hold_{int(minutes)}",
                changes=changes,
                explanations=[
                    *seed.explanations,
                    f"Alternative holds {target.id} {target.name} for "
                    f"{minutes:g} min before resuming, trading schedule for "
                    "additional deconfliction margin.",
                ],
                relaxed=list(seed.relaxed),
            )
        )
    return variants


def _hold_target(
    state: StateStore, impact: ImpactAnalysis, changes: list[Change]
) -> Mission | None:
    touched = {change.mission_id for change in changes}
    cancelled = {
        change.mission_id for change in changes if change.kind is ChangeKind.CANCEL
    }
    candidates = [
        state.missions[mission_id]
        for mission_id in impact.impacted_mission_ids
        if mission_id in state.missions
        and mission_id not in cancelled
        and state.missions[mission_id].status in _ACTIVE
    ]
    if not candidates:
        return None
    delayed = {
        change.mission_id for change in changes if change.kind is ChangeKind.DELAY
    }
    candidates = [mission for mission in candidates if mission.id not in delayed]
    if not candidates:
        return None
    candidates.sort(
        key=lambda mission: (-int(mission.priority), mission.id in touched, mission.id)
    )
    return candidates[0]


def _metrics(
    state: StateStore, planned: StateStore, impact: ImpactAnalysis, event: OpsEvent
) -> _Metrics:
    coverage = _coverage(state, planned)
    threat_avoidance = _threat_avoidance(state, planned, event)
    fuel_efficiency = _fuel_efficiency(planned)

    delay_min = 0.0
    for mission_id in impact.impacted_mission_ids:
        before = state.missions.get(mission_id)
        after = planned.missions.get(mission_id)
        if before is None or after is None:
            continue
        delta = (
            parse_timestamp(after.window_start) - parse_timestamp(before.window_start)
        ).total_seconds() / 60.0
        delay_min += max(0.0, delta)
    schedule = round(max(0.0, 100.0 - min(100.0, delay_min * 2.0)), 1)
    fleet_margin = _fleet_margin(planned)

    score = (
        0.35 * coverage
        + 0.25 * threat_avoidance
        + 0.15 * fuel_efficiency
        + 0.10 * schedule
        + 0.15 * fleet_margin
    )
    return _Metrics(
        score=round(score, 1),
        coverage=round(coverage, 1),
        threat_avoidance=round(threat_avoidance, 1),
        fuel_efficiency=round(fuel_efficiency, 1),
        schedule=schedule,
        fleet_margin=round(fleet_margin, 1),
        delay_min=round(delay_min, 1),
    )


def _coverage(state: StateStore, planned: StateStore) -> float:
    ids = set(state.missions) | set(planned.missions)
    total = 0.0
    fulfilled = 0.0
    for mission_id in ids:
        baseline = state.missions.get(mission_id) or planned.missions.get(mission_id)
        if baseline is None:
            continue
        if mission_id in state.missions and baseline.status not in _ACTIVE:
            continue
        total += PRIORITY_WEIGHTS.get(int(baseline.priority), 30)
        mission = planned.missions.get(mission_id)
        if (
            mission is not None
            and mission.status in _ACTIVE
            and mission.assigned.aircraft_ids
            and mission.assigned.crew_ids
        ):
            fulfilled += PRIORITY_WEIGHTS.get(int(mission.priority), 30)
    return 100.0 * fulfilled / total if total else 100.0


def _threat_avoidance(state: StateStore, planned: StateStore, event: OpsEvent) -> float:
    triggering = find_injected_threat(event, state)
    threats = [triggering] if triggering is not None else list(state.threats.values())
    threats = [threat for threat in threats if threat.status is not ThreatStatus.NEUTRALISED]
    if not threats:
        return 100.0
    exposure = 0.0
    distance = 0.0
    for mission in planned.missions.values():
        if mission.status not in _ACTIVE:
            continue
        base = planned.bases.get(mission.launch_base_id)
        points = geometry_lite.clearance_points(
            mission, base.location if base else None
        )
        distance += geometry_lite.route_distance_km(points)
        for threat in threats:
            exposure += geometry_lite.route_exposure_km(points, threat)
    if distance <= 0.0:
        return 100.0
    return max(0.0, 100.0 - min(100.0, exposure / distance * 400.0))


def _fuel_efficiency(planned: StateStore) -> float:
    loads: list[float] = []
    for mission in planned.missions.values():
        if mission.status not in _ACTIVE:
            continue
        distance = geometry_lite.route_distance_km(list(mission.route))
        for aircraft_id in mission.assigned.aircraft_ids:
            airframe = planned.aircraft.get(aircraft_id)
            if airframe is None:
                continue
            speed = CRUISE_SPEED_KMH.get(airframe.type, 600.0)
            burn = FUEL_BURN_PCT_PER_HOUR.get(airframe.type, 8.0)
            loads.append(distance / speed * burn)
    if not loads:
        return 100.0
    return max(0.0, 100.0 - sum(loads) / len(loads) * 4.0)


def _fleet_margin(planned: StateStore) -> float:
    ready = [
        airframe
        for airframe in planned.aircraft.values()
        if airframe.status
        in {
            AircraftStatus.SERVICEABLE,
            AircraftStatus.TURNAROUND,
            AircraftStatus.AIRBORNE,
        }
    ]
    if not ready:
        return 0.0
    unassigned = sum(
        1 for airframe in ready if airframe.assigned_mission_id is None
    )
    return 100.0 * unassigned / len(ready)


def _summary(changes: list[Change], planned: StateStore) -> str:
    parts: list[str] = []
    for change in changes:
        if change.kind is ChangeKind.REROUTE:
            if str(change.after) in planned.bases:
                parts.append(f"{change.mission_id} diverted to {change.after}")
            else:
                parts.append(f"{change.mission_id} rerouted via {change.after}")
        elif change.kind is ChangeKind.AIRCRAFT_SWAP:
            parts.append(f"{change.mission_id} swaps {change.before} -> {change.after}")
        elif change.kind is ChangeKind.CREW_SWAP:
            parts.append(f"{change.mission_id} crew {change.before} -> {change.after}")
        elif change.kind is ChangeKind.DELAY:
            before = planned.missions.get(change.mission_id)
            note = f"{change.mission_id} delayed"
            if before is not None and change.before is not None:
                minutes = (
                    parse_timestamp(before.window_start)
                    - parse_timestamp(str(change.before))
                ).total_seconds() / 60.0
                if minutes > 0:
                    note += f" {minutes:g} min"
            parts.append(note)
        elif change.kind is ChangeKind.CANCEL:
            parts.append(f"{change.mission_id} cancelled")
        elif change.kind is ChangeKind.NEW_ASSIGNMENT:
            after = change.after if isinstance(change.after, dict) else {}
            aircraft_ids = after.get("aircraftIds", [])
            crew_ids = after.get("crewIds", [])
            parts.append(
                f"{change.mission_id} tasked with "
                f"{'/'.join(str(item) for item in aircraft_ids)} + "
                f"{'/'.join(str(item) for item in crew_ids)}"
            )
    if not parts:
        return "No plan changes required; monitor the situation."
    text = "; ".join(parts) + "."
    return text[0].upper() + text[1:]


def _satisfied_constraints() -> list[str]:
    return [
        "Aircraft type and readiness match the mission",
        "Crew qualifications and 12 h duty limit",
        "No double-booking; 45 min turnaround enforced",
        "Weapon stock available at the launch base",
        "Fuel covers the route with a 15% reserve",
    ]


def _tradeoffs(
    state: StateStore, planned: StateStore, changes: list[Change]
) -> list[Tradeoff]:
    tradeoffs: list[Tradeoff] = []
    for change in changes:
        mission = state.missions.get(change.mission_id)
        planned_mission = planned.missions.get(change.mission_id)
        if change.kind is ChangeKind.REROUTE:
            if mission is not None and str(change.after) in planned.bases:
                old_base = state.bases.get(str(change.before))
                new_base = planned.bases.get(str(change.after))
                if old_base is not None and new_base is not None:
                    tradeoffs.append(
                        Tradeoff(
                            label=f"{change.mission_id} recovery distance",
                            delta=round(
                                geometry_lite.distance_km(
                                    old_base.location, new_base.location
                                ),
                                1,
                            ),
                            unit="km",
                            direction=TradeoffDirection.BAD,
                        )
                    )
            elif mission is not None:
                old_option = geometry_lite.route_option_for(mission, str(change.before))
                new_option = geometry_lite.route_option_for(mission, str(change.after))
                if old_option is not None and new_option is not None:
                    old_distance = (
                        old_option.distance_km
                        if old_option.distance_km is not None
                        else geometry_lite.route_distance_km(list(old_option.waypoints))
                    )
                    new_distance = (
                        new_option.distance_km
                        if new_option.distance_km is not None
                        else geometry_lite.route_distance_km(list(new_option.waypoints))
                    )
                    delta = round(new_distance - old_distance, 1)
                    tradeoffs.append(
                        Tradeoff(
                            label=f"{change.mission_id} route distance",
                            delta=delta,
                            unit="km",
                            direction=(
                                TradeoffDirection.BAD
                                if delta > 0
                                else TradeoffDirection.GOOD
                                if delta < 0
                                else TradeoffDirection.NEUTRAL
                            ),
                        )
                    )
                    old_risk = old_option.risk_score
                    new_risk = new_option.risk_score
                    if old_risk is not None and new_risk is not None:
                        risk_delta = round(new_risk - old_risk, 1)
                        tradeoffs.append(
                            Tradeoff(
                                label=f"{change.mission_id} route risk",
                                delta=risk_delta,
                                unit="risk",
                                direction=(
                                    TradeoffDirection.GOOD
                                    if risk_delta < 0
                                    else TradeoffDirection.BAD
                                    if risk_delta > 0
                                    else TradeoffDirection.NEUTRAL
                                ),
                            )
                        )
        elif change.kind is ChangeKind.DELAY:
            if mission is not None and planned_mission is not None:
                delta = round(
                    (
                        parse_timestamp(planned_mission.window_start)
                        - parse_timestamp(mission.window_start)
                    ).total_seconds()
                    / 60.0,
                    1,
                )
                tradeoffs.append(
                    Tradeoff(
                        label=f"{change.mission_id} launch delay",
                        delta=delta,
                        unit="min",
                        direction=(
                            TradeoffDirection.BAD
                            if delta > 0
                            else TradeoffDirection.GOOD
                            if delta < 0
                            else TradeoffDirection.NEUTRAL
                        ),
                    )
                )
        elif change.kind is ChangeKind.AIRCRAFT_SWAP:
            old_aircraft = state.aircraft.get(str(change.before))
            new_aircraft = planned.aircraft.get(str(change.after))
            if old_aircraft is not None and new_aircraft is not None:
                delta = round(new_aircraft.fuel_pct - old_aircraft.fuel_pct, 1)
                tradeoffs.append(
                    Tradeoff(
                        label=f"{change.mission_id} airframe fuel",
                        delta=delta,
                        unit="%",
                        direction=(
                            TradeoffDirection.GOOD
                            if delta > 0
                            else TradeoffDirection.BAD
                            if delta < 0
                            else TradeoffDirection.NEUTRAL
                        ),
                    )
                )
        elif change.kind is ChangeKind.CREW_SWAP:
            old_crew = state.crew.get(str(change.before))
            new_crew = planned.crew.get(str(change.after))
            if old_crew is not None and new_crew is not None:
                delta = round(new_crew.fatigue_index - old_crew.fatigue_index, 1)
                tradeoffs.append(
                    Tradeoff(
                        label=f"{change.mission_id} crew fatigue",
                        delta=delta,
                        unit="fatigue",
                        direction=(
                            TradeoffDirection.GOOD
                            if delta < 0
                            else TradeoffDirection.BAD
                            if delta > 0
                            else TradeoffDirection.NEUTRAL
                        ),
                    )
                )
        elif change.kind is ChangeKind.CANCEL:
            tradeoffs.append(
                Tradeoff(
                    label=f"{change.mission_id} coverage",
                    delta=-1.0,
                    unit="sorties",
                    direction=TradeoffDirection.BAD,
                )
            )
        elif change.kind is ChangeKind.NEW_ASSIGNMENT:
            tradeoffs.append(
                Tradeoff(
                    label=f"{change.mission_id} coverage",
                    delta=1.0,
                    unit="sorties",
                    direction=TradeoffDirection.GOOD,
                )
            )
    return tradeoffs
