"""Security-owned settings for authentication, sessions and approval rules.

The main application settings (``app/config.py``) already expose
``AUTH_ENABLED`` and ``JWT_SECRET``. This class deliberately reads the **same
environment variable names** so the two can never disagree; a unit test asserts
the defaults match. ``app/config.py`` is owned by the main backend session and
is not edited here. B8 wiring should make ``app/config.py`` delegate to this
class (see ``backend/docs/SECURITY_WIRING.md``).

No secret is ever required in demo mode. When authentication is enabled the
secret must be supplied through the environment and be at least
``MIN_JWT_SECRET_LENGTH`` characters; the insecure default is rejected.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

#: The insecure placeholder shipped in ``app/config.py`` for demo mode.
DEFAULT_JWT_SECRET = "dev-only-change-me"

#: Minimum acceptable HMAC secret length when authentication is enabled.
MIN_JWT_SECRET_LENGTH = 32


class SecurityConfigurationError(RuntimeError):
    """Raised when authentication is enabled with an unusable configuration."""


class SecuritySettings(BaseSettings):
    """Authentication, session and approval configuration.

    Environment variables use the same names as ``app/config.py``:
    ``AUTH_ENABLED`` and ``JWT_SECRET``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    auth_enabled: bool = False
    jwt_secret: str = DEFAULT_JWT_SECRET

    access_token_ttl_sec: int = Field(default=900, ge=30)
    refresh_token_ttl_sec: int = Field(default=28_800, ge=60)
    absolute_session_limit_sec: int = Field(default=43_200, ge=60)

    lockout_failures: int = Field(default=5, ge=1)
    lockout_duration_sec: int = Field(default=300, ge=1)
    step_up_window_sec: int = Field(default=300, ge=1)

    high_impact_mission_threshold: int = Field(default=3, ge=1)
    two_person_required: bool = True

    demo_default_operator: str = "demo-commander"

    def validate_for_auth(self) -> None:
        """Fail fast when authentication is enabled with an unsafe secret.

        Demo mode (``auth_enabled=False``) needs no secret at all.
        """
        if not self.auth_enabled:
            return
        secret = self.jwt_secret
        if not secret or secret == DEFAULT_JWT_SECRET or len(secret) < MIN_JWT_SECRET_LENGTH:
            raise SecurityConfigurationError(
                "AUTH_ENABLED=true requires JWT_SECRET from the environment with at least "
                f"{MIN_JWT_SECRET_LENGTH} characters; the built-in demo secret is rejected."
            )


@lru_cache
def get_security_settings() -> SecuritySettings:
    """Return the process-wide cached security settings."""
    return SecuritySettings()
