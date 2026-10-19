"""Auth service: login, lockout, refresh, logout, step-up, role changes, audit."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol, cast

import pytest
from app.security.audit_events import (
    InMemoryAuditSink,
    SecurityAuditAction,
    SecurityAuditEvent,
)
from app.security.auth import (
    AccountLocked,
    AuthenticationFailed,
    LoginRequest,
    LoginSession,
    RefreshRequest,
    RoleChangeForbidden,
    StepUpFailed,
    UserManagementError,
)
from app.security.deps import SecurityContext
from app.security.policy import Identity, Role
from app.security.tokens import TokenRejected, TokenRejectionReason
from app.security.users import DEMO_PASSWORD, DEMO_STEP_UP_PIN, seed_demo_users


class ClockLike(Protocol):
    def __call__(self) -> datetime: ...

    def advance(self, seconds: float) -> datetime: ...


def _events(context: SecurityContext) -> tuple[SecurityAuditEvent, ...]:
    return cast(InMemoryAuditSink, context.audit).events


def _login(context: SecurityContext, username: str = "commander") -> LoginSession:
    return context.auth.login(LoginRequest(username=username, password=DEMO_PASSWORD))


def _identity(context: SecurityContext, username: str = "commander") -> Identity:
    session = _login(context, username)
    return context.tokens.authenticate_access(session.pair.access_token).identity


def test_login_success_issues_tokens_and_audits(auth_context: SecurityContext) -> None:
    session = _login(auth_context)
    assert session.user.role is Role.COMMANDER
    assert auth_context.tokens.authenticate_access(session.pair.access_token).identity.user_id
    assert _events(auth_context)[-1].action is SecurityAuditAction.LOGIN_SUCCESS
    assert _events(auth_context)[-1].operator == "commander"


@pytest.mark.parametrize("username", ["commander", "does_not_exist"])
def test_bad_credentials_are_generic_and_audited(
    auth_context: SecurityContext, username: str
) -> None:
    with pytest.raises(AuthenticationFailed) as caught:
        auth_context.auth.login(LoginRequest(username=username, password="wrong-password"))
    assert str(caught.value) == "invalid credentials"
    event = _events(auth_context)[-1]
    assert event.action is SecurityAuditAction.LOGIN_FAILURE
    assert event.details["reason"] in {"invalid_password", "unknown_user"}


def test_lockout_and_timed_recovery(
    auth_context: SecurityContext, clock: ClockLike
) -> None:
    for _ in range(2):
        with pytest.raises(AuthenticationFailed) as failed:
            auth_context.auth.login(LoginRequest(username="commander", password="wrong"))
        assert not isinstance(failed.value, AccountLocked)

    with pytest.raises(AccountLocked) as locked:
        auth_context.auth.login(LoginRequest(username="commander", password="wrong"))
    assert locked.value.retry_after_sec == auth_context.settings.lockout_duration_sec
    assert _events(auth_context)[-1].action is SecurityAuditAction.LOGIN_LOCKED

    with pytest.raises(AccountLocked):
        auth_context.auth.login(LoginRequest(username="commander", password=DEMO_PASSWORD))

    clock.advance(auth_context.settings.lockout_duration_sec + 1)
    session = _login(auth_context)
    assert session.user.username == "commander"


def test_step_up_success_and_failure_are_audited(auth_context: SecurityContext) -> None:
    session = _login(auth_context)
    authenticated = auth_context.tokens.authenticate_access(session.pair.access_token)

    with pytest.raises(StepUpFailed):
        auth_context.auth.step_up(authenticated.identity, authenticated.session_id, "0000")
    assert _events(auth_context)[-1].action is SecurityAuditAction.STEP_UP_FAILURE

    assert (
        auth_context.auth.step_up(
            authenticated.identity,
            authenticated.session_id,
            DEMO_STEP_UP_PIN,
        )
        is True
    )
    assert _events(auth_context)[-1].action is SecurityAuditAction.STEP_UP_SUCCESS
    refreshed = auth_context.tokens.authenticate_access(session.pair.access_token)
    assert refreshed.identity.step_up_at is not None


def test_refresh_returns_rotated_pair(auth_context: SecurityContext) -> None:
    session = _login(auth_context)
    refreshed = auth_context.auth.refresh(session.pair.refresh_token)
    assert refreshed.pair.refresh_token != session.pair.refresh_token
    assert refreshed.user.user_id == session.user.user_id
    with pytest.raises(TokenRejected) as caught:
        auth_context.auth.refresh(session.pair.refresh_token)
    assert caught.value.reason is TokenRejectionReason.REFRESH_REUSED


def test_logout_revokes_the_session(auth_context: SecurityContext) -> None:
    session = _login(auth_context)
    assert auth_context.auth.logout(session.pair.access_token) is True
    with pytest.raises(TokenRejected):
        auth_context.tokens.authenticate_access(session.pair.access_token)


def test_refresh_request_model(auth_context: SecurityContext) -> None:
    session = _login(auth_context)
    model = RefreshRequest(refreshToken=session.pair.refresh_token)
    assert model.refresh_token == session.pair.refresh_token


def test_sys_admin_can_change_a_non_privileged_role(auth_context: SecurityContext) -> None:
    admin = _identity(auth_context, "sys_admin")
    target = auth_context.users.get_by_username("observer")
    assert target is not None
    target_session = _login(auth_context, "observer")

    updated = auth_context.auth.change_role(admin, target.user_id, Role.OPS_PLANNER)
    assert updated.role is Role.OPS_PLANNER
    assert _events(auth_context)[-1].action is SecurityAuditAction.ROLE_CHANGED
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(target_session.pair.access_token)
    assert caught.value.reason is TokenRejectionReason.SESSION_REVOKED


def test_sys_admin_cannot_escalate_or_change_privileged_accounts(
    auth_context: SecurityContext,
) -> None:
    admin = _identity(auth_context, "sys_admin")
    observer = auth_context.users.get_by_username("observer")
    commander = auth_context.users.get_by_username("commander")
    assert observer is not None and commander is not None

    with pytest.raises(RoleChangeForbidden):
        auth_context.auth.change_role(admin, admin.user_id, Role.COMMANDER)
    with pytest.raises(RoleChangeForbidden):
        auth_context.auth.change_role(admin, observer.user_id, Role.COMMANDER)
    with pytest.raises(RoleChangeForbidden):
        auth_context.auth.change_role(admin, observer.user_id, Role.SYS_ADMIN)
    with pytest.raises(RoleChangeForbidden):
        auth_context.auth.change_role(admin, commander.user_id, Role.OBSERVER)


def test_non_admin_cannot_change_roles(auth_context: SecurityContext) -> None:
    planner = _identity(auth_context, "ops_planner")
    observer = auth_context.users.get_by_username("observer")
    assert observer is not None
    with pytest.raises(RoleChangeForbidden):
        auth_context.auth.change_role(planner, observer.user_id, Role.COMMANDER)


def test_unknown_role_target_is_a_management_error(auth_context: SecurityContext) -> None:
    admin = _identity(auth_context, "sys_admin")
    with pytest.raises(UserManagementError):
        auth_context.auth.change_role(admin, "USR-NOPE", Role.OBSERVER)


def test_same_role_change_is_idempotent(auth_context: SecurityContext) -> None:
    admin = _identity(auth_context, "sys_admin")
    observer = auth_context.users.get_by_username("observer")
    assert observer is not None
    before = len(_events(auth_context))
    updated = auth_context.auth.change_role(admin, observer.user_id, Role.OBSERVER)
    assert updated.role is Role.OBSERVER
    assert len(_events(auth_context)) == before


def test_list_users(auth_context: SecurityContext) -> None:
    users = auth_context.auth.list_users()
    assert len(users) == 8
    assert [user.user_id for user in users] == sorted(user.user_id for user in users)


def test_audit_events_never_contain_passwords_or_pins(auth_context: SecurityContext) -> None:
    with pytest.raises(AuthenticationFailed):
        auth_context.auth.login(LoginRequest(username="commander", password="wrong-password"))
    session = _login(auth_context)
    authenticated = auth_context.tokens.authenticate_access(session.pair.access_token)
    with pytest.raises(StepUpFailed):
        auth_context.auth.step_up(authenticated.identity, authenticated.session_id, "9999")

    rendered = repr([event.details for event in _events(auth_context)])
    assert "wrong-password" not in rendered
    assert "9999" not in rendered
    assert DEMO_PASSWORD not in rendered
    assert DEMO_STEP_UP_PIN not in rendered


def test_seed_demo_users_is_fresh_per_call() -> None:
    first = seed_demo_users()
    second = seed_demo_users()
    assert first is not second
    assert first.get_by_username("commander") is not None
    assert second.get_by_username("commander") is not None
