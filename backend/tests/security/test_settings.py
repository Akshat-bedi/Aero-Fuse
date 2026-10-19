"""Security settings, env-name parity and secret hardening."""

from __future__ import annotations

import pytest
from app.config import Settings
from app.security.deps import build_security_context
from app.security.settings import (
    DEFAULT_JWT_SECRET,
    MIN_JWT_SECRET_LENGTH,
    SecurityConfigurationError,
    SecuritySettings,
)


def test_defaults_match_main_application_settings() -> None:
    assert (
        SecuritySettings.model_fields["auth_enabled"].default
        == Settings.model_fields["auth_enabled"].default
    )
    assert (
        SecuritySettings.model_fields["jwt_secret"].default
        == Settings.model_fields["jwt_secret"].default
    )
    assert SecuritySettings.model_fields["jwt_secret"].default == DEFAULT_JWT_SECRET


def test_both_settings_classes_read_the_same_environment_names(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "env-secret-" + "y" * 40
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.setenv("JWT_SECRET", secret)

    security = SecuritySettings()
    main = Settings()

    assert security.auth_enabled is True
    assert main.auth_enabled is True
    assert security.jwt_secret == secret
    assert main.jwt_secret == secret


@pytest.mark.parametrize(
    "secret",
    ["", DEFAULT_JWT_SECRET, "short", "x" * (MIN_JWT_SECRET_LENGTH - 1)],
)
def test_auth_enabled_rejects_missing_default_or_short_secret(secret: str) -> None:
    settings = SecuritySettings(auth_enabled=True, jwt_secret=secret)
    with pytest.raises(SecurityConfigurationError):
        settings.validate_for_auth()


def test_auth_enabled_accepts_a_long_environment_secret() -> None:
    settings = SecuritySettings(auth_enabled=True, jwt_secret="z" * MIN_JWT_SECRET_LENGTH)
    settings.validate_for_auth()


def test_auth_disabled_does_not_require_a_secret() -> None:
    SecuritySettings(auth_enabled=False, jwt_secret=DEFAULT_JWT_SECRET).validate_for_auth()


def test_build_context_fails_fast_with_an_unsafe_secret() -> None:
    settings = SecuritySettings(auth_enabled=True, jwt_secret=DEFAULT_JWT_SECRET)
    with pytest.raises(SecurityConfigurationError):
        build_security_context(settings)


def test_build_context_works_without_a_secret_in_demo_mode() -> None:
    context = build_security_context(SecuritySettings(auth_enabled=False))
    assert context.auth_enabled is False
    assert context.demo_identity.role.value == "commander"
