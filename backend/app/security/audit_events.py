<<<<<<< HEAD
﻿"""Security audit events and a tiny sink protocol.
=======
"""Security audit events and a tiny sink protocol.
>>>>>>> origin/main

The hash-chained audit store lands in B8. This module keeps the security layer
decoupled: it emits structured events through :class:`AuditSink`, and B8 adapts
the sink to the real ``AuditEntry`` chain. No password, password hash, token or
PIN is ever placed in an event.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol


class SecurityAuditAction(StrEnum):
    """Actions emitted by the security layer."""

    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILURE = "LOGIN_FAILURE"
<<<<<<< HEAD
    LOCKOUT = "LOCKOUT"
=======
    LOGIN_LOCKED = "LOGIN_LOCKED"
>>>>>>> origin/main
    LOGOUT = "LOGOUT"
    TOKEN_REFRESHED = "TOKEN_REFRESHED"
    ACCESS_DENIED = "ACCESS_DENIED"
    STEP_UP_SUCCESS = "STEP_UP_SUCCESS"
    STEP_UP_FAILURE = "STEP_UP_FAILURE"
    APPROVAL_RECORDED = "APPROVAL_RECORDED"
    APPROVAL_REVOKED = "APPROVAL_REVOKED"
    ROLE_CHANGED = "ROLE_CHANGED"
    SPOOF_ATTEMPT = "SPOOF_ATTEMPT"


@dataclass(frozen=True)
class SecurityAuditEvent:
    """A security event ready for the audit chain adapter."""

    action: SecurityAuditAction
    operator: str
    target_id: str
    timestamp: str
    details: dict[str, Any] = field(default_factory=dict)


class AuditSink(Protocol):
    """Anything that can accept security audit events."""

    def record(self, event: SecurityAuditEvent) -> None: ...


class NullAuditSink:
    """Drops events. Used only when an explicit sink is not configured."""

    def record(self, event: SecurityAuditEvent) -> None:
        return None


class InMemoryAuditSink:
    """Thread-safe sink for tests and demo composition."""

    def __init__(self) -> None:
        self._events: list[SecurityAuditEvent] = []
        self._lock = threading.Lock()

    def record(self, event: SecurityAuditEvent) -> None:
        with self._lock:
            self._events.append(event)

    @property
    def events(self) -> tuple[SecurityAuditEvent, ...]:
        with self._lock:
            return tuple(self._events)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


def iso_timestamp(value: datetime) -> str:
    """Render an aware datetime as an ISO 8601 string."""
    if value.tzinfo is None:
        raise ValueError("audit timestamps must be timezone-aware")
    return value.isoformat()


def make_event(
    action: SecurityAuditAction,
    *,
    operator: str,
    target_id: str,
    timestamp: datetime,
    details: dict[str, Any] | None = None,
) -> SecurityAuditEvent:
    """Build a sanitized event. Callers must pass non-secret details."""
    return SecurityAuditEvent(
        action=action,
        operator=operator or "anonymous",
        target_id=target_id,
        timestamp=iso_timestamp(timestamp),
        details=dict(details or {}),
    )


def spoof_attempt_event(
    *,
    operator: str,
    body_operator: str,
    path: str,
    timestamp: datetime,
) -> SecurityAuditEvent:
    """Record that a client tried to override the token-derived operator."""
    return make_event(
        SecurityAuditAction.SPOOF_ATTEMPT,
        operator=operator,
        target_id=operator,
        timestamp=timestamp,
        details={
            "providedOperator": body_operator,
            "path": path,
        },
    )


def access_denied_event(
    *,
    operator: str,
    role: str,
    permission: str,
    path: str,
    timestamp: datetime,
) -> SecurityAuditEvent:
    return make_event(
        SecurityAuditAction.ACCESS_DENIED,
        operator=operator,
        target_id=operator,
        timestamp=timestamp,
        details={"role": role, "permission": permission, "path": path},
    )


def login_failure_event(
    *,
    username: str,
    reason: str,
    timestamp: datetime,
    locked: bool = False,
) -> SecurityAuditEvent:
    return make_event(
<<<<<<< HEAD
        SecurityAuditAction.LOCKOUT if locked else SecurityAuditAction.LOGIN_FAILURE,
=======
        SecurityAuditAction.LOGIN_LOCKED if locked else SecurityAuditAction.LOGIN_FAILURE,
>>>>>>> origin/main
        operator="anonymous",
        target_id=username,
        timestamp=timestamp,
        details={"reason": reason},
    )


def login_success_event(
    *, user_id: str, username: str, role: str, timestamp: datetime
) -> SecurityAuditEvent:
    return make_event(
        SecurityAuditAction.LOGIN_SUCCESS,
        operator=username,
        target_id=user_id,
        timestamp=timestamp,
        details={"role": role},
    )


def approval_event(
    action: SecurityAuditAction,
    *,
    operator: str,
    recommendation_id: str,
    role: str,
    approvals_count: int,
    approvals_required: int,
    phase: str,
    timestamp: datetime,
) -> SecurityAuditEvent:
    return make_event(
        action,
        operator=operator,
        target_id=recommendation_id,
        timestamp=timestamp,
        details={
            "role": role,
            "approvalsCount": approvals_count,
            "approvalsRequired": approvals_required,
            "phase": phase,
        },
    )
<<<<<<< HEAD

=======
>>>>>>> origin/main
