"""FastAPI adapters for the security package.

The router is deliberately **not** mounted in ``app/main.py``. B8 wires it with:

    context = build_security_context()
    app.state.security_context = context
    app.include_router(create_auth_router(context), prefix="/api")

and protects existing routes with ``Depends(require(Permission.X))``. See
``backend/docs/SECURITY_WIRING.md`` for the full checklist.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, FastAPI, Header, HTTPException, Request, status

from app.domain.enums import EventType
from app.security.audit_events import (
    AuditSink,
    NullAuditSink,
    access_denied_event,
    spoof_attempt_event,
)
from app.security.auth import (
    AccountLocked,
    AuthenticationFailed,
    AuthService,
    ChangeRoleRequest,
    LoginRequest,
    LoginSession,
    RefreshRequest,
    RoleChangeForbidden,
    StepUpFailed,
    StepUpRequest,
    TokenResponse,
    UserManagementError,
    UserView,
    user_view,
)
from app.security.policy import (
    AccessContext,
    Identity,
    Permission,
    Role,
    is_allowed,
)
from app.security.settings import SecuritySettings, get_security_settings
from app.security.tokens import TokenRejected, TokenService
from app.security.users import UserStore, seed_demo_users

Clock = Callable[[], datetime]

_DEMO_USER_ID = "USR-DEMO"
_DEMO_DISPLAY_NAME = "Demo Commander"


class Unauthenticated(Exception):
    """No usable bearer token was supplied while auth is enabled."""


def system_clock() -> datetime:
    """Production clock. Tests must inject their own clock."""
    return datetime.now(UTC)


@dataclass
class SecurityContext:
    """Everything the API needs to authenticate, authorise and audit."""

    settings: SecuritySettings
    users: UserStore
    tokens: TokenService
    auth: AuthService
    audit: AuditSink
    clock: Clock
    demo_identity: Identity

    @property
    def auth_enabled(self) -> bool:
        return self.settings.auth_enabled


def build_security_context(
    settings: SecuritySettings | None = None,
    *,
    clock: Clock | None = None,
    audit: AuditSink | None = None,
    users: UserStore | None = None,
) -> SecurityContext:
    """Compose the security package.

    Fails fast with :class:`~app.security.settings.SecurityConfigurationError`
    when auth is enabled and the JWT secret is missing, short or the default.
    """
    resolved = settings if settings is not None else get_security_settings()
    resolved.validate_for_auth()
    clock_fn = clock if clock is not None else system_clock
    on_clock = clock_fn()
    if on_clock.tzinfo is None:
        raise ValueError("clock must return timezone-aware datetimes")

    user_store = users if users is not None else seed_demo_users()
    sink: AuditSink = audit if audit is not None else NullAuditSink()
    tokens = TokenService(settings=resolved, users=user_store, clock=clock_fn)
    auth = AuthService(
        settings=resolved,
        users=user_store,
        tokens=tokens,
        audit=sink,
        clock=clock_fn,
    )
    demo = Identity(
        user_id=_DEMO_USER_ID,
        username=resolved.demo_default_operator,
        role=Role.COMMANDER,
        display_name=_DEMO_DISPLAY_NAME,
    )
    return SecurityContext(
        settings=resolved,
        users=user_store,
        tokens=tokens,
        auth=auth,
        audit=sink,
        clock=clock_fn,
        demo_identity=demo,
    )


def install_security_context(app: FastAPI, context: SecurityContext) -> None:
    """Attach the context to ``app.state`` for dependency lookup."""
    app.state.security_context = context


def get_security_context(request: Request) -> SecurityContext:
    context = getattr(request.app.state, "security_context", None)
    if not isinstance(context, SecurityContext):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Security is not configured.",
        )
    return context


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.casefold() != "bearer" or not token.strip():
        return None
    return token.strip()


def resolve_identity(context: SecurityContext, authorization: str | None) -> Identity:
    """Resolve the caller identity from the bearer token.

    With auth disabled every caller is the configured demo commander; with auth
    enabled a valid access token is mandatory.
    """
    if not context.auth_enabled:
        return context.demo_identity
    token = _bearer_token(authorization)
    if token is None:
        raise Unauthenticated("missing bearer token")
    try:
        return context.tokens.authenticate_access(token).identity
    except TokenRejected as exc:
        raise Unauthenticated("invalid or expired token") from exc


def _audit_denied(
    context: SecurityContext,
    identity: Identity,
    permission: Permission,
    path: str,
) -> None:
    context.audit.record(
        access_denied_event(
            operator=identity.username,
            role=identity.role.value,
            permission=permission.value,
            path=path,
            timestamp=context.clock(),
        )
    )


def require(
    permission: Permission,
    *,
    context: SecurityContext | None = None,
) -> Callable[..., Identity]:
    """Dependency factory enforcing one permission.

    Pass ``context`` explicitly in unit tests; in the app the context is read
    from ``app.state.security_context`` (installed by :func:`install_security_context`).
    """

    def dependency(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
    ) -> Identity:
        active = context if context is not None else get_security_context(request)
        identity = _identity_or_401(active, authorization)
        if not is_allowed(identity, permission):
            _audit_denied(active, identity, permission, request.url.path)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return identity

    return dependency


def enforce_permission(
    context: SecurityContext,
    identity: Identity,
    permission: Permission,
    *,
    path: str,
    access_context: AccessContext | None = None,
) -> None:
    """Enforce a permission inside a handler (after parsing the action)."""
    if is_allowed(identity, permission, access_context):
        return
    _audit_denied(context, identity, permission, path)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to perform this action.",
    )


_DECISION_PERMISSIONS: dict[str, Permission] = {
    "approve": Permission.DECIDE_APPROVE,
    "reject": Permission.DECIDE_REJECT,
    "modify": Permission.DECIDE_MODIFY,
}

_SIM_PERMISSIONS: dict[str, Permission] = {
    "pause": Permission.SIM_PAUSE,
    "resume": Permission.SIM_RESUME,
    "speed": Permission.SIM_SPEED,
    "reset": Permission.SIM_RESET,
}


def enforce_decision(
    context: SecurityContext,
    identity: Identity,
    decision: str,
    *,
    path: str,
) -> None:
    """Enforce the approve/reject/modify permission for one decision body."""
    permission = _DECISION_PERMISSIONS.get(decision)
    if permission is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unknown decision.",
        )
    enforce_permission(context, identity, permission, path=path)


def enforce_sim_control(
    context: SecurityContext,
    identity: Identity,
    action: str,
    *,
    path: str,
) -> None:
    """Enforce pause/resume/speed/reset for one sim-control body."""
    permission = _SIM_PERMISSIONS.get(action)
    if permission is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unknown sim action.",
        )
    enforce_permission(context, identity, permission, path=path)


def enforce_event_injection(
    context: SecurityContext,
    identity: Identity,
    event_type: EventType,
    *,
    path: str,
) -> None:
    """Enforce the per-event-type injection rule inside an event handler."""
    if is_allowed(identity, Permission.INJECT_EVENT, AccessContext(event_type=event_type)):
        return
    _audit_denied(context, identity, Permission.INJECT_EVENT, path)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You may not inject this event type.",
    )


def require_event_injection(
    *,
    context: SecurityContext | None = None,
) -> Callable[..., Awaitable[Identity]]:
    """Dependency factory enforcing the per-event-type injection rule.

    It reads ``{"type": "..."}`` from the request body (cached by Starlette, so
    the endpoint can parse the same body again).
    """

    async def dependency(
        request: Request,
        authorization: Annotated[str | None, Header()] = None,
    ) -> Identity:
        active = context if context is not None else get_security_context(request)
        identity = _identity_or_401(active, authorization)
        try:
            payload = await request.json()
        except Exception as exc:  # pragma: no cover - malformed JSON is a 422 in FastAPI
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Request body must be valid JSON.",
            ) from exc
        raw_type = payload.get("type") if isinstance(payload, dict) else None
        try:
            event_type = EventType(str(raw_type))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Unknown event type.",
            ) from exc
        enforce_event_injection(active, identity, event_type, path=request.url.path)
        return identity

    return dependency


def resolve_operator(
    identity: Identity,
    body_operator: str | None,
    *,
    context: SecurityContext,
    path: str,
) -> str:
    """Return the canonical operator, ignoring client-supplied identity.

    Auth enabled: the token identity wins. A different body value is audited as
    ``SPOOF_ATTEMPT``. Auth disabled: the body value is honoured for demos, with
    ``demo_default_operator`` as the fallback.
    """
    if not context.auth_enabled:
        candidate = (body_operator or "").strip()
        return candidate or context.settings.demo_default_operator

    canonical = identity.username
    provided = (body_operator or "").strip()
    if provided and provided.casefold() not in {
        identity.username.casefold(),
        identity.display_name.casefold(),
    }:
        context.audit.record(
            spoof_attempt_event(
                operator=canonical,
                body_operator=provided,
                path=path,
                timestamp=context.clock(),
            )
        )
    return canonical


def _token_from(authorization: str | None) -> str:
    token = _bearer_token(authorization)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _identity_or_401(context: SecurityContext, authorization: str | None) -> Identity:
    try:
        return resolve_identity(context, authorization)
    except Unauthenticated as exc:
        raise _unauthorized() from exc


def _token_response(session: LoginSession) -> TokenResponse:
    pair = session.pair
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        expires_in=pair.expires_in,
        token_type=pair.token_type,
        user=user_view(session.user),
    )


def create_auth_router(context: SecurityContext) -> APIRouter:
    """Build ``/auth/*`` routes. Mount with ``prefix="/api"``."""
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/login", response_model=TokenResponse)
    def login(body: LoginRequest) -> TokenResponse:
        try:
            return _token_response(context.auth.login(body))
        except AccountLocked as exc:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail="Account temporarily locked.",
                headers={"Retry-After": str(exc.retry_after_sec)},
            ) from exc
        except AuthenticationFailed as exc:
            raise _unauthorized() from exc

    @router.post("/refresh", response_model=TokenResponse)
    def refresh(body: RefreshRequest) -> TokenResponse:
        try:
            return _token_response(context.auth.refresh(body.refresh_token))
        except TokenRejected as exc:
            raise _unauthorized() from exc

    @router.post("/logout")
    def logout(
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, bool]:
        token = _token_from(authorization)
        return {"ok": context.auth.logout(token)}

    @router.post("/step-up")
    def step_up(
        body: StepUpRequest,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        identity = _identity_or_401(context, authorization)
        token = _token_from(authorization)
        try:
            session = context.tokens.authenticate_access(token)
        except TokenRejected as exc:
            raise _unauthorized() from exc
        try:
            context.auth.step_up(identity, session.session_id, body.pin)
        except StepUpFailed as exc:
            raise _unauthorized() from exc
        return {"ok": True, "stepUpExpiresInSec": context.settings.step_up_window_sec}

    @router.get("/me", response_model=UserView)
    def me(
        authorization: Annotated[str | None, Header()] = None,
    ) -> UserView:
        identity = _identity_or_401(context, authorization)
        return UserView(
            id=identity.user_id,
            username=identity.username,
            display_name=identity.display_name,
            role=identity.role,
            active=True,
        )

    @router.get("/users", response_model=list[UserView])
    def list_users(
        authorization: Annotated[str | None, Header()] = None,
    ) -> list[UserView]:
        identity = _identity_or_401(context, authorization)
        if not is_allowed(identity, Permission.MANAGE_USERS):
            _audit_denied(context, identity, Permission.MANAGE_USERS, "/api/auth/users")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return [user_view(user) for user in context.auth.list_users()]

    @router.patch("/users/{user_id}/role", response_model=UserView)
    def change_role(
        user_id: str,
        body: ChangeRoleRequest,
        authorization: Annotated[str | None, Header()] = None,
    ) -> UserView:
        identity = _identity_or_401(context, authorization)
        if not is_allowed(identity, Permission.MANAGE_USERS):
            _audit_denied(
                context,
                identity,
                Permission.MANAGE_USERS,
                f"/api/auth/users/{user_id}/role",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        try:
            return user_view(context.auth.change_role(identity, user_id, body.role))
        except RoleChangeForbidden as exc:
            context.audit.record(
                access_denied_event(
                    operator=identity.username,
                    role=identity.role.value,
                    permission=f"role_change:{body.role.value}",
                    path=f"/api/auth/users/{user_id}/role",
                    timestamp=context.clock(),
                )
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role change is not permitted.",
            ) from exc
        except UserManagementError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            ) from exc

    return router
