"""JWT access/refresh tokens and in-memory sessions.

PyJWT is already a project dependency (``pyjwt``); no new package is added.
Only HS256 is accepted, the secret comes from settings/environment, tokens are
bound to a server-side session, and a user's tokens are invalidated when the
role changes or the session is revoked.

The clock is injected so tests and the simulation remain deterministic.
"""

from __future__ import annotations

import secrets
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum

import jwt
from jwt.types import Options

from app.security.policy import Identity, Role
from app.security.settings import SecuritySettings
from app.security.users import UserRecord, UserStore

ISSUER = "airops-dss"
AUDIENCE = "airops-dss-api"
ALGORITHM = "HS256"

Clock = Callable[[], datetime]


class TokenRejectionReason(StrEnum):
    """Internal rejection reasons; never returned verbatim to clients."""

    MALFORMED = "malformed"
    EXPIRED = "expired"
    WRONG_TYPE = "wrong_type"
    SESSION_UNKNOWN = "session_unknown"
    SESSION_REVOKED = "session_revoked"
    SESSION_EXPIRED = "session_expired"
    USER_UNKNOWN = "user_unknown"
    USER_INACTIVE = "user_inactive"
    STALE_TOKEN = "stale_token"
    REFRESH_REUSED = "refresh_reused"


class TokenRejected(Exception):
    """Internal token rejection. The API must not expose the reason verbatim."""

    def __init__(self, reason: TokenRejectionReason) -> None:
        super().__init__(reason.value)
        self.reason = reason


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"


@dataclass(frozen=True)
class TokenClaims:
    user_id: str
    username: str
    role: Role
    display_name: str
    session_id: str
    token_type: str
    jti: str
    token_version: int
    issued_at: datetime
    expires_at: datetime


@dataclass(frozen=True)
class AuthenticatedSession:
    identity: Identity
    session_id: str
    expires_at: datetime
    claims: TokenClaims


@dataclass
class SessionRecord:
    session_id: str
    user_id: str
    created_at: datetime
    absolute_expires_at: datetime
    refresh_jti: str
    step_up_at: datetime | None = None
    revoked: bool = False
    revoked_reason: str | None = None


@dataclass(frozen=True)
class SessionView:
    session_id: str
    user_id: str
    created_at: datetime
    absolute_expires_at: datetime
    step_up_at: datetime | None
    revoked: bool


@dataclass
class TokenService:
    """Issue, verify, refresh and revoke session-bound JWTs."""

    settings: SecuritySettings
    users: UserStore
    clock: Clock
    _sessions: dict[str, SessionRecord] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.settings.validate_for_auth()

    def _now(self) -> datetime:
        now = self.clock()
        if now.tzinfo is None:
            raise ValueError("clock must return timezone-aware datetimes")
        return now

    def _encode(
        self,
        user: UserRecord,
        session: SessionRecord,
        *,
        token_type: str,
        jti: str,
        expires_at: datetime,
        now: datetime,
    ) -> str:
        payload = {
            "sub": user.user_id,
            "username": user.username,
            "name": user.display_name,
            "role": user.role.value,
            "sid": session.session_id,
            "type": token_type,
            "jti": jti,
            "ver": user.token_version,
            "iss": ISSUER,
            "aud": AUDIENCE,
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        return jwt.encode(payload, self.settings.jwt_secret, algorithm=ALGORITHM)

    def start_session(self, user: UserRecord) -> TokenPair:
        """Create a session and return the first access/refresh pair."""
        now = self._now()
        session = SessionRecord(
            session_id=f"SES-{secrets.token_hex(8).upper()}",
            user_id=user.user_id,
            created_at=now,
            absolute_expires_at=now + timedelta(seconds=self.settings.absolute_session_limit_sec),
            refresh_jti=f"JTI-{secrets.token_hex(12)}",
        )
        with self._lock:
            self._sessions[session.session_id] = session
        return self._issue_pair(user, session, now)

    def _issue_pair(self, user: UserRecord, session: SessionRecord, now: datetime) -> TokenPair:
        access_exp = min(
            now + timedelta(seconds=self.settings.access_token_ttl_sec),
            session.absolute_expires_at,
        )
        refresh_exp = min(
            now + timedelta(seconds=self.settings.refresh_token_ttl_sec),
            session.absolute_expires_at,
        )
        access = self._encode(
            user,
            session,
            token_type="access",
            jti=f"JTI-{secrets.token_hex(12)}",
            expires_at=access_exp,
            now=now,
        )
        refresh = self._encode(
            user,
            session,
            token_type="refresh",
            jti=session.refresh_jti,
            expires_at=refresh_exp,
            now=now,
        )
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=max(0, int((access_exp - now).total_seconds())),
        )

    def _decode(self, token: str, *, expected_type: str, verify_exp: bool = True) -> TokenClaims:
        options: Options = {
            "require": ["sub", "sid", "type", "jti", "ver", "exp", "iat"],
            # PyJWT would validate exp/iat/nbf against the real wall clock. The
            # simulation injects its own clock, so expiry is checked below.
            "verify_exp": False,
            "verify_iat": False,
            "verify_nbf": False,
        }
        try:
            payload = jwt.decode(
                token,
                self.settings.jwt_secret,
                algorithms=[ALGORITHM],
                audience=AUDIENCE,
                issuer=ISSUER,
                options=options,
            )
        except jwt.InvalidTokenError as exc:
            raise TokenRejected(TokenRejectionReason.MALFORMED) from exc

        try:
            claims = TokenClaims(
                user_id=str(payload["sub"]),
                username=str(payload["username"]),
                role=Role(str(payload["role"])),
                display_name=str(payload.get("name", "")),
                session_id=str(payload["sid"]),
                token_type=str(payload["type"]),
                jti=str(payload["jti"]),
                token_version=int(payload["ver"]),
                issued_at=datetime.fromtimestamp(int(payload["iat"]), tz=UTC),
                expires_at=datetime.fromtimestamp(int(payload["exp"]), tz=UTC),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise TokenRejected(TokenRejectionReason.MALFORMED) from exc

        if claims.token_type != expected_type:
            raise TokenRejected(TokenRejectionReason.WRONG_TYPE)
        if verify_exp and claims.expires_at <= self._now():
            raise TokenRejected(TokenRejectionReason.EXPIRED)
        return claims

    def _session_for(self, claims: TokenClaims, now: datetime) -> SessionRecord:
        """Look up a live session. Caller must hold ``_lock``."""
        session = self._sessions.get(claims.session_id)
        if session is None:
            raise TokenRejected(TokenRejectionReason.SESSION_UNKNOWN)
        if session.revoked:
            raise TokenRejected(TokenRejectionReason.SESSION_REVOKED)
        if now >= session.absolute_expires_at:
            raise TokenRejected(TokenRejectionReason.SESSION_EXPIRED)
        return session

    def authenticate_access(self, token: str) -> AuthenticatedSession:
        """Validate an access token and return the current identity."""
        claims = self._decode(token, expected_type="access")
        now = self._now()
        with self._lock:
            session = self._session_for(claims, now)
            user = self.users.get(claims.user_id)
            if user is None:
                raise TokenRejected(TokenRejectionReason.USER_UNKNOWN)
            if not user.active:
                raise TokenRejected(TokenRejectionReason.USER_INACTIVE)
            if user.token_version != claims.token_version or user.role is not claims.role:
                raise TokenRejected(TokenRejectionReason.STALE_TOKEN)
            identity = Identity(
                user_id=user.user_id,
                username=user.username,
                role=user.role,
                display_name=user.display_name,
                step_up_at=session.step_up_at,
            )
            return AuthenticatedSession(
                identity=identity,
                session_id=session.session_id,
                expires_at=claims.expires_at,
                claims=claims,
            )

    def refresh(self, refresh_token: str) -> TokenPair:
        """Rotate the refresh token and issue a fresh access token."""
        claims = self._decode(refresh_token, expected_type="refresh")
        now = self._now()
        with self._lock:
            session = self._session_for(claims, now)
            if session.refresh_jti != claims.jti:
                raise TokenRejected(TokenRejectionReason.REFRESH_REUSED)
            user = self.users.get(claims.user_id)
            if user is None:
                raise TokenRejected(TokenRejectionReason.USER_UNKNOWN)
            if not user.active:
                raise TokenRejected(TokenRejectionReason.USER_INACTIVE)
            if user.token_version != claims.token_version or user.role is not claims.role:
                raise TokenRejected(TokenRejectionReason.STALE_TOKEN)
            session.refresh_jti = f"JTI-{secrets.token_hex(12)}"
            return self._issue_pair(user, session, now)

    def logout(self, token: str) -> bool:
        """Revoke the session behind a signed access or refresh token."""
        claims: TokenClaims | None = None
        for expected in ("access", "refresh"):
            try:
                claims = self._decode(token, expected_type=expected, verify_exp=False)
                break
            except TokenRejected:
                continue
        if claims is None:
            return False
        with self._lock:
            session = self._sessions.get(claims.session_id)
            if session is None:
                return False
            session.revoked = True
            session.revoked_reason = "logout"
            return True

    def revoke_session(self, session_id: str, *, reason: str = "revoked") -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            session.revoked = True
            session.revoked_reason = reason
            return True

    def revoke_user_sessions(self, user_id: str, *, reason: str = "role_changed") -> int:
        with self._lock:
            revoked = 0
            for session in self._sessions.values():
                if session.user_id == user_id and not session.revoked:
                    session.revoked = True
                    session.revoked_reason = reason
                    revoked += 1
            return revoked

    def mark_step_up(self, session_id: str, *, now: datetime) -> bool:
        if now.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or session.revoked or now >= session.absolute_expires_at:
                return False
            session.step_up_at = now
            return True

    def get_session(self, session_id: str) -> SessionView | None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return SessionView(
                session_id=session.session_id,
                user_id=session.user_id,
                created_at=session.created_at,
                absolute_expires_at=session.absolute_expires_at,
                step_up_at=session.step_up_at,
                revoked=session.revoked,
            )
