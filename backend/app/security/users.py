"""In-memory demo users, password hashing and lockout.

Passwords are hashed with the standard-library ``hashlib.scrypt``; no new
dependency is introduced. The seeded credentials are fictional demo data and
are documented in ``backend/docs/SECURITY.md``. Authentication is disabled by
default (``AUTH_ENABLED=false``), so these accounts only matter when a demo
explicitly turns it on.

The store is process-local and intentionally not persisted: RBAC and sessions
are B8 integration concerns. Replace it with a real directory service before
any non-demo use.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import threading
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum

from app.security.policy import Role

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_MAXMEM = 64 * 1024 * 1024
_SALT_BYTES = 16

#: Fictional demo accounts. Passwords are only used to seed the demo store.
DEMO_CREDENTIALS: dict[str, tuple[str, str, Role]] = {
    "observer": ("USR-0001", "FLT LT R. OKAFOR", Role.OBSERVER),
    "intel_officer": ("USR-0002", "SQN LDR A. VOSS", Role.INTEL_OFFICER),
    "maintenance_officer": ("USR-0003", "FLT LT M. CHEN", Role.MAINTENANCE_OFFICER),
    "ops_planner": ("USR-0004", "WG CDR P. NAIR", Role.OPS_PLANNER),
    "commander": ("USR-0005", "COL. J. MERCER", Role.COMMANDER),
    "commander_2": ("USR-0006", "COL. S. ADEYEMI", Role.COMMANDER),
    "auditor": ("USR-0007", "MR. K. IBRAHIM", Role.AUDITOR),
    "sys_admin": ("USR-0008", "MS. L. DUBOIS", Role.SYS_ADMIN),
}

#: Password for every seeded demo account. Demo-only, never used in production.
DEMO_PASSWORD = "veridia-demo"

#: Step-up PIN for every seeded demo account. Demo-only.
DEMO_STEP_UP_PIN = "4821"


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value.encode("ascii"))


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """Return a self-describing scrypt hash: ``scrypt$n$r$p$salt$digest``."""
    if not password:
        raise ValueError("password must not be empty")
    actual_salt = salt if salt is not None else secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=actual_salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
        maxmem=_SCRYPT_MAXMEM,
    )
    salt_text = _b64encode(actual_salt)
    digest_text = _b64encode(digest)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt_text}${digest_text}"


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time verification of an encoded scrypt hash."""
    try:
        scheme, n_text, r_text, p_text, salt_text, digest_text = encoded.split("$")
        if scheme != "scrypt":
            return False
        n, r, p = int(n_text), int(r_text), int(p_text)
        salt = _b64decode(salt_text)
        expected = _b64decode(digest_text)
    except (ValueError, TypeError):
        return False
    if n < 2 or r < 1 or p < 1:
        return False
    try:
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=len(expected),
            maxmem=_SCRYPT_MAXMEM,
        )
    except (ValueError, OverflowError):
        return False
    return hmac.compare_digest(actual, expected)


class AuthFailure(StrEnum):
    """Internal failure reasons. Callers must return one generic message."""

    UNKNOWN_USER = "unknown_user"
    INVALID_PASSWORD = "invalid_password"
    LOCKED = "locked"
    INACTIVE = "inactive"
    MALFORMED_STORE = "malformed_store"


@dataclass(frozen=True)
class UserRecord:
    """A demo user. Immutable; the store replaces records on change."""

    user_id: str
    username: str
    display_name: str
    role: Role
    password_hash: str
    pin_hash: str | None = None
    active: bool = True
    failed_attempts: int = 0
    locked_until: datetime | None = None
    token_version: int = 0


@dataclass(frozen=True)
class AuthAttempt:
    """Outcome of a credential check."""

    user: UserRecord | None
    failure: AuthFailure | None = None
    just_locked: bool = False
    retry_after_sec: int | None = None

    @property
    def ok(self) -> bool:
        return self.user is not None and self.failure is None


class UserStore:
    """Thread-safe in-memory user directory with lockout."""

    def __init__(self, users: list[UserRecord] | None = None) -> None:
        self._lock = threading.Lock()
        self._users: dict[str, UserRecord] = {}
        self._dummy_hash = hash_password("dummy-password-for-timing")
        for user in users or []:
            self.add(user)

    def add(self, user: UserRecord) -> None:
        with self._lock:
            if user.user_id in self._users:
                raise ValueError(f"duplicate user id: {user.user_id}")
            if self._find_by_username(user.username) is not None:
                raise ValueError(f"duplicate username: {user.username}")
            self._users[user.user_id] = user

    def _find_by_username(self, username: str) -> UserRecord | None:
        wanted = username.strip().casefold()
        for user in self._users.values():
            if user.username.casefold() == wanted:
                return user
        return None

    def get(self, user_id: str) -> UserRecord | None:
        with self._lock:
            return self._users.get(user_id)

    def get_by_username(self, username: str) -> UserRecord | None:
        with self._lock:
            return self._find_by_username(username)

    def list_users(self) -> list[UserRecord]:
        with self._lock:
            return sorted(self._users.values(), key=lambda user: user.user_id)

    def verify_credentials(
        self,
        username: str,
        password: str,
        *,
        now: datetime,
        lockout_failures: int,
        lockout_duration_sec: int,
    ) -> AuthAttempt:
        """Check credentials, applying and clearing lockout."""
        if now.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        with self._lock:
            user = self._find_by_username(username)
            if user is None:
                verify_password(password, self._dummy_hash)
                return AuthAttempt(None, AuthFailure.UNKNOWN_USER)

            if user.locked_until is not None:
                if now < user.locked_until:
                    retry = max(1, int((user.locked_until - now).total_seconds()))
                    return AuthAttempt(None, AuthFailure.LOCKED, retry_after_sec=retry)
                user = replace(user, locked_until=None, failed_attempts=0)
                self._users[user.user_id] = user

            if not user.active:
                return AuthAttempt(None, AuthFailure.INACTIVE)

            if not verify_password(password, user.password_hash):
                attempts = user.failed_attempts + 1
                just_locked = attempts >= lockout_failures
                locked_until = (
                    now + timedelta(seconds=lockout_duration_sec) if just_locked else None
                )
                self._users[user.user_id] = replace(
                    user,
                    failed_attempts=attempts,
                    locked_until=locked_until,
                )
                if just_locked:
                    return AuthAttempt(
                        None,
                        AuthFailure.LOCKED,
                        just_locked=True,
                        retry_after_sec=lockout_duration_sec,
                    )
                return AuthAttempt(None, AuthFailure.INVALID_PASSWORD)

            self._users[user.user_id] = replace(user, failed_attempts=0, locked_until=None)
            return AuthAttempt(self._users[user.user_id])

    def change_role(self, user_id: str, role: Role) -> UserRecord:
        """Change a role and invalidate existing sessions for that user."""
        with self._lock:
            user = self._users.get(user_id)
            if user is None:
                raise KeyError(user_id)
            updated = replace(user, role=role, token_version=user.token_version + 1)
            self._users[user_id] = updated
            return updated


def seed_demo_users() -> UserStore:
    """Build the seeded fictional demo directory."""
    users = [
        UserRecord(
            user_id=user_id,
            username=username,
            display_name=display_name,
            role=role,
            password_hash=hash_password(DEMO_PASSWORD),
            pin_hash=hash_password(DEMO_STEP_UP_PIN),
        )
        for username, (user_id, display_name, role) in DEMO_CREDENTIALS.items()
    ]
    return UserStore(users)


def verify_step_up_pin(user: UserRecord, pin: str) -> bool:
    """Check a step-up PIN. A user without a PIN can never step up."""
    if not user.pin_hash or not pin:
        return False
    return verify_password(pin, user.pin_hash)
