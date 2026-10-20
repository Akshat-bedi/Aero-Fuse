"""Password hashing, demo users and lockout behaviour."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.security.policy import Role
from app.security.users import (
    DEMO_CREDENTIALS,
    DEMO_PASSWORD,
    DEMO_STEP_UP_PIN,
    AuthFailure,
    UserRecord,
    UserStore,
    hash_password,
    seed_demo_users,
    verify_password,
    verify_step_up_pin,
)

NOW = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


def _user(
    *,
    user_id: str = "USR-T1",
    username: str = "tester",
    password: str = "correct-horse",
    role: Role = Role.OBSERVER,
    active: bool = True,
) -> UserRecord:
    return UserRecord(
        user_id=user_id,
        username=username,
        display_name="Test User",
        role=role,
        password_hash=hash_password(password),
        pin_hash=hash_password("1234"),
        active=active,
    )


def test_hash_and_verify_round_trip() -> None:
    encoded = hash_password("secret", salt=b"fixed-salt-16byt")
    assert encoded.startswith("scrypt$")
    assert "secret" not in encoded
    assert verify_password("secret", encoded) is True
    assert verify_password("wrong", encoded) is False


def test_hash_salt_changes_the_digest() -> None:
    first = hash_password("secret", salt=b"a" * 16)
    second = hash_password("secret", salt=b"b" * 16)
    assert first != second
    assert verify_password("secret", first)
    assert verify_password("secret", second)


def test_empty_password_is_rejected() -> None:
    with pytest.raises(ValueError):
        hash_password("")


@pytest.mark.parametrize(
    "encoded",
    ["", "not-a-hash", "scrypt$bad", "md5$1$2$3$4$5", "scrypt$0$8$1$YQ==$YQ=="],
)
def test_malformed_hashes_never_verify(encoded: str) -> None:
    assert verify_password("anything", encoded) is False


def test_seed_has_eight_demo_users_and_both_commanders() -> None:
    store = seed_demo_users()
    users = store.list_users()
    assert len(users) == 8
    assert len([user for user in users if user.role is Role.COMMANDER]) == 2
    assert {user.role for user in users} == set(Role)
    assert {user.username for user in users} == set(DEMO_CREDENTIALS)
    for user in users:
        assert DEMO_PASSWORD not in user.password_hash
        assert DEMO_STEP_UP_PIN not in (user.pin_hash or "")


def test_credentials_succeed_and_reset_failures() -> None:
    store = UserStore([_user()])
    first = store.verify_credentials(
        "tester", "wrong", now=NOW, lockout_failures=3, lockout_duration_sec=60
    )
    assert first.failure is AuthFailure.INVALID_PASSWORD
    second = store.verify_credentials(
        "tester", "correct-horse", now=NOW, lockout_failures=3, lockout_duration_sec=60
    )
    assert second.ok is True
    assert second.user is not None
    assert second.user.failed_attempts == 0


def test_unknown_user_is_generic_failure() -> None:
    store = UserStore([_user()])
    attempt = store.verify_credentials(
        "nobody", "whatever", now=NOW, lockout_failures=3, lockout_duration_sec=60
    )
    assert attempt.ok is False
    assert attempt.failure is AuthFailure.UNKNOWN_USER


def test_inactive_user_cannot_log_in() -> None:
    store = UserStore([_user(active=False)])
    attempt = store.verify_credentials(
        "tester", "correct-horse", now=NOW, lockout_failures=3, lockout_duration_sec=60
    )
    assert attempt.failure is AuthFailure.INACTIVE


def test_lockout_after_threshold_and_timed_unlock() -> None:
    store = UserStore([_user()])
    for _ in range(2):
        attempt = store.verify_credentials(
            "tester", "wrong", now=NOW, lockout_failures=3, lockout_duration_sec=60
        )
        assert attempt.failure is AuthFailure.INVALID_PASSWORD

    locked = store.verify_credentials(
        "tester", "wrong", now=NOW, lockout_failures=3, lockout_duration_sec=60
    )
    assert locked.failure is AuthFailure.LOCKED
    assert locked.just_locked is True

    still_locked = store.verify_credentials(
        "tester",
        "correct-horse",
        now=NOW + timedelta(seconds=30),
        lockout_failures=3,
        lockout_duration_sec=60,
    )
    assert still_locked.failure is AuthFailure.LOCKED
    assert still_locked.retry_after_sec == 30

    unlocked = store.verify_credentials(
        "tester",
        "correct-horse",
        now=NOW + timedelta(seconds=61),
        lockout_failures=3,
        lockout_duration_sec=60,
    )
    assert unlocked.ok is True


def test_change_role_bumps_token_version() -> None:
    store = UserStore([_user()])
    before = store.get("USR-T1")
    assert before is not None
    updated = store.change_role("USR-T1", Role.OPS_PLANNER)
    assert updated.role is Role.OPS_PLANNER
    assert updated.token_version == before.token_version + 1


def test_change_role_unknown_user_raises() -> None:
    with pytest.raises(KeyError):
        UserStore().change_role("USR-NOPE", Role.OBSERVER)


def test_duplicate_user_id_and_username_are_rejected() -> None:
    store = UserStore([_user()])
    with pytest.raises(ValueError):
        store.add(_user())
    with pytest.raises(ValueError):
        store.add(_user(user_id="USR-T2", username="TESTER"))


def test_step_up_pin_verification() -> None:
    user = _user()
    assert verify_step_up_pin(user, "1234") is True
    assert verify_step_up_pin(user, "0000") is False
    assert verify_step_up_pin(_user(password="x"), "") is False
