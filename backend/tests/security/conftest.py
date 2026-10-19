"""Fixtures for the security test suite.

scrypt is deliberately cheap in tests (the encoded hash records its own
parameters, so verification still exercises the real code path).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.security import users as users_module
from app.security.audit_events import InMemoryAuditSink
from app.security.auth import LoginRequest, LoginSession
from app.security.deps import SecurityContext, build_security_context
from app.security.policy import Identity
from app.security.settings import SecuritySettings
from app.security.users import DEMO_PASSWORD

FIXED_NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)
AUTH_SECRET = "test-secret-" + "x" * 40


class MutableClock:
    """Deterministic clock the tests can advance."""

    def __init__(self, now: datetime = FIXED_NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> datetime:
        self.now = self.now + timedelta(seconds=seconds)
        return self.now


@pytest.fixture(autouse=True)
def fast_scrypt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(users_module, "_SCRYPT_N", 2**8)


@pytest.fixture
def clock() -> MutableClock:
    return MutableClock()


@pytest.fixture
def audit() -> InMemoryAuditSink:
    return InMemoryAuditSink()


@pytest.fixture
def demo_settings() -> SecuritySettings:
    return SecuritySettings(auth_enabled=False)


@pytest.fixture
def auth_settings() -> SecuritySettings:
    return SecuritySettings(
        auth_enabled=True,
        jwt_secret=AUTH_SECRET,
        access_token_ttl_sec=900,
        refresh_token_ttl_sec=28_800,
        absolute_session_limit_sec=43_200,
        lockout_failures=3,
        lockout_duration_sec=60,
        step_up_window_sec=120,
        high_impact_mission_threshold=3,
    )


@pytest.fixture
def demo_context(
    demo_settings: SecuritySettings,
    clock: MutableClock,
    audit: InMemoryAuditSink,
) -> SecurityContext:
    return build_security_context(demo_settings, clock=clock, audit=audit)


@pytest.fixture
def auth_context(
    auth_settings: SecuritySettings,
    clock: MutableClock,
    audit: InMemoryAuditSink,
) -> SecurityContext:
    return build_security_context(auth_settings, clock=clock, audit=audit)


def login_as(context: SecurityContext, username: str) -> LoginSession:
    return context.auth.login(LoginRequest(username=username, password=DEMO_PASSWORD))


def identity_as(context: SecurityContext, username: str) -> Identity:
    session = login_as(context, username)
    return context.tokens.authenticate_access(session.pair.access_token).identity


def stepped_up_identity_as(context: SecurityContext, username: str) -> Identity:
    session = login_as(context, username)
    token = context.tokens.authenticate_access(session.pair.access_token)
    context.tokens.mark_step_up(token.session_id, now=context.clock())
    return context.tokens.authenticate_access(session.pair.access_token).identity
