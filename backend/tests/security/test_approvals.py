"""High-impact classification and the two-person approval state machine."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.domain.decision import Change, Recommendation
from app.domain.enums import ChangeKind, RecommendationStatus
from app.security.approvals import (
    ApprovalPhase,
    DenialReason,
    approval_fields,
    approval_fields_dict,
    awaiting_second_approver,
    classify_high_impact,
    evaluate_approval,
    evaluate_rejection,
    initial_state,
    required_approvals,
    revoke_approval,
    step_up_valid,
)
from app.security.policy import Identity, Role
from app.security.settings import SecuritySettings

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


def _commander(
    username: str = "commander", *, stepped_up: bool = True
) -> Identity:
    return Identity(
        user_id=f"USR-{username}",
        username=username,
        role=Role.COMMANDER,
        display_name=username.replace("_", " ").title(),
        step_up_at=NOW if stepped_up else None,
    )


def _observer() -> Identity:
    return Identity(
        user_id="USR-obs",
        username="observer",
        role=Role.OBSERVER,
        display_name="Observer",
        step_up_at=NOW,
    )


def _settings(**overrides: object) -> SecuritySettings:
    values: dict[str, object] = {
        "auth_enabled": False,
        "step_up_window_sec": 120,
        "high_impact_mission_threshold": 3,
        "two_person_required": True,
    }
    values.update(overrides)
    return SecuritySettings(**values)  # type: ignore[arg-type]


def _recommendation(
    *,
    changes: list[Change] | None = None,
    impacted: list[str] | None = None,
    relaxed: list[str] | None = None,
    summary: str = "Reroute the mission",
) -> Recommendation:
    return Recommendation(
        id="REC-0001",
        trigger_event_id="EV-0001",
        summary=summary,
        score=82,
        changes=changes or [],
        impacted_mission_ids=impacted or [],
        constraints_relaxed=relaxed or [],
        status=RecommendationStatus.PENDING,
        created_at="2026-10-19T12:00:00+00:00",
        state_version=1,
        confidence=0.9,
        data_freshness_sec=2,
    )


def test_low_impact_recommendation() -> None:
    assessment = classify_high_impact(
        _recommendation(
            impacted=["M-04"],
            changes=[Change(mission_id="M-04", kind=ChangeKind.REROUTE)],
        ),
        {"M-04": 2},
        settings=_settings(),
    )
    assert assessment.high_impact is False
    assert assessment.reasons == ()
    assert assessment.impacted_mission_count == 1


@pytest.mark.parametrize("kind", [ChangeKind.CANCEL, ChangeKind.DELAY])
def test_p1_cancel_or_delay_is_high_impact(kind: ChangeKind) -> None:
    assessment = classify_high_impact(
        _recommendation(changes=[Change(mission_id="M-01", kind=kind)]),
        {"M-01": 1},
        settings=_settings(),
    )
    assert assessment.high_impact is True
    assert any("P1" in reason for reason in assessment.reasons)


def test_fatigue_or_duty_relaxation_is_high_impact() -> None:
    assessment = classify_high_impact(
        _recommendation(relaxed=["crew fatigue margin reduced to 4%"]),
        {},
        settings=_settings(),
    )
    assert assessment.high_impact is True
    assert any("fatigue" in reason for reason in assessment.reasons)


def test_three_impacted_missions_are_high_impact() -> None:
    assessment = classify_high_impact(
        _recommendation(impacted=["M-01", "M-02", "M-03"]),
        {},
        settings=_settings(),
    )
    assert assessment.high_impact is True
    assert any("3 missions" in reason for reason in assessment.reasons)


def test_threshold_override_can_make_three_missions_normal() -> None:
    assessment = classify_high_impact(
        _recommendation(impacted=["M-01", "M-02", "M-03"]),
        {},
        settings=_settings(high_impact_mission_threshold=5),
    )
    assert assessment.high_impact is False


@pytest.mark.parametrize(
    "summary",
    [
        "No feasible plan found",
        "Infeasible under current constraints",
    ],
)
def test_no_feasible_plan_is_high_impact(summary: str) -> None:
    assessment = classify_high_impact(
        _recommendation(summary=summary),
        {},
        settings=_settings(),
    )
    assert assessment.high_impact is True


def test_no_feasible_plan_flag_is_high_impact() -> None:
    assessment = classify_high_impact(
        _recommendation(),
        {},
        settings=_settings(),
        no_feasible_plan=True,
    )
    assert assessment.high_impact is True


def test_step_up_window_uses_the_injected_time() -> None:
    settings = _settings(step_up_window_sec=120)
    assert step_up_valid(_commander(stepped_up=False), NOW, settings.step_up_window_sec) is False
    assert step_up_valid(_commander(), NOW, settings.step_up_window_sec) is True
    assert step_up_valid(_commander(), NOW + timedelta(seconds=120), 120) is True
    assert step_up_valid(_commander(), NOW + timedelta(seconds=121), 120) is False


def test_step_up_rejects_naive_timestamps() -> None:
    with pytest.raises(ValueError):
        step_up_valid(_commander(), datetime(2026, 10, 19, 12, 0), 120)


def test_required_approvals_rules() -> None:
    settings = _settings()
    assert required_approvals(
        high_impact=False, approver_is_modifier=False, settings=settings
    ) == 1
    assert required_approvals(
        high_impact=True, approver_is_modifier=False, settings=settings
    ) == 2
    assert required_approvals(
        high_impact=False, approver_is_modifier=True, settings=settings
    ) == 2
    disabled = _settings(two_person_required=False)
    assert required_approvals(
        high_impact=True, approver_is_modifier=False, settings=disabled
    ) == 1


def test_non_commander_is_denied() -> None:
    outcome = evaluate_approval(
        initial_state(),
        _observer(),
        NOW,
        high_impact=False,
        trigger_operator="someone-else",
        settings=_settings(),
    )
    assert outcome.accepted is False
    assert outcome.apply_plan is False
    assert outcome.denial is DenialReason.NOT_COMMANDER
    assert outcome.state.approvals == ()


def test_missing_step_up_is_denied() -> None:
    outcome = evaluate_approval(
        initial_state(),
        _commander(stepped_up=False),
        NOW,
        high_impact=False,
        trigger_operator="someone-else",
        settings=_settings(),
    )
    assert outcome.denial is DenialReason.STEP_UP_REQUIRED
    assert outcome.apply_plan is False


def test_approver_cannot_be_the_trigger_operator() -> None:
    outcome = evaluate_approval(
        initial_state(),
        _commander("commander"),
        NOW,
        high_impact=False,
        trigger_operator="COMMANDER",
        settings=_settings(),
    )
    assert outcome.denial is DenialReason.SEPARATION_OF_DUTIES
    assert outcome.state.approvals == ()


def test_normal_recommendation_applies_on_first_approval() -> None:
    outcome = evaluate_approval(
        initial_state(),
        _commander("commander"),
        NOW,
        high_impact=False,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert outcome.accepted is True
    assert outcome.apply_plan is True
    assert outcome.state.phase is ApprovalPhase.APPLIED
    assert outcome.next_recommendation_status == "approved"
    assert len(outcome.state.approvals) == 1
    assert outcome.state.approvals[0].operator == "commander"


def test_duplicate_approval_is_ignored() -> None:
    first = evaluate_approval(
        initial_state(2),
        _commander("commander"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert first.apply_plan is False
    second = evaluate_approval(
        first.state,
        _commander("commander"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert second.accepted is True
    assert second.apply_plan is False
    assert second.detail == "duplicate approval ignored"
    assert len(second.state.approvals) == 1


def test_high_impact_needs_two_distinct_commanders() -> None:
    first = evaluate_approval(
        initial_state(),
        _commander("commander"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert first.apply_plan is False
    assert first.state.phase is ApprovalPhase.PENDING
    assert awaiting_second_approver(first.state) is True

    second = evaluate_approval(
        first.state,
        _commander("commander_2"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert second.apply_plan is True
    assert second.state.phase is ApprovalPhase.APPLIED
    assert [item.operator for item in second.state.approvals] == [
        "commander",
        "commander_2",
    ]


def test_modifier_can_never_be_the_sole_approver() -> None:
    first = evaluate_approval(
        initial_state(),
        _commander("commander"),
        NOW,
        high_impact=False,
        trigger_operator="ops_planner",
        modifier_operator="commander",
        settings=_settings(two_person_required=False),
    )
    assert first.state.required == 2
    assert first.apply_plan is False

    second = evaluate_approval(
        first.state,
        _commander("commander_2"),
        NOW,
        high_impact=False,
        trigger_operator="ops_planner",
        modifier_operator="commander",
        settings=_settings(two_person_required=False),
    )
    assert second.apply_plan is True


def test_rejection_requires_a_reason_and_ends_the_recommendation() -> None:
    missing = evaluate_rejection(
        initial_state(),
        _commander(),
        NOW,
        trigger_operator="ops_planner",
        settings=_settings(),
        reason="   ",
    )
    assert missing.denial is DenialReason.REASON_REQUIRED

    rejected = evaluate_rejection(
        initial_state(),
        _commander(),
        NOW,
        trigger_operator="ops_planner",
        settings=_settings(),
        reason="Threat picture changed",
    )
    assert rejected.apply_plan is False
    assert rejected.state.phase is ApprovalPhase.REJECTED
    assert rejected.next_recommendation_status == "rejected"

    after = evaluate_approval(
        rejected.state,
        _commander("commander_2"),
        NOW,
        high_impact=False,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    assert after.denial is DenialReason.ALREADY_DECIDED


def test_rejection_by_the_trigger_operator_is_denied() -> None:
    outcome = evaluate_rejection(
        initial_state(),
        _commander(),
        NOW,
        trigger_operator="commander",
        settings=_settings(),
        reason="because",
    )
    assert outcome.denial is DenialReason.SEPARATION_OF_DUTIES


def test_revocation_returns_to_pending() -> None:
    first = evaluate_approval(
        initial_state(2),
        _commander("commander"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    revoked = revoke_approval(first.state, _commander("commander"), settings=_settings())
    assert revoked.accepted is True
    assert revoked.state.phase is ApprovalPhase.PENDING
    assert revoked.state.approvals == ()


def test_revoking_without_an_approval_is_denied() -> None:
    outcome = revoke_approval(initial_state(2), _commander(), settings=_settings())
    assert outcome.denial is DenialReason.NOTHING_TO_REVOKE


def test_wire_fields_use_camel_case_and_keep_role_timestamp() -> None:
    first = evaluate_approval(
        initial_state(2),
        _commander("commander"),
        NOW,
        high_impact=True,
        trigger_operator="ops_planner",
        settings=_settings(),
    )
    fields = approval_fields(first.state)
    dumped = approval_fields_dict(first.state)
    assert fields.approvals_required == 2
    assert fields.approvals is not None
    assert dumped["approvalsRequired"] == 2
    assert dumped["approvals"][0]["operator"] == "commander"
    assert dumped["approvals"][0]["role"] == "commander"
    assert dumped["approvals"][0]["timestamp"] == NOW.isoformat()


def test_no_new_recommendation_status_is_introduced() -> None:
    valid = {status.value for status in RecommendationStatus}
    for phase in ApprovalPhase:
        status = {
            ApprovalPhase.PENDING: "pending",
            ApprovalPhase.APPLIED: "approved",
            ApprovalPhase.REJECTED: "rejected",
        }[phase]
        assert status in valid
