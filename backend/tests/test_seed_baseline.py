"""Baseline scheduling sanity for the clean seed (pure Python, no models).

Rules live in ``baseline_rules.py`` and are re-used by the runtime sim test.
"""

from collections import defaultdict
from typing import Any

from baseline_rules import baseline_violations, by_id


def test_baseline_is_conflict_free(seed_raw: dict[str, Any]) -> None:
    violations = baseline_violations(seed_raw)
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
    ac07 = by_id(seed_raw["aircraft"])["AC-07"]
    assert ac07["type"] == "Strike-B"
    assert ac07["tailNumber"] == "VR-S07"
    assert ac07["assignedMissionId"] == "M-04"


def test_m04_route_b_thr02_quirk_reproduced(seed_raw: dict[str, Any]) -> None:
    """Tripwire: M-04 flies Route B through active THR-02 in the baseline.

    The seed is authoritative; do not "fix" it here. Threat/risk semantics are
    revisited in stage B4 (context.md section 10, verified baseline caveat).
    """
    mission = by_id(seed_raw["missions"])["M-04"]
    route_b = next(option for option in mission["routeOptions"] if option["id"] == "Route B")
    assert mission["route"] == route_b["waypoints"]
    assert route_b["riskScore"] == 88

    threat = by_id(seed_raw["threats"])["THR-02"]
    assert threat["type"] == "SAM"
    assert threat["status"] == "active"
    assert threat["rangeKm"] == 85
    assert threat["position"] == {"lat": 4.8, "lng": 7.5}
    assert "AC-07" in mission["assigned"]["aircraftIds"]
