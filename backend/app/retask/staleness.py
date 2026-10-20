"""Recommendation staleness and expiry for B8a.

A recommendation is pinned to the state version it was computed from. When a
later committed change touches an entity it depends on — its assigned airframes
or crews, an affected mission's plan, a launch base's runway, a tracked threat,
or a newly detected threat that intersects a dependent route — the pending
recommendation becomes ``stale`` and is broadcast again. Tick-only deltas
(position, fuel, clock) never notify the store and therefore never stale a
recommendation.

Pending recommendations also expire after ``RECO_TTL_MIN`` sim minutes. Both
transitions write a hash-chained audit entry.
"""

from __future__ import annotations

import contextlib
import threading
from dataclasses import dataclass, field
from datetime import timedelta
from typing import TYPE_CHECKING

from app.domain import (
    Aircraft,
    Base,
    ChangeKind,
    Crew,
    Mission,
    Recommendation,
    RecommendationStatus,
    Threat,
    ThreatDetectedPayload,
    parse_timestamp,
    to_iso_z,
)
from app.retask import geometry_lite
from app.retask.apply import PlanApplicationError, apply_changes
from app.retask.impact import find_injected_threat
from app.state.store import StateChange

if TYPE_CHECKING:
    from app.runtime import SimRuntime


@dataclass
class _Dependencies:
    version: int
    mission_ids: set[str] = field(default_factory=set)
    aircraft_ids: set[str] = field(default_factory=set)
    crew_ids: set[str] = field(default_factory=set)
    base_ids: set[str] = field(default_factory=set)
    known_threat_ids: set[str] = field(default_factory=set)
    missions: dict[str, Mission] = field(default_factory=dict)
    aircraft: dict[str, Aircraft] = field(default_factory=dict)
    crew: dict[str, Crew] = field(default_factory=dict)
    bases: dict[str, Base] = field(default_factory=dict)
    threats: dict[str, Threat] = field(default_factory=dict)


class StalenessTracker:
    """Tracks dependencies, marks recommendations stale and expires them."""

    def __init__(self, runtime: SimRuntime, ttl_minutes: int) -> None:
        self.runtime = runtime
        self.ttl = timedelta(minutes=ttl_minutes)
        self._dependencies: dict[str, _Dependencies] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------- lifecycle

    def reset(self) -> None:
        with self._lock:
            self._dependencies.clear()

    def forget(self, recommendation_id: str) -> None:
        with self._lock:
            self._dependencies.pop(recommendation_id, None)

    # ------------------------------------------------------------ dependency

    def register(self, recommendation: Recommendation) -> None:
        """Snapshot the proposed plan the recommendation depends on."""
        live = self.runtime.store
        state = live
        with contextlib.suppress(PlanApplicationError):
            state = apply_changes(live, recommendation.changes)
        dependencies = _Dependencies(version=live.version)

        mission_ids = set(recommendation.impacted_mission_ids)
        for change in recommendation.changes:
            mission_ids.add(change.mission_id)
        for mission_id in mission_ids:
            mission = state.missions.get(mission_id)
            if mission is None:
                continue
            dependencies.mission_ids.add(mission_id)
            dependencies.missions[mission_id] = mission.model_copy(deep=True)
            dependencies.base_ids.add(mission.launch_base_id)
            dependencies.aircraft_ids.update(mission.assigned.aircraft_ids)
            dependencies.crew_ids.update(mission.assigned.crew_ids)

        for change in recommendation.changes:
            if change.kind is ChangeKind.AIRCRAFT_SWAP:
                for value in (change.before, change.after):
                    if isinstance(value, str) and value in state.aircraft:
                        dependencies.aircraft_ids.add(value)
            elif change.kind is ChangeKind.CREW_SWAP:
                for value in (change.before, change.after):
                    if isinstance(value, str) and value in state.crew:
                        dependencies.crew_ids.add(value)
            elif change.kind is ChangeKind.REROUTE:
                if isinstance(change.after, str) and change.after in state.bases:
                    dependencies.base_ids.add(change.after)
            elif change.kind is ChangeKind.NEW_ASSIGNMENT and isinstance(change.after, dict):
                raw_aircraft = change.after.get("aircraftIds", [])
                raw_crew = change.after.get("crewIds", [])
                if isinstance(raw_aircraft, list):
                    dependencies.aircraft_ids.update(
                        str(item) for item in raw_aircraft if str(item) in state.aircraft
                    )
                if isinstance(raw_crew, list):
                    dependencies.crew_ids.update(
                        str(item) for item in raw_crew if str(item) in state.crew
                    )

        for aircraft_id in dependencies.aircraft_ids:
            aircraft = state.aircraft.get(aircraft_id)
            if aircraft is not None:
                dependencies.aircraft[aircraft_id] = aircraft.model_copy(deep=True)
                dependencies.base_ids.add(aircraft.base_id)
        for crew_id in dependencies.crew_ids:
            member = state.crew.get(crew_id)
            if member is not None:
                dependencies.crew[crew_id] = member.model_copy(deep=True)
                dependencies.base_ids.add(member.base_id)
        for base_id in dependencies.base_ids:
            base = state.bases.get(base_id)
            if base is not None:
                dependencies.bases[base_id] = base.model_copy(deep=True)

        event = self.runtime.event_by_id(recommendation.trigger_event_id)
        if event is not None and isinstance(event.payload, ThreatDetectedPayload):
            threat = find_injected_threat(event, state)
            if threat is not None:
                dependencies.threats[threat.id] = threat.model_copy(deep=True)
        dependencies.known_threat_ids = set(state.threats)
        with self._lock:
            self._dependencies[recommendation.id] = dependencies

    # ---------------------------------------------------------------- checks

    def on_state_change(self, change: StateChange) -> None:
        """Called synchronously after a committed, version-bumping change."""
        if change.kind == "reset":
            self.reset()
            return
        stale: list[tuple[str, str]] = []
        with self._lock:
            for recommendation_id, dependencies in list(self._dependencies.items()):
                recommendation = self.runtime.store.recommendations.get(recommendation_id)
                if (
                    recommendation is None
                    or recommendation.status is not RecommendationStatus.PENDING
                ):
                    self._dependencies.pop(recommendation_id, None)
                    continue
                reason = self._stale_reason(recommendation_id, dependencies, change)
                if reason is not None:
                    stale.append((recommendation_id, reason))
                    self._dependencies.pop(recommendation_id, None)
        for recommendation_id, reason in stale:
            self._mark_stale(recommendation_id, reason)

    def expire_due(self, now: str) -> None:
        """Expire pending recommendations older than the configured TTL."""
        now_dt = parse_timestamp(now)
        expired: list[tuple[str, str]] = []
        with self._lock:
            for recommendation_id, recommendation in self.runtime.store.recommendations.items():
                if recommendation.status is not RecommendationStatus.PENDING:
                    self._dependencies.pop(recommendation_id, None)
                    continue
                created = parse_timestamp(recommendation.created_at)
                if now_dt - created < self.ttl:
                    continue
                expired.append((recommendation_id, to_iso_z(created + self.ttl)))
                self._dependencies.pop(recommendation_id, None)
        for recommendation_id, deadline in expired:
            expiring = self.runtime.store.recommendations.get(recommendation_id)
            if expiring is None or expiring.status is not RecommendationStatus.PENDING:
                continue
            expiring.status = RecommendationStatus.EXPIRED
            self.runtime.forget_approval(expiring)
            version = self.runtime.store.version
            self.runtime.broadcast_recommendation(expiring, version)
            self.runtime.append_audit_sync(
                operator="SYSTEM",
                action="RECOMMENDATION_EXPIRED",
                target_id=expiring.id,
                details=(
                    f"{expiring.id} expired at {deadline}; "
                    "no commander decision was recorded within the TTL."
                ),
                state_version=version,
            )

    # -------------------------------------------------------------- internals

    def _stale_reason(
        self, recommendation_id: str, dependencies: _Dependencies, change: StateChange
    ) -> str | None:
        state = self.runtime.store
        changed = change.changed

        for mission_id in changed.get("missions", []):
            if mission_id not in dependencies.missions:
                continue
            mission_before = dependencies.missions[mission_id]
            mission_after = state.missions.get(mission_id)
            if mission_after is None:
                return f"Dependent mission {mission_id} was removed."
            if _mission_signature(mission_before) != _mission_signature(mission_after):
                return (
                    f"Dependent mission {mission_id} changed after {recommendation_id} "
                    "was generated."
                )

        for aircraft_id in changed.get("aircraft", []):
            if aircraft_id not in dependencies.aircraft:
                continue
            aircraft_before = dependencies.aircraft[aircraft_id]
            aircraft_after = state.aircraft.get(aircraft_id)
            if aircraft_after is None or _aircraft_signature(
                aircraft_before
            ) != _aircraft_signature(aircraft_after):
                return (
                    f"Dependent aircraft {aircraft_id} changed after "
                    f"{recommendation_id} was generated."
                )

        for crew_id in changed.get("crew", []):
            if crew_id not in dependencies.crew:
                continue
            crew_before = dependencies.crew[crew_id]
            crew_after = state.crew.get(crew_id)
            if crew_after is None or _crew_signature(crew_before) != _crew_signature(
                crew_after
            ):
                return (
                    f"Dependent crew {crew_id} changed after "
                    f"{recommendation_id} was generated."
                )

        for base_id in changed.get("bases", []):
            if base_id not in dependencies.bases:
                continue
            base_before = dependencies.bases[base_id]
            base_after = state.bases.get(base_id)
            if (
                base_after is None
                or base_before.runway_status is not base_after.runway_status
            ):
                return (
                    f"Dependent base {base_id} runway status changed after "
                    f"{recommendation_id} was generated."
                )

        for threat_id in changed.get("threats", []):
            if threat_id in dependencies.threats:
                before_threat = dependencies.threats[threat_id]
                after_threat = state.threats.get(threat_id)
                if (
                    after_threat is not None
                    and before_threat.status is not after_threat.status
                ):
                    return (
                        f"Dependent threat {threat_id} changed status after "
                        f"{recommendation_id} was generated."
                    )

        new_threat_ids = [
            threat_id
            for threat_id in changed.get("threats", [])
            if threat_id not in dependencies.known_threat_ids
        ]
        for threat_id in new_threat_ids:
            threat = state.threats.get(threat_id)
            if threat is None:
                continue
            for mission_id in dependencies.mission_ids:
                mission = dependencies.missions.get(mission_id)
                if mission is None:
                    continue
                base = dependencies.bases.get(mission.launch_base_id)
                points = geometry_lite.clearance_points(
                    mission, base.location if base is not None else None
                )
                if geometry_lite.route_intersects(points, threat):
                    return (
                        f"New threat {threat.id} intersects dependent mission "
                        f"{mission_id}; {recommendation_id} must be re-evaluated."
                    )
        return None

    def _mark_stale(self, recommendation_id: str, reason: str) -> None:
        recommendation = self.runtime.store.recommendations.get(recommendation_id)
        if (
            recommendation is None
            or recommendation.status is not RecommendationStatus.PENDING
        ):
            return
        recommendation.status = RecommendationStatus.STALE
        self.runtime.forget_approval(recommendation)
        version = self.runtime.store.version
        self.runtime.broadcast_recommendation(recommendation, version)
        self.runtime.append_audit_sync(
            operator="SYSTEM",
            action="RECOMMENDATION_STALE",
            target_id=recommendation.id,
            details=reason,
            state_version=version,
        )


def _mission_signature(mission: Mission) -> tuple[object, ...]:
    return (
        mission.status,
        tuple(mission.assigned.aircraft_ids),
        tuple(mission.assigned.crew_ids),
        mission.launch_base_id,
        mission.window_start,
        mission.window_end,
        tuple((point.lat, point.lng) for point in mission.route),
        mission.current_waypoint_index,
    )


def _aircraft_signature(aircraft: Aircraft) -> tuple[object, ...]:
    return (
        aircraft.status,
        aircraft.assigned_mission_id,
        aircraft.base_id,
        aircraft.fuel_pct,
    )


def _crew_signature(member: Crew) -> tuple[object, ...]:
    return (member.status, member.base_id)
