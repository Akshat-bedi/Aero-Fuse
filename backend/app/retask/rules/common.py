"""Shared helpers and the candidate-plan type for the B6a rule slice."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain import (
    AircraftStatus,
    Base,
    Change,
    Mission,
    MissionStatus,
    Priority,
    RunwayStatus,
    parse_timestamp,
)
from app.retask import geometry_lite
from app.state.store import StateStore

PROFILES: tuple[str, str, str] = ("min_disruption", "min_risk", "max_coverage")
_ACTIVE = frozenset(
    {
        MissionStatus.PLANNED,
        MissionStatus.APPROVED,
        MissionStatus.IN_PROGRESS,
        MissionStatus.AT_RISK,
    }
)
_RELOCATABLE = frozenset({MissionStatus.PLANNED, MissionStatus.APPROVED, MissionStatus.AT_RISK})


@dataclass
class CandidatePlan:
    """One rule-generated plan for a weighting profile."""

    profile: str
    changes: list[Change] = field(default_factory=list)
    explanations: list[str] = field(default_factory=list)
    relaxed: list[str] = field(default_factory=list)
    failure: str | None = None

    @property
    def feasible(self) -> bool:
        return self.failure is None


def active_missions(state: StateStore) -> list[Mission]:
    return [mission for mission in state.missions.values() if mission.status in _ACTIVE]


def is_relocatable(mission: Mission) -> bool:
    return mission.status in _RELOCATABLE


def sortie_hours(mission: Mission) -> float:
    start = parse_timestamp(mission.window_start)
    end = parse_timestamp(mission.window_end)
    return max((end - start).total_seconds() / 3600.0, 0.0)


def is_p1_or_p2(mission: Mission) -> bool:
    return _priority(mission) <= 2


def _priority(mission: Mission) -> int:
    return int(mission.priority)


def weapon_stock_available(state: StateStore, base_id: str, mission: Mission) -> bool:
    for item in mission.required_weapons:
        available = sum(
            stock.quantity
            for stock in state.weapon_stocks
            if stock.base_id == base_id and stock.weapon_type == item.weapon_type
        )
        if available < item.quantity:
            return False
    return True


def open_bases(
    state: StateStore,
    *,
    exclude: str | None = None,
    allow_degraded: bool = False,
) -> list[Base]:
    allowed = {RunwayStatus.OPEN}
    if allow_degraded:
        allowed.add(RunwayStatus.DEGRADED)
    return [
        base
        for base in state.bases.values()
        if base.id != exclude and base.runway_status in allowed
    ]


def choose_base(
    state: StateStore,
    mission: Mission,
    candidates: list[Base],
    profile: str,
    *,
    origin: Base,
) -> tuple[Base, list[str]]:
    """Pick an alternate base for relocation/recovery and note any relaxation."""
    relaxed: list[str] = []
    with_stock = [
        base for base in candidates if weapon_stock_available(state, base.id, mission)
    ]
    if with_stock:
        pool = with_stock
    elif candidates:
        pool = candidates
        relaxed.append(
            f"{mission.id} moves to a base whose stock does not fully cover its "
            "weapon load; resupply required."
        )
    else:
        raise LookupError("no alternate base is available")

    if profile == "min_risk":
        pool.sort(key=lambda base: (_threat_cover_count(state, base), _dist(base, origin), base.id))
    elif profile == "max_coverage":
        pool.sort(
            key=lambda base: (
                -_spare_aircraft_count(state, base.id),
                _threat_cover_count(state, base),
                _dist(base, origin),
                base.id,
            )
        )
    else:
        pool.sort(key=lambda base: (_dist(base, origin), -base.fuel_stock_pct, base.id))
    return pool[0], relaxed


def alternate_bases_note(origin: Base, chosen: Base) -> str:
    return (
        f"{origin.id} is unavailable; {chosen.id} is the selected alternate "
        f"({_dist(chosen, origin):.0f} km transit)."
    )


def _dist(a: Base, b: Base) -> float:
    return geometry_lite.distance_km(a.location, b.location)


def _threat_cover_count(state: StateStore, base: Base) -> int:
    count = 0
    for threat in state.threats.values():
        if geometry_lite.distance_km(base.location, threat.position) <= threat.range_km:
            count += 1
    return count


def _spare_aircraft_count(state: StateStore, base_id: str) -> int:
    return sum(
        1
        for airframe in state.aircraft.values()
        if airframe.base_id == base_id
        and airframe.status in {AircraftStatus.SERVICEABLE, AircraftStatus.TURNAROUND}
        and airframe.assigned_mission_id is None
    )


def priority_label(priority: Priority) -> str:
    return f"P{int(priority)}"
