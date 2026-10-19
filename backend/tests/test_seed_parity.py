"""Parity: the authoritative seed must round-trip exactly through the models."""

from copy import deepcopy
from typing import Any

from app.domain import WireSnapshot, dump_wire


def _sorted(value: Any) -> Any:
    """Recursively sort dict keys so comparisons ignore key order."""
    if isinstance(value, dict):
        return {key: _sorted(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return [_sorted(item) for item in value]
    return value


def _assert_no_snake_case_keys(value: Any) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            assert "_" not in key, f"snake_case key leaked onto the wire: {key}"
            _assert_no_snake_case_keys(item)
    elif isinstance(value, list):
        for item in value:
            _assert_no_snake_case_keys(item)


def test_seed_round_trips_exactly(seed_raw: dict[str, Any], seed_snapshot: WireSnapshot) -> None:
    assert _sorted(dump_wire(seed_snapshot)) == _sorted(seed_raw)


def test_dump_is_camel_case(seed_snapshot: WireSnapshot) -> None:
    dumped = dump_wire(seed_snapshot)
    assert set(dumped) >= {"stateVersion", "weaponStocks", "activeEvents", "auditLog"}
    _assert_no_snake_case_keys(dumped)


def test_dump_reparses_and_is_stable(seed_snapshot: WireSnapshot) -> None:
    dumped = dump_wire(seed_snapshot)
    reparsed = WireSnapshot.model_validate(dumped)
    assert dump_wire(reparsed) == dumped


def test_only_documented_optional_fields_may_differ(seed_raw: dict[str, Any]) -> None:
    """Optional seed fields (assignedMissionId, currentWaypointIndex) may be absent."""
    mutated = deepcopy(seed_raw)
    for aircraft in mutated["aircraft"]:
        aircraft.pop("assignedMissionId", None)
    for mission in mutated["missions"]:
        mission.pop("currentWaypointIndex", None)
    snapshot = WireSnapshot.model_validate(mutated)
    assert all("assignedMissionId" not in dump_wire(item) for item in snapshot.aircraft)
    assert all("currentWaypointIndex" not in dump_wire(item) for item in snapshot.missions)
