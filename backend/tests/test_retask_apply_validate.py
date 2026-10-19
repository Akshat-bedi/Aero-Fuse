"""Pure plan application and the lightweight validator (B6a)."""

import pytest
from app.domain import Change, ChangeKind, MissionStatus
from app.retask.apply import PlanApplicationError, apply_changes
from app.retask.validate import check_plan_lite
from app.state.store import StateStore


def _change(mission_id: str, kind: ChangeKind, before: object, after: object) -> Change:
    return Change(mission_id=mission_id, kind=kind, before=before, after=after)


def test_apply_does_not_mutate_live_state() -> None:
    state = StateStore.from_seed()
    live_version = state.version
    planned = apply_changes(
        state, [_change("M-04", ChangeKind.REROUTE, "Route B", "Route C")]
    )
    assert planned is not state
    assert planned.missions["M-04"].route != state.missions["M-04"].route
    assert state.version == live_version
    assert state.missions["M-04"].route[1:] == state.missions["M-04"].route[1:]


def test_in_progress_reroute_keeps_current_position_and_rotates_route() -> None:
    state = StateStore.from_seed()
    position = state.aircraft["AC-07"].position
    planned = apply_changes(
        state, [_change("M-04", ChangeKind.REROUTE, "Route B", "Route C")]
    )
    mission = planned.missions["M-04"]
    assert position is not None
    assert mission.route[0] == position
    assert mission.current_waypoint_index == 0
    assert len(mission.route) >= len(state.missions["M-04"].route)


def test_delay_shifts_window_and_preserves_duration() -> None:
    state = StateStore.from_seed()
    mission = state.missions["M-06"]
    original_end = mission.window_end
    planned = apply_changes(
        state,
        [_change("M-06", ChangeKind.DELAY, None, "2026-10-17T16:20:00.000Z")],
    )
    updated = planned.missions["M-06"]
    assert updated.window_start == "2026-10-17T16:20:00.000Z"
    assert updated.window_end == "2026-10-17T20:20:00.000Z"
    assert mission.window_end == original_end


def test_cancel_frees_resources_and_marks_mission_cancelled() -> None:
    state = StateStore.from_seed()
    planned = apply_changes(state, [_change("M-06", ChangeKind.CANCEL, None, None)])
    mission = planned.missions["M-06"]
    assert mission.status is MissionStatus.CANCELLED
    assert mission.assigned.aircraft_ids == []
    assert planned.aircraft["AC-04"].assigned_mission_id is None
    assert planned.crew["CR-04"].status.value == "available"
    assert state.missions["M-06"].status is MissionStatus.PLANNED


def test_new_assignment_approves_and_assigns() -> None:
    state = StateStore.from_seed()
    planned = apply_changes(
        state,
        [
            _change(
                "M-10",
                ChangeKind.NEW_ASSIGNMENT,
                None,
                {"aircraftIds": ["AC-16"], "crewIds": ["CR-26"]},
            )
        ],
    )
    mission = planned.missions["M-10"]
    assert mission.status is MissionStatus.APPROVED
    assert mission.assigned.aircraft_ids == ["AC-16"]
    assert planned.aircraft["AC-16"].assigned_mission_id == "M-10"


def test_unknown_mission_is_rejected() -> None:
    state = StateStore.from_seed()
    with pytest.raises(PlanApplicationError, match="unknown mission"):
        apply_changes(state, [_change("M-99", ChangeKind.CANCEL, None, None)])


def test_unknown_reroute_target_is_rejected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-04", ChangeKind.REROUTE, "Route B", "Route Z")]
    )
    assert violations == ["reroute target is neither a route option nor a base: Route Z"]


def test_valid_reroute_passes_baseline_gates() -> None:
    state = StateStore.from_seed()
    assert check_plan_lite(
        state, [_change("M-04", ChangeKind.REROUTE, "Route B", "Route C")]
    ) == []


def test_double_booked_aircraft_is_detected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-06", ChangeKind.AIRCRAFT_SWAP, "AC-04", "AC-01")]
    )
    assert any("double-booked" in violation for violation in violations)


def test_type_mismatch_is_detected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-06", ChangeKind.AIRCRAFT_SWAP, "AC-04", "AC-09")]
    )
    assert any("mission requires Fighter-A" in violation for violation in violations)


def test_unqualified_crew_is_detected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-06", ChangeKind.CREW_SWAP, "CR-04", "CR-11")]
    )
    assert any("lacks required qualifications" in violation for violation in violations)


def test_duty_limit_is_detected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-06", ChangeKind.CREW_SWAP, "CR-04", "CR-08")]
    )
    assert any("12 h duty limit" in violation for violation in violations)


def test_weapon_stock_shortage_is_detected() -> None:
    state = StateStore.from_seed()
    state.weapon_stocks = []
    violations = check_plan_lite(state, [])
    assert any("stock 0 < required" in violation for violation in violations)


def test_low_fuel_is_detected() -> None:
    state = StateStore.from_seed()
    state.aircraft["AC-10"].fuel_pct = 5.0
    violations = check_plan_lite(
        state, [_change("M-04", ChangeKind.AIRCRAFT_SWAP, "AC-07", "AC-10")]
    )
    assert any("fuel" in violation and "reserve" in violation for violation in violations)


def test_aircraft_readiness_is_detected() -> None:
    state = StateStore.from_seed()
    violations = check_plan_lite(
        state, [_change("M-06", ChangeKind.AIRCRAFT_SWAP, "AC-04", "AC-02")]
    )
    assert any("not ready for tasking" in violation for violation in violations)
