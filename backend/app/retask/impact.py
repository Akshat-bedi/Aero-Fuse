"""Impact analysis for the B6a rule slice (< 300 ms per event).

A pure function mapping an already-applied ``OpsEvent`` to the missions whose
current plan is affected. It never mutates the live state: the frontend turns
``impactedMissionIds`` into ``at-risk`` badges itself, and the recommendation
pipeline is what would later change the plan (only after commander approval).
"""

from __future__ import annotations

from app.domain import (
    AircraftUnserviceablePayload,
    BaseClosedPayload,
    CrewUnavailablePayload,
    ImpactAnalysis,
    Mission,
    MissionStatus,
    NewPriorityMissionPayload,
    OpsEvent,
    Threat,
    ThreatDetectedPayload,
    WeatherDegradedPayload,
    parse_timestamp,
)
from app.retask import geometry_lite
from app.state.store import StateStore

DEFAULT_TIME_TO_DECISION_MIN = 5.0
_ACTIVE_STATUSES = frozenset(
    {
        MissionStatus.PLANNED,
        MissionStatus.APPROVED,
        MissionStatus.IN_PROGRESS,
        MissionStatus.AT_RISK,
    }
)


def analyse_impact(event: OpsEvent, state: StateStore) -> ImpactAnalysis:
    """Derive the impact payload for an event from the canonical state."""
    payload = event.payload
    impacted: list[str] = []
    reasons: list[str] = []
    urgent: str | None = None

    if isinstance(payload, ThreatDetectedPayload):
        impacted, reasons = _threat_impact(event, state, payload)
        urgent = _most_urgent(state, impacted)
    elif isinstance(payload, AircraftUnserviceablePayload):
        impacted, reasons = _aircraft_impact(state, payload)
        urgent = _most_urgent(state, impacted)
    elif isinstance(payload, BaseClosedPayload):
        impacted, reasons = _base_impact(state, payload)
        urgent = _most_urgent(state, impacted)
    elif isinstance(payload, WeatherDegradedPayload):
        impacted, reasons = _weather_impact(state, payload)
        urgent = _most_urgent(state, impacted)
    elif isinstance(payload, CrewUnavailablePayload):
        impacted, reasons = _crew_impact(state, payload)
        urgent = _most_urgent(state, impacted)
    elif isinstance(payload, NewPriorityMissionPayload):
        impacted, reasons, urgent = _priority_mission_impact(event, state, payload)

    if not reasons:
        reasons = [f"No active sorties are affected by {event.id} ({event.type.value})."]

    return ImpactAnalysis(
        event_id=event.id,
        event_type=event.type,
        impacted_mission_ids=impacted,
        reasons=reasons,
        most_urgent=urgent,
        time_to_decision_min=DEFAULT_TIME_TO_DECISION_MIN,
    )


def find_injected_threat(event: OpsEvent, state: StateStore) -> Threat | None:
    """Public lookup for the threat record created by a ``THREAT_DETECTED`` event."""
    payload = event.payload
    if not isinstance(payload, ThreatDetectedPayload):
        return None
    return _injected_threat(event, state, payload)


def _threat_impact(
    event: OpsEvent, state: StateStore, payload: ThreatDetectedPayload
) -> tuple[list[str], list[str]]:
    threat = _injected_threat(event, state, payload)
    if threat is None:
        return [], [f"Threat {event.id} was recorded but could not be matched to a state entry."]

    impacted: list[str] = []
    reasons: list[str] = []
    for mission in _active_missions(state):
        base = state.bases.get(mission.launch_base_id)
        points = geometry_lite.clearance_points(mission, base.location if base else None)
        exposure = geometry_lite.route_exposure_km(points, threat)
        if exposure <= 0.0 and not geometry_lite.route_intersects(points, threat):
            continue
        impacted.append(mission.id)
        reasons.append(
            f"{mission.name} ({mission.id}) route intersects {threat.id} "
            f"({threat.type.value}, {threat.range_km:g} km); "
            f"exposure {max(exposure, 0.1):.1f} km."
        )
    return impacted, reasons


def _aircraft_impact(
    state: StateStore, payload: AircraftUnserviceablePayload
) -> tuple[list[str], list[str]]:
    impacted: list[str] = []
    reasons: list[str] = []
    for mission in _active_missions(state):
        if payload.aircraft_id not in mission.assigned.aircraft_ids:
            continue
        impacted.append(mission.id)
        reasons.append(
            f"{mission.name} ({mission.id}) is assigned airframe {payload.aircraft_id}, "
            f"declared unserviceable ({payload.reason})."
        )
    return impacted, reasons


def _base_impact(state: StateStore, payload: BaseClosedPayload) -> tuple[list[str], list[str]]:
    base = state.bases.get(payload.base_id)
    impacted: list[str] = []
    reasons: list[str] = []
    for mission in _active_missions(state):
        launches = mission.launch_base_id == payload.base_id
        recovers = (
            base is not None
            and bool(mission.route)
            and geometry_lite.distance_km(mission.route[-1], base.location) <= 1.0
        )
        if not launches and not recovers:
            continue
        impacted.append(mission.id)
        if launches and recovers:
            phase = "launches and recovers"
        elif launches:
            phase = "launches"
        else:
            phase = "recovers"
        reasons.append(
            f"{mission.name} ({mission.id}) {phase} at {payload.base_id}, "
            f"whose runway is {payload.runway_status.value}."
        )
    return impacted, reasons


def _weather_impact(
    state: StateStore, payload: WeatherDegradedPayload
) -> tuple[list[str], list[str]]:
    if payload.base_id is not None:
        affected_bases = {payload.base_id}
    else:
        affected_bases = {
            weather.base_id
            for weather in state.weather.values()
            if weather.base_id is not None and weather.region == payload.region
        }

    impacted: list[str] = []
    reasons: list[str] = []
    for mission in _active_missions(state):
        launches = mission.launch_base_id in affected_bases
        recovery_base_id = next(
            (
                base_id
                for base_id in sorted(affected_bases)
                if (base := state.bases.get(base_id)) is not None
                and bool(mission.route)
                and geometry_lite.distance_km(mission.route[-1], base.location) <= 1.0
            ),
            None,
        )
        if not launches and recovery_base_id is None:
            continue
        impacted.append(mission.id)
        base_id = mission.launch_base_id if launches else recovery_base_id
        if launches and recovery_base_id is not None:
            phase = "launches and recovers at"
        elif launches:
            phase = "operates from"
        else:
            phase = "recovers at"
        reasons.append(
            f"{mission.name} ({mission.id}) {phase} {base_id}, "
            f"where weather is {payload.severity.value} below operating minima."
        )
    return impacted, reasons


def _crew_impact(
    state: StateStore, payload: CrewUnavailablePayload
) -> tuple[list[str], list[str]]:
    crew = state.crew.get(payload.crew_id)
    label = f"{payload.crew_id} {crew.callsign}" if crew else payload.crew_id
    impacted: list[str] = []
    reasons: list[str] = []
    for mission in _active_missions(state):
        if payload.crew_id not in mission.assigned.crew_ids:
            continue
        impacted.append(mission.id)
        reasons.append(
            f"{mission.name} ({mission.id}) is assigned crew {label}, "
            f"who is unavailable ({payload.reason})."
        )
    return impacted, reasons


def _priority_mission_impact(
    event: OpsEvent, state: StateStore, payload: NewPriorityMissionPayload
) -> tuple[list[str], list[str], str | None]:
    new_mission = _new_priority_mission(event, state, payload)
    urgent = new_mission.id if new_mission is not None else None
    candidates: list[Mission] = [
        mission
        for mission in _active_missions(state)
        if mission.priority > payload.priority
        and mission.required_aircraft_type == payload.required_aircraft_type
        and mission.status in {MissionStatus.PLANNED, MissionStatus.APPROVED}
    ]
    candidates.sort(key=lambda mission: (mission.priority, mission.window_start, mission.id))
    impacted = [mission.id for mission in candidates]
    reasons: list[str] = []
    if candidates:
        for mission in candidates:
            reasons.append(
                f"{mission.name} ({mission.id}, P{mission.priority}) is a lower-priority "
                f"sortie that can be displaced by P{payload.priority} '{payload.name}'."
            )
    else:
        reasons.append(
            f"No lower-priority {payload.required_aircraft_type.value} sortie is available "
            f"to pre-empt for P{payload.priority} '{payload.name}'."
        )
    return impacted, reasons, urgent


def _active_missions(state: StateStore) -> list[Mission]:
    return [
        mission
        for mission in state.missions.values()
        if mission.status in _ACTIVE_STATUSES
    ]


def _most_urgent(state: StateStore, mission_ids: list[str]) -> str | None:
    missions = [state.missions[mid] for mid in mission_ids if mid in state.missions]
    if not missions:
        return None
    missions.sort(
        key=lambda mission: (
            mission.priority,
            parse_timestamp(mission.window_start),
            mission.id,
        )
    )
    return missions[0].id


def _injected_threat(
    event: OpsEvent, state: StateStore, payload: ThreatDetectedPayload
) -> Threat | None:
    """Find the threat record created by this event (highest matching id)."""
    matches = [
        threat
        for threat in state.threats.values()
        if threat.position.lat == payload.position.lat
        and threat.position.lng == payload.position.lng
        and threat.range_km == payload.range_km
        and threat.type == payload.threat_type
    ]
    if not matches:
        return None
    matches.sort(key=lambda threat: _numeric_suffix(threat.id), reverse=True)
    return matches[0]


def _new_priority_mission(
    event: OpsEvent, state: StateStore, payload: NewPriorityMissionPayload
) -> Mission | None:
    """Locate the mission created by a ``NEW_PRIORITY_MISSION`` event."""
    exact = [
        mission
        for mission in state.missions.values()
        if mission.window_start == event.timestamp and mission.name == payload.name
    ]
    if exact:
        exact.sort(key=lambda mission: _numeric_suffix(mission.id), reverse=True)
        return exact[0]
    missions = list(state.missions.values())
    if not missions:
        return None
    missions.sort(key=lambda mission: _numeric_suffix(mission.id), reverse=True)
    return missions[0]


def _numeric_suffix(entity_id: str) -> int:
    suffix = entity_id.rsplit("-", 1)[-1]
    return int(suffix) if suffix.isdigit() else 0
