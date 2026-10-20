"""Policy table, invariants, event-type grants and generated-matrix drift."""

from __future__ import annotations

import pytest
from app.domain.enums import EventType
from app.security import matrix
from app.security.policy import (
    COMMANDER_ONLY_PERMISSIONS,
    EVENT_TYPE_GRANTS,
    OPERATIONAL_PERMISSIONS,
    ROLE_PERMISSIONS,
    AccessContext,
    Identity,
    Permission,
    Role,
    is_allowed,
    permissions_for,
)
from hypothesis import given
from hypothesis import strategies as st

_READ = {
    Permission.READ_SNAPSHOT,
    Permission.READ_RECOMMENDATIONS,
    Permission.READ_PREDICTIONS,
    Permission.READ_ALERTS,
    Permission.READ_SCENARIOS,
    Permission.READ_ELIGIBLE_RESOURCES,
    Permission.READ_DEMO_SCRIPTS,
}

EXPECTED: dict[Role, frozenset[Permission]] = {
    Role.OBSERVER: frozenset(_READ),
    Role.INTEL_OFFICER: frozenset(_READ | {Permission.INJECT_EVENT}),
    Role.MAINTENANCE_OFFICER: frozenset(_READ | {Permission.INJECT_EVENT}),
    Role.OPS_PLANNER: frozenset(
        _READ
        | {
            Permission.INJECT_EVENT,
            Permission.RUN_SCENARIO,
            Permission.RUN_DEMO_SCRIPT,
            Permission.VALIDATE_MODIFICATION,
            Permission.READ_ELIGIBLE_RESOURCES,
            Permission.SIM_PAUSE,
            Permission.SIM_RESUME,
            Permission.SIM_SPEED,
        }
    ),
    Role.COMMANDER: frozenset(
        _READ
        | {
            Permission.INJECT_EVENT,
            Permission.RUN_SCENARIO,
            Permission.RUN_DEMO_SCRIPT,
            Permission.VALIDATE_MODIFICATION,
            Permission.READ_ELIGIBLE_RESOURCES,
            Permission.SIM_PAUSE,
            Permission.SIM_RESUME,
            Permission.SIM_SPEED,
            Permission.SIM_RESET,
            Permission.DECIDE_APPROVE,
            Permission.DECIDE_REJECT,
            Permission.DECIDE_MODIFY,
        }
    ),
    Role.AUDITOR: frozenset(
        _READ | {Permission.READ_AUDIT, Permission.EXPORT_AUDIT, Permission.VERIFY_AUDIT}
    ),
    Role.SYS_ADMIN: frozenset(_READ | {Permission.MANAGE_USERS}),
}


def _identity(role: Role, **overrides: object) -> Identity:
    values: dict[str, object] = {
        "user_id": f"USR-{role.value}",
        "username": role.value,
        "role": role,
        "display_name": role.value.title(),
    }
    values.update(overrides)
    return Identity(**values)  # type: ignore[arg-type]


def test_table_matches_expected_matrix() -> None:
    assert dict(ROLE_PERMISSIONS) == EXPECTED
    assert permissions_for(Role.OBSERVER) == EXPECTED[Role.OBSERVER]


@pytest.mark.parametrize("role", list(Role))
@pytest.mark.parametrize("permission", list(Permission))
def test_is_allowed_matches_table(role: Role, permission: Permission) -> None:
    expected = permission in EXPECTED[role]
    assert is_allowed(_identity(role), permission) is expected


def test_none_identity_is_denied_everything() -> None:
    for permission in Permission:
        assert is_allowed(None, permission) is False


def test_only_commander_holds_decision_permissions() -> None:
    for role in Role:
        for permission in COMMANDER_ONLY_PERMISSIONS:
            assert (permission in EXPECTED[role]) is (role is Role.COMMANDER)


def test_oversight_roles_have_no_operational_permissions() -> None:
    for role in (Role.AUDITOR, Role.SYS_ADMIN):
        assert EXPECTED[role].isdisjoint(OPERATIONAL_PERMISSIONS)


def test_extra_grant_cannot_make_a_non_commander_a_decider() -> None:
    observer = _identity(Role.OBSERVER, permissions=frozenset({Permission.DECIDE_APPROVE}))
    assert is_allowed(observer, Permission.DECIDE_APPROVE) is False


def test_extra_grant_cannot_make_oversight_operational() -> None:
    sys_admin = _identity(Role.SYS_ADMIN, permissions=frozenset({Permission.RUN_SCENARIO}))
    assert is_allowed(sys_admin, Permission.RUN_SCENARIO) is False


def test_identity_has_uses_the_authorization_rule() -> None:
    observer = _identity(Role.OBSERVER)
    commander = _identity(Role.COMMANDER)
    assert observer.has(Permission.READ_SNAPSHOT) is True
    assert observer.has(Permission.DECIDE_APPROVE) is False
    assert commander.has(Permission.DECIDE_APPROVE) is True


@pytest.mark.parametrize(
    ("role", "event_type", "allowed"),
    [
        (Role.INTEL_OFFICER, EventType.THREAT_DETECTED, True),
        (Role.INTEL_OFFICER, EventType.AIRCRAFT_UNSERVICEABLE, False),
(Role.MAINTENANCE_OFFICER, EventType.AIRCRAFT_UNSERVICEABLE, True),
(Role.MAINTENANCE_OFFICER, EventType.BASE_CLOSED, False),
        (Role.MAINTENANCE_OFFICER, EventType.THREAT_DETECTED, False),
        (Role.OPS_PLANNER, EventType.WEATHER_DEGRADED, True),
        (Role.COMMANDER, EventType.NEW_PRIORITY_MISSION, True),
        (Role.OBSERVER, EventType.THREAT_DETECTED, False),
        (Role.AUDITOR, EventType.THREAT_DETECTED, False),
        (Role.SYS_ADMIN, EventType.THREAT_DETECTED, False),
    ],
)
def test_event_injection_is_restricted_per_type(
    role: Role, event_type: EventType, allowed: bool
) -> None:
    result = is_allowed(
        _identity(role),
        Permission.INJECT_EVENT,
        AccessContext(event_type=event_type),
    )
    assert result is allowed


@given(
    role=st.sampled_from(list(Role)),
    permission=st.sampled_from(list(Permission)),
    event_type=st.sampled_from(list(EventType)),
)
def test_authorization_property(
    role: Role, permission: Permission, event_type: EventType
) -> None:
    expected = permission in EXPECTED[role]
    if permission in COMMANDER_ONLY_PERMISSIONS:
        expected = expected and role is Role.COMMANDER
    if permission in OPERATIONAL_PERMISSIONS and role in {Role.AUDITOR, Role.SYS_ADMIN}:
        expected = False
    if permission is Permission.INJECT_EVENT:
        expected = expected and event_type in EVENT_TYPE_GRANTS.get(role, frozenset())
    actual = is_allowed(_identity(role), permission, AccessContext(event_type=event_type))
    assert actual is expected


def test_generated_matrix_is_current() -> None:
    path = matrix.default_output_path()
    assert path.is_file()
    assert path.read_text(encoding="utf-8") == matrix.render_matrix()
    assert matrix.main(["--check"]) == 0


def test_generated_matrix_lists_every_role_and_permission() -> None:
    rendered = matrix.render_matrix()
    for role in Role:
        assert role.value in rendered
    for permission in Permission:
        assert permission.value in rendered
    for event_type in EventType:
        assert event_type.value in rendered
