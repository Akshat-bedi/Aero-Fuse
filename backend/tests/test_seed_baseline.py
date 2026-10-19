"""Baseline scheduling sanity for the clean seed (pure Python, no models).

Rules mirror the frontend conflict checker (``frontend/src/lib/conflictDetection.ts``):
active windows must not overlap for the same airframe/crew, sequential sorties
need a >= 45 min turnaround, and projected crew duty
(``dutyHoursLast24h + max(0.5, sortie hours)``) must stay within the 12 h limit.
"""

from collections import defaultdict
from datetime import datetime
from itertools import pairwise
from typing import Any

ACTIVE_STATUSES = {"planned", "approved", "in-progress"}
TURNAROUND_MIN = 45.0
MAX_DUTY_HOURS = 12.0


def _parse(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


def _by_id(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in items}


def _active_missions(raw: dict[str, Any]) -> list[dict[str, Any]]:
    return [mission for mission in raw["missions"] if mission["status"] in ACTIVE_STATUSES]


def _sortie_hours(mission: dict[str, Any]) -> float:
    duration = (_parse(mission["windowEnd"]) - _parse(mission["windowStart"])).total_seconds()
    return max(0.5, duration / 3600.0)


def _baseline_violations(raw: dict[str, Any]) -> list[str]:
    violations: list[str] = []
    aircraft = _by_id(raw["aircraft"])
    crew = _by_id(raw["crew"])
    missions = _active_missions(raw)

    for mission in missions:
        if _parse(mission["windowEnd"]) <= _parse(mission["windowStart"]):
            violations.append(f"{mission['id']}: windowEnd not after windowStart")

        for aircraft_id in mission["assigned"]["aircraftIds"]:
            airframe = aircraft.get(aircraft_id)
            if airframe is None:
                violations.append(f"{mission['id']}: unknown aircraft {aircraft_id}")
                continue
            if airframe["type"] != mission["requiredAircraftType"]:
                violations.append(
                    f"{mission['id']}: {aircraft_id} is {airframe['type']}, "
                    f"needs {mission['requiredAircraftType']}"
                )

        for crew_id in mission["assigned"]["crewIds"]:
            member = crew.get(crew_id)
            if member is None:
                violations.append(f"{mission['id']}: unknown crew {crew_id}")
                continue
            missing = set(mission["requiredCrewQuals"]) - set(member["qualifications"])
            if missing:
                violations.append(f"{mission['id']}: {crew_id} missing quals {sorted(missing)}")
            projected = member["dutyHoursLast24h"] + _sortie_hours(mission)
            if projected > MAX_DUTY_HOURS:
                violations.append(
                    f"{mission['id']}: {crew_id} projected duty {projected:.1f}h > {MAX_DUTY_HOURS}"
                )

    for entity, key in (("aircraft", "aircraftIds"), ("crew", "crewIds")):
        usage: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for mission in missions:
            for entity_id in mission["assigned"][key]:
                usage[entity_id].append(mission)
        for entity_id, assigned in usage.items():
            ordered = sorted(assigned, key=lambda mission: mission["windowStart"])
            for previous, following in pairwise(ordered):
                end_previous = _parse(previous["windowEnd"])
                start_following = _parse(following["windowStart"])
                if start_following < end_previous:
                    violations.append(
                        f"double-booked {entity} {entity_id}: {previous['id']} overlaps "
                        f"{following['id']}"
                    )
                elif (start_following - end_previous).total_seconds() / 60.0 < TURNAROUND_MIN:
                    violations.append(
                        f"insufficient turnaround for {entity} {entity_id} between "
                        f"{previous['id']} and {following['id']}"
                    )

    return violations


def test_baseline_is_conflict_free(seed_raw: dict[str, Any]) -> None:
    violations = _baseline_violations(seed_raw)
    assert violations == [], "baseline violations (do not silently fix):\n" + "\n".join(violations)


def test_baseline_status_mix(seed_raw: dict[str, Any]) -> None:
    statuses: defaultdict[str, int] = defaultdict(int)
    for mission in seed_raw["missions"]:
        statuses[mission["status"]] += 1
    assert statuses["in-progress"] == 5
    assert statuses["planned"] == 4
    assert statuses["approved"] == 1
    assert statuses["at-risk"] == 0


def test_ac07_is_strike_b_on_m04(seed_raw: dict[str, Any]) -> None:
    ac07 = _by_id(seed_raw["aircraft"])["AC-07"]
    assert ac07["type"] == "Strike-B"
    assert ac07["tailNumber"] == "VR-S07"
    assert ac07["assignedMissionId"] == "M-04"


def test_m04_route_b_thr02_quirk_reproduced(seed_raw: dict[str, Any]) -> None:
    """Tripwire: M-04 flies Route B through active THR-02 in the baseline.

    The seed is authoritative; do not "fix" it here. Threat/risk semantics are
    revisited in stage B4 (context.md section 10, verified baseline caveat).
    """
    mission = _by_id(seed_raw["missions"])["M-04"]
    route_b = next(option for option in mission["routeOptions"] if option["id"] == "Route B")
    assert mission["route"] == route_b["waypoints"]
    assert route_b["riskScore"] == 88

    threat = _by_id(seed_raw["threats"])["THR-02"]
    assert threat["type"] == "SAM"
    assert threat["status"] == "active"
    assert threat["rangeKm"] == 85
    assert threat["position"] == {"lat": 4.8, "lng": 7.5}
    assert "AC-07" in mission["assigned"]["aircraftIds"]
