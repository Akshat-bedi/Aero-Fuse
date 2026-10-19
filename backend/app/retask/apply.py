"""Pure plan application: compute the post-decision state without touching live.

``apply_changes`` returns a deep copy of the canonical state with the ordered
``Change`` list applied. B8a reuses this for approved/modified decisions;
B6a uses it to evaluate and validate candidate plans. The live store is never
mutated here.

Change semantics (also documented in ``backend/docs/RETASK_RULES.md``):

- ``aircraft_swap`` / ``crew_swap``: ``before`` and ``after`` are entity ids.
- ``reroute``: ``after`` is a route-option id (``Route C``) or a base id for a
  launch-base relocation / recovery diversion; ``before`` is the previous route
  id or base id.
- ``delay``: ``after`` is the new ISO window start; the window keeps its
  duration (end shifts by the same delta).
- ``cancel``: cancels the mission, frees its assigned resources.
- ``new_assignment``: ``after`` is ``{"aircraftIds": [...], "crewIds": [...]}``;
  the mission becomes ``approved`` so the sim launches it at its window.
"""

from __future__ import annotations

from typing import Any

from app.domain import (
    AircraftStatus,
    Change,
    ChangeKind,
    CrewStatus,
    LatLng,
    Mission,
    MissionStatus,
    RouteOption,
    parse_timestamp,
    to_iso_z,
)
from app.retask import geometry_lite
from app.state.store import StateStore


class PlanApplicationError(ValueError):
    """A change references an entity or shape the plan cannot apply."""


def apply_changes(state: StateStore, changes: list[Change]) -> StateStore:
    """Return a copy of ``state`` with ``changes`` applied in order."""
    planned = state.copy()
    for change in changes:
        _apply_change(planned, change)
    return planned


def _apply_change(state: StateStore, change: Change) -> None:
    mission = state.missions.get(change.mission_id)
    if mission is None:
        raise PlanApplicationError(f"unknown mission: {change.mission_id}")

    if change.kind is ChangeKind.AIRCRAFT_SWAP:
        _swap_aircraft(
            state,
            mission,
            _as_id(change.before, "before"),
            _as_id(change.after, "after"),
        )
    elif change.kind is ChangeKind.CREW_SWAP:
        _swap_crew(
            state,
            mission,
            _as_id(change.before, "before"),
            _as_id(change.after, "after"),
        )
    elif change.kind is ChangeKind.REROUTE:
        _reroute(state, mission, _as_id(change.before, "before"), _as_id(change.after, "after"))
    elif change.kind is ChangeKind.DELAY:
        _delay(mission, _as_id(change.after, "after"))
    elif change.kind is ChangeKind.CANCEL:
        _cancel(state, mission)
    elif change.kind is ChangeKind.NEW_ASSIGNMENT:
        _new_assignment(state, mission, _as_mapping(change.after))


def _swap_aircraft(state: StateStore, mission: Mission, old_id: str, new_id: str) -> None:
    replacement = state.aircraft.get(new_id)
    if replacement is None:
        raise PlanApplicationError(f"unknown aircraft: {new_id}")
    if new_id not in mission.assigned.aircraft_ids:
        mission.assigned.aircraft_ids = [
            aircraft_id for aircraft_id in mission.assigned.aircraft_ids if aircraft_id != old_id
        ]
        mission.assigned.aircraft_ids.append(new_id)
    mission.assigned.aircraft_ids.sort()
    old = state.aircraft.get(old_id)
    if old is not None and old.assigned_mission_id == mission.id:
        old.assigned_mission_id = None
    replacement.assigned_mission_id = mission.id
    if (
        mission.status is MissionStatus.IN_PROGRESS
        and old is not None
        and old.status is AircraftStatus.AIRBORNE
        and old.position is not None
    ):
        replacement.status = AircraftStatus.AIRBORNE
        replacement.position = old.position
        replacement.heading = old.heading
        replacement.speed = old.speed
    elif replacement.status is AircraftStatus.SERVICEABLE:
        replacement.position = None
        replacement.heading = None
        replacement.speed = 0.0


def _swap_crew(state: StateStore, mission: Mission, old_id: str, new_id: str) -> None:
    replacement = state.crew.get(new_id)
    if replacement is None:
        raise PlanApplicationError(f"unknown crew: {new_id}")
    if new_id not in mission.assigned.crew_ids:
        mission.assigned.crew_ids = [
            crew_id for crew_id in mission.assigned.crew_ids if crew_id != old_id
        ]
        mission.assigned.crew_ids.append(new_id)
    mission.assigned.crew_ids.sort()
    old = state.crew.get(old_id)
    if old is not None and old.status is CrewStatus.ON_MISSION and old_id not in {
        crew_id
        for other in state.missions.values()
        if other.id != mission.id
        for crew_id in other.assigned.crew_ids
    }:
        old.status = CrewStatus.AVAILABLE
    if mission.status is MissionStatus.IN_PROGRESS:
        replacement.status = CrewStatus.ON_MISSION


def _reroute(state: StateStore, mission: Mission, before: str, after: str) -> None:
    option = geometry_lite.route_option_for(mission, after)
    if option is not None:
        _apply_route_option(state, mission, option)
        return
    if after in state.bases:
        _apply_base_change(state, mission, before, after)
        return
    raise PlanApplicationError(f"reroute target is neither a route option nor a base: {after}")


def _apply_route_option(state: StateStore, mission: Mission, option: RouteOption) -> None:
    waypoints: list[LatLng] = list(option.waypoints)
    position = _lead_position(state, mission)
    if mission.status is MissionStatus.IN_PROGRESS and position is not None:
        index = geometry_lite.nearest_waypoint_index(waypoints, position)
        rotated = waypoints[index:] + waypoints[:index]
        mission.route = [position, *rotated]
        mission.current_waypoint_index = 0
    else:
        mission.route = waypoints
        mission.current_waypoint_index = None


def _apply_base_change(state: StateStore, mission: Mission, before: str, after: str) -> None:
    old_base = state.bases.get(before)
    new_base = state.bases[after]
    mission.launch_base_id = after
    for aircraft_id in mission.assigned.aircraft_ids:
        airframe = state.aircraft.get(aircraft_id)
        if airframe is not None:
            airframe.base_id = after
    for crew_id in mission.assigned.crew_ids:
        member = state.crew.get(crew_id)
        if member is not None:
            member.base_id = after
    if mission.status is MissionStatus.IN_PROGRESS:
        return
    if old_base is None:
        return
    mission.route = [
        new_base.location if geometry_lite.distance_km(point, old_base.location) <= 1.0 else point
        for point in mission.route
    ]
    mission.current_waypoint_index = None


def _delay(mission: Mission, new_start: str) -> None:
    old_start = parse_timestamp(mission.window_start)
    old_end = parse_timestamp(mission.window_end)
    delta = parse_timestamp(new_start) - old_start
    if delta.total_seconds() == 0:
        return
    mission.window_start = new_start
    mission.window_end = to_iso_z(old_end + delta)


def _cancel(state: StateStore, mission: Mission) -> None:
    mission.status = MissionStatus.CANCELLED
    for aircraft_id in mission.assigned.aircraft_ids:
        airframe = state.aircraft.get(aircraft_id)
        if airframe is not None and airframe.assigned_mission_id == mission.id:
            airframe.assigned_mission_id = None
            if airframe.status is AircraftStatus.AIRBORNE:
                airframe.status = AircraftStatus.SERVICEABLE
                airframe.speed = 0.0
    for crew_id in mission.assigned.crew_ids:
        member = state.crew.get(crew_id)
        if member is not None and member.status is CrewStatus.ON_MISSION:
            member.status = CrewStatus.AVAILABLE
    mission.assigned.aircraft_ids = []
    mission.assigned.crew_ids = []


def _new_assignment(state: StateStore, mission: Mission, after: dict[str, Any]) -> None:
    raw_aircraft = after.get("aircraftIds", [])
    raw_crew = after.get("crewIds", [])
    if not isinstance(raw_aircraft, list) or not isinstance(raw_crew, list):
        raise PlanApplicationError("new_assignment requires aircraftIds/crewIds arrays")
    aircraft_ids = [str(item) for item in raw_aircraft]
    crew_ids = [str(item) for item in raw_crew]
    for aircraft_id in aircraft_ids:
        airframe = state.aircraft.get(aircraft_id)
        if airframe is None:
            raise PlanApplicationError(f"unknown aircraft: {aircraft_id}")
        airframe.assigned_mission_id = mission.id
    for crew_id in crew_ids:
        if crew_id not in state.crew:
            raise PlanApplicationError(f"unknown crew: {crew_id}")
    mission.assigned.aircraft_ids = sorted(aircraft_ids)
    mission.assigned.crew_ids = sorted(crew_ids)
    mission.status = MissionStatus.APPROVED


def _lead_position(state: StateStore, mission: Mission) -> LatLng | None:
    positions = [
        airframe.position
        for aircraft_id in sorted(mission.assigned.aircraft_ids)
        if (airframe := state.aircraft.get(aircraft_id)) is not None
        and airframe.position is not None
        and airframe.status is AircraftStatus.AIRBORNE
    ]
    return positions[0] if positions else None


def _as_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise PlanApplicationError(f"change {field} must be a non-empty string")
    return value


def _as_mapping(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PlanApplicationError("change after must be an object for new_assignment")
    return value
