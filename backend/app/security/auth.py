"""Authentication, refresh, logout, step-up and user-role orchestration.

The service is framework-free. ``app.security.deps`` adapts it to FastAPI.
All audit events go through an :class:`~app.security.audit_events.AuditSink`;
no secret material is logged.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from pydantic import Field

from app.domain.base import WireModel
from app.security.audit_events import (
    AuditSink,
    SecurityAuditAction,
    login_failure_event,
    login_success_event,
    make_event,
)
from app.security.policy import Identity, Role
from app.security.settings import SecuritySettings
from app.security.tokens import (
    TokenPair,
    TokenRejected,
    TokenRejectionReason,
    TokenService,
)
from app.security.users import (
    AuthFailure,
    UserRecord,
    UserStore,
    verify_step_up_pin,
)

Clock = Callable[[], datetime]


class AuthenticationFailed(Exception):
    """Generic credential failure. Never expose the internal reason."""

    def __init__(self, reason: AuthFailure | str) -> None:
        super().__init__("invalid credentials")
        self.reason = reason


class AccountLocked(AuthenticationFailed):
    """Credentials are correct enough to be locked out."""

    def __init__(self, retry_after_sec: int) -> None:
        super().__init__(AuthFailure.LOCKED)
        self.retry_after_sec = retry_after_sec


class StepUpFailed(Exception):
    """The PIN was missing or wrong."""


class UserManagementError(Exception):
    """A user lookup or role change could not be performed."""


class RoleChangeForbidden(UserManagementError):
    """The requested role change is an escalation or self-modification."""


class LoginRequest(WireModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(WireModel):
    refresh_token: str = Field(min_length=1)


class StepUpRequest(WireModel):
    pin: str = Field(min_length=1, max_length=32)


class ChangeRoleRequest(WireModel):
    role: Role


class UserView(WireModel):
    id: str
    username: str
    display_name: str
    role: Role
    active: bool


class TokenResponse(WireModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
    user: UserView


@dataclass(frozen=True)
class LoginSession:
    pair: TokenPair
    user: UserRecord


def user_view(user: UserRecord) -> UserView:
    return UserView(
        id=user.user_id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        active=user.active,
    )


@dataclass
class AuthService:
    settings: SecuritySettings
    users: UserStore
    tokens: TokenService
    audit: AuditSink
    clock: Clock

    def _now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError("clock must return timezone-aware datetimes")
        return now

    def login(self, request: LoginRequest) -> LoginSession:
        now = self._now()
        attempt = self.users.verify_credentials(
            request.username,
            request.password,
            now=now,
            lockout_failures=self.settings.lockout_failures,
            lockout_duration_sec=self.settings.lockout_duration_sec,
        )
        if not attempt.ok or attempt.user is None:
            reason = attempt.failure or AuthFailure.INVALID_PASSWORD
            self.audit.record(
                login_failure_event(
                    username=request.username,
                    reason=reason.value,
                    timestamp=now,
                    locked=attempt.just_locked,
                )
            )
            if reason is AuthFailure.LOCKED and attempt.retry_after_sec is not None:
                raise AccountLocked(attempt.retry_after_sec)
            raise AuthenticationFailed(reason)

        user = attempt.user
        pair = self.tokens.start_session(user)
        self.audit.record(
            login_success_event(
                user_id=user.user_id,
                username=user.username,
                role=user.role.value,
                timestamp=now,
            )
        )
        return LoginSession(pair=pair, user=user)

    def refresh(self, refresh_token: str) -> LoginSession:
        pair = self.tokens.refresh(refresh_token)
        session = self.tokens.authenticate_access(pair.access_token)
        user = self.users.get(session.identity.user_id)
        if user is None:
            raise TokenRejected(TokenRejectionReason.USER_UNKNOWN)
        return LoginSession(pair=pair, user=user)

    def logout(self, token: str) -> bool:
        return self.tokens.logout(token)

    def step_up(self, identity: Identity, session_id: str, pin: str) -> bool:
        now = self._now()
        user = self.users.get(identity.user_id)
        if user is None or not user.active or not verify_step_up_pin(user, pin):
            self.audit.record(
                make_event(
                    SecurityAuditAction.STEP_UP_FAILURE,
                    operator=identity.username,
                    target_id=session_id,
                    timestamp=now,
                    details={"role": identity.role.value},
                )
            )
            raise StepUpFailed("step-up failed")
        if not self.tokens.mark_step_up(session_id, now=now):
            raise StepUpFailed("session is not active")
        self.audit.record(
            make_event(
                SecurityAuditAction.STEP_UP_SUCCESS,
                operator=identity.username,
                target_id=session_id,
                timestamp=now,
                details={"role": identity.role.value},
            )
        )
        return True

    def list_users(self) -> list[UserRecord]:
        return self.users.list_users()

    def change_role(self, actor: Identity, user_id: str, new_role: Role) -> UserRecord:
        """Change a non-commander, non-admin user's role.

        A sys-admin cannot change their own role, appoint a commander or
        sys-admin, or modify an existing commander/sys-admin account. This
        blocks the obvious privilege-escalation path in the demo directory.
        """
        if actor.role is not Role.SYS_ADMIN:
            raise RoleChangeForbidden("only sys_admin may change roles")
        if actor.user_id == user_id:
            raise RoleChangeForbidden("cannot change your own role")
        target = self.users.get(user_id)
        if target is None:
            raise UserManagementError("user not found")
        if target.role in {Role.COMMANDER, Role.SYS_ADMIN}:
            raise RoleChangeForbidden("cannot modify a privileged account")
        if new_role in {Role.COMMANDER, Role.SYS_ADMIN}:
            raise RoleChangeForbidden("cannot grant a privileged role")
        if target.role is new_role:
            return target

        now = self._now()
        updated = self.users.change_role(user_id, new_role)
        self.tokens.revoke_user_sessions(user_id, reason="role_changed")
        self.audit.record(
            make_event(
                SecurityAuditAction.ROLE_CHANGED,
                operator=actor.username,
                target_id=user_id,
                timestamp=now,
                details={"previousRole": target.role.value, "newRole": new_role.value},
            )
        )
        return updated
