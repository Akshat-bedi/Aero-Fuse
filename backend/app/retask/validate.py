"""Lightweight plan validator (B6a).

Independent of the rule engine: takes the current state plus a proposed
``Change`` list, applies it to a copy (``apply.py``) and re-checks the rules the
frontend also enforces (CONTEXT section 13 item 7), plus fuel and weapon stock:

- aircraft type match and readiness;
- no double-booked aircraft (45 min turnaround) or crew;
- crew qualifications and the 12 h duty limit;
- required weapons available at the launch base;
- estimated fuel + reserve.

Every recommendation emitted by the engine must pass this check. B5's CP-SAT
optimiser will use the same validator (and later the independent
``check_plan`` from the optimiser package).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.domain import (
    AircraftStatus,
    Change,
    Mission,
    MissionStatus,
    parse_timestamp,
)
from app.retask import geometry_lite
from app.retask.apply import PlanApplicationError, apply_changes
from app.sim.movement import CRUISE_SPEED_KMH, FUEL_BURN_PCT_PER_HOUR, TURNAROUND_MINUTES
from app.state.store import StateStore

RESERVE_PCT = 15.0
DUTY_LIMIT_H = 12.0
_ACTIVE = frozenset(
    {
        MissionStatus.PLANNED,
        MissionStatus.APPROVED,
        MissionStatus.IN_PROGRESS,
        MissionStatus.AT_RISK,
    }
)


def check_plan_lite(state: StateStore, changes: list[Change]) -> list[str]:
    """Return human-readable violations for the proposed changes (empty=valid)."""
    try:
        planned = apply_changes(state, changes)
    except PlanApplicationError as exc:
        return [str(exc)]

    violations: list[str] = []
    missions = _active_missions(planned)

    for mission in missions:
        violations.extend(_check_resources(planned, mission))

    violations.extend(_check_double_booked_aircraft(missions))
    violations.extend(_check_double_booked_crew(missions))
    violations.extend(_check_weapon_stocks(planned, missions))
    violations.extend(_check_fuel(planned, missions))

    unique: list[str] = []
    for violation in violations:
        if violation not in unique:
            unique.append(violation)
    return unique


def _check_resources(state: StateStore, mission: Mission) -> list[str]:
    violations: list[str] = []
    for aircraft_id in mission.assigned.aircraft_ids:
        airframe = state.aircraft.get(aircraft_id)
        if airframe is None:
            violations.append(f"{mission.id}: unknown aircraft {aircraft_id}.")
            continue
        if airframe.type != mission.required_aircraft_type:
            violations.append(
                f"{mission.id}: {aircraft_id} is a {airframe.type.value}, "
                f"mission requires {mission.required_aircraft_type.value}."
            )
        allowed = {AircraftStatus.SERVICEABLE, AircraftStatus.TURNAROUND}
        if mission.status is MissionStatus.IN_PROGRESS:
            allowed.add(AircraftStatus.AIRBORNE)
        if airframe.status not in allowed:
            violations.append(
                f"{mission.id}: {aircraft_id} is {airframe.status.value}, not ready for tasking."
            )
    for crew_id in mission.assigned.crew_ids:
        member = state.crew.get(crew_id)
        if member is None:
            violations.append(f"{mission.id}: unknown crew {crew_id}.")
            continue
        missing = sorted(set(mission.required_crew_quals) - set(member.qualifications))
        if missing:
            violations.append(
                f"{mission.id}: {crew_id} lacks required qualifications {', '.join(missing)}."
            )
        if member.duty_hours_last24h + _sortie_hours(mission) > DUTY_LIMIT_H:
            violations.append(
                f"{mission.id}: {crew_id} would exceed the 12 h duty limit "
                f"({member.duty_hours_last24h:.1f} h + {_sortie_hours(mission):.1f} h)."
            )
    return violations


def _check_double_booked_aircraft(missions: list[Mission]) -> list[str]:
    violations: list[str] = []
    ordered = sorted(missions, key=lambda mission: mission.id)
    gap = timedelta(minutes=TURNAROUND_MINUTES)
    for index, first in enumerate(ordered):
        for second in ordered[index + 1 :]:
            shared = set(first.assigned.aircraft_ids) & set(second.assigned.aircraft_ids)
            if not shared:
                continue
            if any(
                _overlaps(first, second, gap)
                for _aircraft_id in sorted(shared)
            ):
                violations.append(
                    f"{'/'.join(sorted(shared))}: double-booked by {first.id} and "
                    f"{second.id} inside the 45 min turnaround."
                )
    return violations


def _check_double_booked_crew(missions: list[Mission]) -> list[str]:
    violations: list[str] = []
    ordered = sorted(missions, key=lambda mission: mission.id)
    zero = timedelta(0)
    for index, first in enumerate(ordered):
        for second in ordered[index + 1 :]:
            shared = set(first.assigned.crew_ids) & set(second.assigned.crew_ids)
            if not shared:
                continue
            if _overlaps(first, second, zero):
                violations.append(
                    f"{'/'.join(sorted(shared))}: double-booked by {first.id} and {second.id}."
                )
    return violations


def _check_weapon_stocks(state: StateStore, missions: list[Mission]) -> list[str]:
    violations: list[str] = []
    demand: dict[tuple[str, str], int] = {}
    for mission in missions:
        for item in mission.required_weapons:
            key = (mission.launch_base_id, item.weapon_type)
            demand[key] = demand.get(key, 0) + item.quantity
    for (base_id, weapon_type), required in sorted(demand.items()):
        available = sum(
            stock.quantity
            for stock in state.weapon_stocks
            if stock.base_id == base_id and stock.weapon_type == weapon_type
        )
        if available < required:
            violations.append(
                f"{base_id}: {weapon_type} stock {available} < required {required}."
            )
    return violations


def _check_fuel(state: StateStore, missions: list[Mission]) -> list[str]:
    violations: list[str] = []
    for mission in missions:
        distance = geometry_lite.route_distance_km(list(mission.route))
        for aircraft_id in mission.assigned.aircraft_ids:
            airframe = state.aircraft.get(aircraft_id)
            if airframe is None:
                continue
            speed = CRUISE_SPEED_KMH.get(airframe.type, 600.0)
            burn = FUEL_BURN_PCT_PER_HOUR.get(airframe.type, 8.0)
            needed = distance / speed * burn + RESERVE_PCT
            if airframe.fuel_pct < needed:
                violations.append(
                    f"{mission.id}: {aircraft_id} fuel {airframe.fuel_pct:.1f}% < "
                    f"{needed:.1f}% needed with reserve."
                )
    return violations


def _overlaps(first: Mission, second: Mission, gap: timedelta) -> bool:
    first_start, first_end = _window(first)
    second_start, second_end = _window(second)
    return first_start < second_end + gap and second_start < first_end + gap


def _window(mission: Mission) -> tuple[datetime, datetime]:
    return parse_timestamp(mission.window_start), parse_timestamp(mission.window_end)


def _sortie_hours(mission: Mission) -> float:
    start, end = _window(mission)
    return max((end - start).total_seconds() / 3600.0, 0.0)


def _active_missions(state: StateStore) -> list[Mission]:
    return [mission for mission in state.missions.values() if mission.status in _ACTIVE]
