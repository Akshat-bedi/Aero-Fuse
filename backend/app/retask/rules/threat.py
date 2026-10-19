"""Threat-detected rule: reroute affected sorties around the engagement ring."""

from __future__ import annotations

from app.domain import Change, ChangeKind, Mission, OpsEvent, ThreatDetectedPayload
from app.retask import geometry_lite
from app.retask.impact import find_injected_threat
from app.retask.rules.common import CandidatePlan
from app.state.store import StateStore


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, ThreatDetectedPayload):
        return CandidatePlan(profile=profile, failure="event is not a threat detection")

    threat = find_injected_threat(event, state)
    if threat is None:
        return CandidatePlan(
            profile=profile,
            failure=f"injected threat for {event.id} was not found in state",
        )

    plan = CandidatePlan(profile=profile)
    for mission_id in impacted:
        mission = state.missions.get(mission_id)
        if mission is None:
            continue
        base = state.bases.get(mission.launch_base_id)
        current_points = geometry_lite.clearance_points(
            mission, base.location if base else None
        )
        current_exposure = geometry_lite.route_exposure_km(current_points, threat)
        current_route_id = geometry_lite.route_option_id_for(mission)
        assessments = geometry_lite.assess_route_options(
            mission, threat, base.location if base else None
        )
        if not assessments:
            if current_exposure > 0.0:
                plan.relaxed.append(
                    f"{mission.id} has no alternate route options and remains inside "
                    f"{threat.id}; exposure {current_exposure:.1f} km accepted."
                )
            continue

        clear = [assessment for assessment in assessments if assessment.clears]
        if clear:
            chosen = _choose_clear(clear, current_route_id, profile)
            if chosen.option.id == current_route_id:
                continue
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.REROUTE,
                    before=current_route_id,
                    after=chosen.option.id,
                    note=(
                        f"{chosen.option.id} clears {threat.id} "
                        f"({_display_distance(chosen)})"
                    ),
                )
            )
            plan.explanations.append(
                f"{mission.id} {mission.name} currently crosses {threat.id} "
                f"({threat.type.value}, {threat.range_km:g} km ring, "
                f"{current_exposure:.1f} km exposure); {chosen.option.id} clears it "
                f"({_display_distance(chosen)})."
            )
            continue

        best = min(assessments, key=lambda item: (item.exposure_km, item.distance_km))
        if (
            best.option.id != current_route_id
            and best.exposure_km + 1e-6 < current_exposure
            and current_exposure > 0.0
        ):
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.REROUTE,
                    before=current_route_id,
                    after=best.option.id,
                    note=f"{best.option.id} reduces threat exposure",
                )
            )
            plan.relaxed.append(
                f"{mission.id} has no fully clearing option; {best.option.id} reduces "
                f"{threat.id} exposure from {current_exposure:.1f} km to "
                f"{best.exposure_km:.1f} km."
            )
            plan.explanations.append(
                f"{mission.id} {mission.name} cannot fully clear {threat.id}; "
                f"{best.option.id} is the least-exposed option."
            )
        else:
            plan.relaxed.append(
                f"{mission.id} has no threat-clearing option; {current_route_id} "
                f"remains inside {threat.id} (exposure {current_exposure:.1f} km) and "
                "the risk is accepted."
            )

    if not plan.changes and not plan.relaxed:
        plan.explanations.append(
            f"No active sortie's route intersects {threat.id}; no reroute required."
        )
    return plan


def _choose_clear(
    clear: list[geometry_lite.RouteAssessment], current_route_id: str, profile: str
) -> geometry_lite.RouteAssessment:
    if profile == "min_risk":
        return min(
            clear,
            key=lambda item: (
                item.option.risk_score if item.option.risk_score is not None else 100.0,
                item.distance_km,
                item.option.id,
            ),
        )
    if profile == "max_coverage":
        return min(
            clear,
            key=lambda item: (
                0 if item.option.id == current_route_id else 1,
                item.option.risk_score if item.option.risk_score is not None else 100.0,
                item.distance_km,
                item.option.id,
            ),
        )
    return min(clear, key=lambda item: (item.distance_km, item.option.id))


def _display_distance(assessment: geometry_lite.RouteAssessment) -> str:
    distance = (
        assessment.option.distance_km
        if assessment.option.distance_km is not None
        else assessment.distance_km
    )
    risk = assessment.option.risk_score
    if risk is None:
        return f"{distance:g} km"
    return f"{distance:g} km, risk {risk:g}"


def _mission_label(mission: Mission) -> str:
    return f"{mission.id} {mission.name}"
