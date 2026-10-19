"""Baseline scheduling rules shared by the seed test and the runtime sim test.

Rules mirror the frontend conflict checker (``frontend/src/lib/conflictDetection.ts``):
active windows must not overlap for the same airframe/crew, sequential sorties
need a >= 45 min turnaround, and projected crew duty
(``dutyHoursLast24h + max(0.5, sortie hours)``) must stay within the 12 h limit.
The runtime test re-runs these on live state while the sim clock advances.
"""

from collections import defaultdict
from datetime import datetime
from itertools import pairwise
from typing import Any

ACTIVE_STATUSES = {"planned", "approved", "in-progress"}
TURNAROUND_MIN = 45.0
MAX_DUTY_HOURS = 12.0


def parse_timestamp(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


def by_id(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in items}


def active_missions(raw: dict[str, Any]) -> list[dict[str, Any]]:
    return [mission for mission in raw["missions"] if mission["status"] in ACTIVE_STATUSES]


def sortie_hours(mission: dict[str, Any]) -> float:
    duration = (
        parse_timestamp(mission["windowEnd"]) - parse_timestamp(mission["windowStart"])
    ).total_seconds()
    return max(0.5, duration / 3600.0)


def baseline_violations(raw: dict[str, Any]) -> list[str]:
    """All conflicts/violations in a raw wire-shaped state (seed or live)."""
    violations: list[str] = []
    aircraft = by_id(raw["aircraft"])
    crew = by_id(raw["crew"])
    missions = active_missions(raw)

    for mission in missions:
        if parse_timestamp(mission["windowEnd"]) <= parse_timestamp(mission["windowStart"]):
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
            projected = member["dutyHoursLast24h"] + sortie_hours(mission)
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
                end_previous = parse_timestamp(previous["windowEnd"])
                start_following = parse_timestamp(following["windowStart"])
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
