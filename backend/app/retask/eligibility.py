"""Feasible-resource queries for the Modify workflow (B6a light checks).

These mirror the checks in ``validate.py`` but only answer "could this aircraft
or crew member fly the mission as currently routed?", sorted for the dropdowns:
same base first, then lowest fatigue / highest fuel, then id.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.domain import (
    Aircraft,
    AircraftStatus,
    Crew,
    CrewStatus,
    Mission,
    MissionStatus,
    parse_timestamp,
)
from app.retask import geometry_lite
from app.sim.movement import CRUISE_SPEED_KMH, FUEL_BURN_PCT_PER_HOUR, TURNAROUND_MINUTES
from app.state.store import StateStore

RESERVE_PCT = 15.0
_DUTY_LIMIT_H = 12.0
_ACTIVE = frozenset(
    {
        MissionStatus.PLANNED,
        MissionStatus.APPROVED,
        MissionStatus.IN_PROGRESS,
        MissionStatus.AT_RISK,
    }
)


def eligible_aircraft(state: StateStore, mission: Mission) -> list[Aircraft]:
    """Aircraft that could fly ``mission`` without violating the light checks."""
    required = mission.required_aircraft_type
    candidates: list[Aircraft] = []
    for airframe in state.aircraft.values():
        if airframe.type != required:
            continue
        allowed = {AircraftStatus.SERVICEABLE, AircraftStatus.TURNAROUND}
        if mission.status is MissionStatus.IN_PROGRESS:
            allowed.add(AircraftStatus.AIRBORNE)
        if airframe.status not in allowed:
            continue
        if not aircraft_free(state, airframe.id, mission):
            continue
        fuel_burn = _fuel_burn_pct(mission, airframe)
        if airframe.fuel_pct < fuel_burn + RESERVE_PCT:
            continue
        candidates.append(airframe)
    candidates.sort(
        key=lambda airframe: (
            0 if airframe.base_id == mission.launch_base_id else 1,
            -airframe.fuel_pct,
            airframe.id,
        )
    )
    return candidates


def eligible_crew(state: StateStore, mission: Mission) -> list[Crew]:
    """Crew that could fly ``mission`` (quals, duty, availability, no overlap)."""
    sortie_hours = _sortie_hours(mission)
    candidates: list[Crew] = []
    for member in state.crew.values():
        if member.status is not CrewStatus.AVAILABLE and not (
            member.id in mission.assigned.crew_ids
            and mission.status is MissionStatus.IN_PROGRESS
            and member.status is CrewStatus.ON_MISSION
        ):
            continue
        if not set(mission.required_crew_quals).issubset(set(member.qualifications)):
            continue
        if member.duty_hours_last24h + sortie_hours > _DUTY_LIMIT_H:
            continue
        if not crew_free(state, member.id, mission):
            continue
        candidates.append(member)
    candidates.sort(
        key=lambda member: (
            0 if member.base_id == mission.launch_base_id else 1,
            member.fatigue_index,
            member.id,
        )
    )
    return candidates


def aircraft_free(state: StateStore, aircraft_id: str, mission: Mission) -> bool:
    """No other active sortie books this airframe in the mission's window."""
    start = parse_timestamp(mission.window_start)
    end = parse_timestamp(mission.window_end)
    for other in state.missions.values():
        if other.id == mission.id or other.status not in _ACTIVE:
            continue
        if aircraft_id not in other.assigned.aircraft_ids:
            continue
        other_start = parse_timestamp(other.window_start)
        other_end = parse_timestamp(other.window_end)
        if _overlaps(start, end, other_start, other_end, turnaround_min=TURNAROUND_MINUTES):
            return False
    return True


def crew_free(state: StateStore, crew_id: str, mission: Mission) -> bool:
    """No other active sortie books this crew member in the mission's window."""
    start = parse_timestamp(mission.window_start)
    end = parse_timestamp(mission.window_end)
    for other in state.missions.values():
        if other.id == mission.id or other.status not in _ACTIVE:
            continue
        if crew_id not in other.assigned.crew_ids:
            continue
        other_start = parse_timestamp(other.window_start)
        other_end = parse_timestamp(other.window_end)
        if _overlaps(start, end, other_start, other_end, turnaround_min=0.0):
            return False
    return True


def _overlaps(
    start_a: datetime,
    end_a: datetime,
    start_b: datetime,
    end_b: datetime,
    *,
    turnaround_min: float,
) -> bool:
    gap = timedelta(minutes=turnaround_min)
    return start_a < end_b + gap and start_b < end_a + gap


def _sortie_hours(mission: Mission) -> float:
    start = parse_timestamp(mission.window_start)
    end = parse_timestamp(mission.window_end)
    return max((end - start).total_seconds() / 3600.0, 0.0)


def _fuel_burn_pct(mission: Mission, airframe: Aircraft) -> float:
    distance = geometry_lite.route_distance_km(list(mission.route))
    speed = CRUISE_SPEED_KMH.get(airframe.type, 600.0)
    burn_per_hour = FUEL_BURN_PCT_PER_HOUR.get(airframe.type, 8.0)
    return distance / speed * burn_per_hour
