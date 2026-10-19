"""JWT issuance, expiry, refresh rotation, revocation and step-up state."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol

import jwt
import pytest
from app.security.deps import SecurityContext
from app.security.policy import Role
from app.security.settings import SecurityConfigurationError, SecuritySettings
from app.security.tokens import (
    ALGORITHM,
    AUDIENCE,
    ISSUER,
    TokenRejected,
    TokenRejectionReason,
    TokenService,
)
from app.security.users import UserRecord, seed_demo_users

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


class ClockLike(Protocol):
    def __call__(self) -> datetime: ...

    def advance(self, seconds: float) -> datetime: ...


def _user(context: SecurityContext, username: str = "commander") -> UserRecord:
    user = context.users.get_by_username(username)
    assert user is not None
    return user


def test_access_token_round_trip(auth_context: SecurityContext) -> None:
    user = _user(auth_context)
    pair = auth_context.tokens.start_session(user)
    session = auth_context.tokens.authenticate_access(pair.access_token)
    assert session.identity.user_id == user.user_id
    assert session.identity.role is Role.COMMANDER
    assert session.identity.step_up_at is None
    assert pair.token_type == "bearer"
    assert pair.expires_in == auth_context.settings.access_token_ttl_sec


def test_wrong_token_type_is_rejected(auth_context: SecurityContext) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(pair.refresh_token)
    assert caught.value.reason is TokenRejectionReason.WRONG_TYPE


def test_tampered_token_is_rejected(auth_context: SecurityContext) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    tampered = pair.access_token[:-2] + ("AA" if pair.access_token[-2:] != "AA" else "BB")
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(tampered)
    assert caught.value.reason is TokenRejectionReason.MALFORMED


def test_token_signed_with_another_secret_is_rejected(auth_context: SecurityContext) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    payload = jwt.decode(pair.access_token, options={"verify_signature": False})
    forged = jwt.encode(payload, "another-secret-" + "q" * 40, algorithm=ALGORITHM)
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(forged)
    assert caught.value.reason is TokenRejectionReason.MALFORMED


def test_access_token_expires_on_the_injected_clock(
    auth_context: SecurityContext, clock: ClockLike
) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    clock.advance(auth_context.settings.access_token_ttl_sec + 1)
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(pair.access_token)
    assert caught.value.reason is TokenRejectionReason.EXPIRED


def test_refresh_rotates_and_old_refresh_is_reused_error(auth_context: SecurityContext) -> None:
    first = auth_context.tokens.start_session(_user(auth_context))
    second = auth_context.tokens.refresh(first.refresh_token)
    assert second.refresh_token != first.refresh_token
    auth_context.tokens.authenticate_access(second.access_token)

    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.refresh(first.refresh_token)
    assert caught.value.reason is TokenRejectionReason.REFRESH_REUSED

    third = auth_context.tokens.refresh(second.refresh_token)
    auth_context.tokens.authenticate_access(third.access_token)


def test_refresh_token_expiry(auth_context: SecurityContext, clock: ClockLike) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    clock.advance(auth_context.settings.refresh_token_ttl_sec + 1)
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.refresh(pair.refresh_token)
    assert caught.value.reason is TokenRejectionReason.EXPIRED


def test_logout_revokes_access_and_refresh(auth_context: SecurityContext) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    assert auth_context.tokens.logout(pair.access_token) is True
    with pytest.raises(TokenRejected) as access:
        auth_context.tokens.authenticate_access(pair.access_token)
    assert access.value.reason is TokenRejectionReason.SESSION_REVOKED
    with pytest.raises(TokenRejected) as refresh:
        auth_context.tokens.refresh(pair.refresh_token)
    assert refresh.value.reason is TokenRejectionReason.SESSION_REVOKED


def test_logout_with_garbage_returns_false(auth_context: SecurityContext) -> None:
    assert auth_context.tokens.logout("not-a-token") is False


def test_role_change_invalidates_old_tokens(auth_context: SecurityContext) -> None:
    user = _user(auth_context)
    pair = auth_context.tokens.start_session(user)
    auth_context.users.change_role(user.user_id, Role.OPS_PLANNER)
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(pair.access_token)
    assert caught.value.reason is TokenRejectionReason.STALE_TOKEN


def test_revoke_user_sessions(auth_context: SecurityContext) -> None:
    user = _user(auth_context)
    pair = auth_context.tokens.start_session(user)
    assert auth_context.tokens.revoke_user_sessions(user.user_id) == 1
    with pytest.raises(TokenRejected) as caught:
        auth_context.tokens.authenticate_access(pair.access_token)
    assert caught.value.reason is TokenRejectionReason.SESSION_REVOKED


def test_step_up_state_is_visible_through_existing_access_token(
    auth_context: SecurityContext, clock: ClockLike
) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    session = auth_context.tokens.authenticate_access(pair.access_token)
    assert auth_context.tokens.mark_step_up(session.session_id, now=clock()) is True
    refreshed = auth_context.tokens.authenticate_access(pair.access_token)
    assert refreshed.identity.step_up_at == clock()


def test_mark_step_up_rejects_unknown_session(
    auth_context: SecurityContext, clock: ClockLike
) -> None:
    assert auth_context.tokens.mark_step_up("SES-UNKNOWN", now=clock()) is False


def test_get_session_view(auth_context: SecurityContext) -> None:
    pair = auth_context.tokens.start_session(_user(auth_context))
    session = auth_context.tokens.authenticate_access(pair.access_token)
    view = auth_context.tokens.get_session(session.session_id)
    assert view is not None
    assert view.user_id == session.identity.user_id
    assert view.revoked is False
    assert auth_context.tokens.get_session("SES-NOPE") is None


def test_token_service_refuses_weak_secret() -> None:
    users = seed_demo_users()
    with pytest.raises(SecurityConfigurationError):
        TokenService(
            settings=SecuritySettings(auth_enabled=True),
            users=users,
            clock=lambda: NOW,
        )


def test_token_service_demo_mode_accepts_default_secret() -> None:
    users = seed_demo_users()
    TokenService(
        settings=SecuritySettings(auth_enabled=False),
        users=users,
        clock=lambda: NOW,
    )


def test_issuer_and_audience_are_enforced(auth_context: SecurityContext) -> None:
    user = _user(auth_context)
    pair = auth_context.tokens.start_session(user)
    payload = jwt.decode(pair.access_token, options={"verify_signature": False})
    assert payload["iss"] == ISSUER
    assert payload["aud"] == AUDIENCE
    wrong_aud = dict(payload)
    wrong_aud["aud"] = "someone-else"
    forged = jwt.encode(wrong_aud, auth_context.settings.jwt_secret, algorithm=ALGORITHM)
    with pytest.raises(TokenRejected):
        auth_context.tokens.authenticate_access(forged)
