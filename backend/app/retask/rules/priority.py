"""New-priority-mission rule: assign a ready airframe and qualified crew."""

from __future__ import annotations

from app.domain import (
    Aircraft,
    AircraftStatus,
    Change,
    ChangeKind,
    Crew,
    CrewStatus,
    Mission,
    MissionStatus,
    NewPriorityMissionPayload,
    OpsEvent,
)
from app.retask import eligibility
from app.retask.apply import apply_changes
from app.retask.rules.common import CandidatePlan
from app.state.store import StateStore


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, NewPriorityMissionPayload):
        return CandidatePlan(profile=profile, failure="event is not a new priority mission")

    mission = _find_new_mission(event, state, payload)
    if mission is None:
        return CandidatePlan(
            profile=profile, failure=f"new mission '{payload.name}' was not found in state"
        )

    plan = CandidatePlan(profile=profile)
    working = state
    preempted: Mission | None = _preemption_target(state, mission)
    if preempted is not None:
        cancel = Change(
            mission_id=preempted.id,
            kind=ChangeKind.CANCEL,
            before=preempted.status.value,
            after="cancelled",
            note=f"pre-empted by P{int(mission.priority)} {mission.name}",
        )
        working = apply_changes(state, [cancel])
        plan.changes.append(cancel)
        plan.explanations.append(
            f"Pre-empted {preempted.id} {preempted.name} "
            f"(P{int(preempted.priority)}) to free a "
            f"{mission.required_aircraft_type.value} and crew for the new tasking."
        )
        plan.relaxed.append(
            f"{preempted.id} (P{int(preempted.priority)}) is cancelled to cover the "
            f"higher-priority {mission.id}."
        )

    aircraft = [
        airframe
        for airframe in eligibility.eligible_aircraft(working, mission)
        if airframe.status is AircraftStatus.SERVICEABLE
    ]
    crew = [
        member
        for member in eligibility.eligible_crew(working, mission)
        if member.status is CrewStatus.AVAILABLE
    ]

    if not aircraft or not crew:
        missing = "aircraft" if not aircraft else "crew"
        if int(mission.priority) <= 2:
            return CandidatePlan(
                profile=profile,
                failure=(
                    f"P{int(mission.priority)} {mission.id} {mission.name} cannot be "
                    f"tasked: no qualified {missing} is available."
                ),
            )
        plan.relaxed.append(
            f"{mission.id} ({mission.name}, P{int(mission.priority)}) remains unassigned: "
            f"no qualified {missing} is available."
        )
        plan.explanations.append(
            f"New P{int(mission.priority)} tasking {mission.name} is queued but not "
            f"assigned because no qualified {missing} can be freed."
        )
        return plan

    chosen_aircraft = _choose_aircraft(aircraft, mission, profile)
    chosen_crew = _choose_crew(crew, mission, profile)
    plan.changes.append(
        Change(
            mission_id=mission.id,
            kind=ChangeKind.NEW_ASSIGNMENT,
            before=None,
            after={
                "aircraftIds": [chosen_aircraft.id],
                "crewIds": [chosen_crew.id],
            },
            note=(
                f"Scramble {chosen_aircraft.id} ({chosen_aircraft.fuel_pct:.0f}% fuel) "
                f"and {chosen_crew.id} (fatigue {chosen_crew.fatigue_index:.0f})"
            ),
        )
    )
    plan.explanations.append(
        f"New tasking {mission.id} {mission.name} (P{int(mission.priority)}) gets "
        f"{chosen_aircraft.id} {chosen_aircraft.tail_number} from "
        f"{chosen_aircraft.base_id} and {chosen_crew.id} {chosen_crew.callsign} "
        f"(fatigue {chosen_crew.fatigue_index:.0f}, "
        f"duty {chosen_crew.duty_hours_last24h:.1f} h)."
    )
    if chosen_aircraft.base_id != mission.launch_base_id:
        plan.relaxed.append(
            f"{chosen_aircraft.id} is based at {chosen_aircraft.base_id}, not "
            f"{mission.launch_base_id}; a ferry leg is assumed."
        )
    return plan


def _preemption_target(state: StateStore, mission: Mission) -> Mission | None:
    candidates = [
        other
        for other in state.missions.values()
        if other.id != mission.id
        and other.status in {MissionStatus.PLANNED, MissionStatus.APPROVED}
        and other.required_aircraft_type == mission.required_aircraft_type
        and int(other.priority) > int(mission.priority)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda other: (-int(other.priority), other.window_start, other.id))
    return candidates[0]


def _find_new_mission(
    event: OpsEvent, state: StateStore, payload: NewPriorityMissionPayload
) -> Mission | None:
    matches = [
        mission
        for mission in state.missions.values()
        if mission.name == payload.name and mission.window_start == event.timestamp
    ]
    if matches:
        matches.sort(key=lambda mission: _suffix(mission.id), reverse=True)
        return matches[0]
    missions = list(state.missions.values())
    if not missions:
        return None
    missions.sort(key=lambda mission: _suffix(mission.id), reverse=True)
    return missions[0]


def _suffix(entity_id: str) -> int:
    suffix = entity_id.rsplit("-", 1)[-1]
    return int(suffix) if suffix.isdigit() else 0


def _choose_aircraft(
    candidates: list[Aircraft], mission: Mission, profile: str
) -> Aircraft:
    same_base_first = sorted(
        candidates,
        key=lambda airframe: (
            0 if airframe.base_id == mission.launch_base_id else 1,
            -airframe.fuel_pct,
            airframe.id,
        ),
    )
    if profile == "min_risk":
        return min(
            same_base_first,
            key=lambda airframe: (
                airframe.flight_hours_to_next_service,
                -airframe.fuel_pct,
                airframe.id,
            ),
        )
    if profile == "max_coverage":
        return min(
            same_base_first,
            key=lambda airframe: (-airframe.fuel_pct, airframe.id),
        )
    return same_base_first[0]


def _choose_crew(candidates: list[Crew], mission: Mission, profile: str) -> Crew:
    same_base_first = sorted(
        candidates,
        key=lambda member: (
            0 if member.base_id == mission.launch_base_id else 1,
            member.fatigue_index,
            member.id,
        ),
    )
    if profile == "min_risk":
        return min(
            same_base_first, key=lambda member: (member.fatigue_index, member.id)
        )
    if profile == "max_coverage":
        return min(
            same_base_first,
            key=lambda member: (member.duty_hours_last24h, member.id),
        )
    return same_base_first[0]
