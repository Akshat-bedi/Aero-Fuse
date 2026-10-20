"""Security audit event constructors and sinks."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.security.audit_events import (
    InMemoryAuditSink,
    NullAuditSink,
    SecurityAuditAction,
    access_denied_event,
    approval_event,
    iso_timestamp,
    login_failure_event,
    login_success_event,
    make_event,
    spoof_attempt_event,
)

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


def test_make_event_copies_details_and_formats_time() -> None:
    details = {"reason": "test"}
    event = make_event(
        SecurityAuditAction.LOGIN_SUCCESS,
        operator="commander",
        target_id="USR-0005",
        timestamp=NOW,
        details=details,
    )
    details["reason"] = "mutated"
    assert event.details == {"reason": "test"}
    assert event.timestamp == NOW.isoformat()
    assert event.operator == "commander"


def test_empty_operator_becomes_anonymous() -> None:
    event = make_event(
        SecurityAuditAction.LOGIN_FAILURE,
        operator="",
        target_id="somebody",
        timestamp=NOW,
    )
    assert event.operator == "anonymous"


def test_naive_timestamp_is_rejected() -> None:
    with pytest.raises(ValueError):
        iso_timestamp(datetime(2026, 10, 19, 12, 0))


def test_login_events_carry_no_secret() -> None:
    failure = login_failure_event(
        username="commander",
        reason="invalid_password",
        timestamp=NOW,
        locked=True,
    )
    success = login_success_event(
        user_id="USR-0005",
        username="commander",
        role="commander",
        timestamp=NOW,
    )
    assert failure.action is SecurityAuditAction.LOCKOUT
    assert failure.operator == "anonymous"
    assert success.action is SecurityAuditAction.LOGIN_SUCCESS
    assert "veridia-demo" not in repr(failure.details).casefold()
    assert "4821" not in repr(failure.details)


def test_spoof_attempt_includes_the_provided_value() -> None:
    event = spoof_attempt_event(
        operator="commander",
        body_operator="COL. EVIL",
        path="/api/events",
        timestamp=NOW,
    )
    assert event.action is SecurityAuditAction.SPOOF_ATTEMPT
    assert event.details == {"providedOperator": "COL. EVIL", "path": "/api/events"}


def test_access_denied_event() -> None:
    event = access_denied_event(
        operator="observer",
        role="observer",
        permission="decide_approve",
        path="/api/decisions",
        timestamp=NOW,
    )
    assert event.action is SecurityAuditAction.ACCESS_DENIED
    assert event.details["role"] == "observer"
    assert event.details["permission"] == "decide_approve"


def test_approval_event() -> None:
    event = approval_event(
        SecurityAuditAction.APPROVAL_RECORDED,
        operator="commander",
        recommendation_id="REC-0001",
        role="commander",
        approvals_count=1,
        approvals_required=2,
        phase="pending",
        timestamp=NOW,
    )
    assert event.target_id == "REC-0001"
    assert event.details["approvalsRequired"] == 2
    assert event.details["phase"] == "pending"


def test_in_memory_sink() -> None:
    sink = InMemoryAuditSink()
    first = make_event(
        SecurityAuditAction.LOGIN_SUCCESS,
        operator="a",
        target_id="a",
        timestamp=NOW,
    )
    second = make_event(
        SecurityAuditAction.LOGIN_FAILURE,
        operator="b",
        target_id="b",
        timestamp=NOW,
    )
    sink.record(first)
    sink.record(second)
    assert sink.events == (first, second)
    sink.clear()
    assert len(sink.events) == 0


def test_null_sink_discards() -> None:
    sink = NullAuditSink()
    event = make_event(
        SecurityAuditAction.LOGIN_FAILURE,
        operator="a",
        target_id="a",
        timestamp=NOW,
    )
    sink.record(event)

