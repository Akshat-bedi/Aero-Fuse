"""Roles, permissions and the single declarative access-control table.

This module is pure: no I/O, no clock, no framework imports. Every decision the
API makes about "may this identity do this?" goes through :func:`is_allowed`.

The role -> permission table is the single source of truth. The generated
document ``backend/docs/ACCESS_MATRIX.md`` is produced from it by
``python -m app.security.matrix`` so the documentation cannot drift.

Fictional simulation only: roles model an access-control design, not a real
military authorisation system.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from types import MappingProxyType

from app.domain.enums import EventType


class Role(StrEnum):
    """Fictional operator roles in the simulated operations centre."""

    OBSERVER = "observer"
    INTEL_OFFICER = "intel_officer"
    MAINTENANCE_OFFICER = "maintenance_officer"
    OPS_PLANNER = "ops_planner"
    COMMANDER = "commander"
    AUDITOR = "auditor"
    SYS_ADMIN = "sys_admin"


class Permission(StrEnum):
    """Every endpoint or action the security layer protects."""

    READ_SNAPSHOT = "read_snapshot"
    READ_RECOMMENDATIONS = "read_recommendations"
    READ_PREDICTIONS = "read_predictions"
    READ_ALERTS = "read_alerts"
    READ_SCENARIOS = "read_scenarios"
    READ_ELIGIBLE_RESOURCES = "read_eligible_resources"
    READ_DEMO_SCRIPTS = "read_demo_scripts"

    INJECT_EVENT = "inject_event"
    RUN_SCENARIO = "run_scenario"

    VALIDATE_MODIFICATION = "validate_modification"

    DECIDE_APPROVE = "decide_approve"
    DECIDE_REJECT = "decide_reject"
    DECIDE_MODIFY = "decide_modify"

    SIM_PAUSE = "sim_pause"
    SIM_RESUME = "sim_resume"
    SIM_SPEED = "sim_speed"
    SIM_RESET = "sim_reset"

    READ_AUDIT = "read_audit"
    EXPORT_AUDIT = "export_audit"
    VERIFY_AUDIT = "verify_audit"

    MANAGE_USERS = "manage_users"
    RUN_DEMO_SCRIPT = "run_demo_script"


#: Permissions that can alter the live plan or the simulated world.
OPERATIONAL_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.INJECT_EVENT,
        Permission.RUN_SCENARIO,
        Permission.DECIDE_APPROVE,
        Permission.DECIDE_REJECT,
        Permission.DECIDE_MODIFY,
        Permission.SIM_PAUSE,
        Permission.SIM_RESUME,
        Permission.SIM_SPEED,
        Permission.SIM_RESET,
        Permission.RUN_DEMO_SCRIPT,
    }
)

#: Permissions reserved to a commander. No other role may ever hold these.
COMMANDER_ONLY_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.DECIDE_APPROVE,
        Permission.DECIDE_REJECT,
        Permission.DECIDE_MODIFY,
    }
)

#: The only permissions the two non-operational oversight roles may hold.
_OVERSIGHT_READ_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.READ_SNAPSHOT,
        Permission.READ_RECOMMENDATIONS,
        Permission.READ_PREDICTIONS,
        Permission.READ_ALERTS,
        Permission.READ_SCENARIOS,
        Permission.READ_ELIGIBLE_RESOURCES,
        Permission.READ_DEMO_SCRIPTS,
    }
)

#: Event types each injecting role may raise. The key is the role; a missing
#: role means the role cannot inject any event at all.
EVENT_TYPE_GRANTS: Mapping[Role, frozenset[EventType]] = MappingProxyType(
    {
        Role.INTEL_OFFICER: frozenset({EventType.THREAT_DETECTED}),
        Role.MAINTENANCE_OFFICER: frozenset(
            {EventType.AIRCRAFT_UNSERVICEABLE, EventType.BASE_CLOSED}
        ),
        Role.OPS_PLANNER: frozenset(EventType),
        Role.COMMANDER: frozenset(EventType),
    }
)

_DECISION_PERMISSIONS = frozenset(
    {
        Permission.DECIDE_APPROVE,
        Permission.DECIDE_REJECT,
        Permission.DECIDE_MODIFY,
    }
)

_READ_ONLY = _OVERSIGHT_READ_PERMISSIONS

ROLE_PERMISSIONS: Mapping[Role, frozenset[Permission]] = MappingProxyType(
    {
        Role.OBSERVER: _READ_ONLY,
        Role.INTEL_OFFICER: _READ_ONLY | {Permission.INJECT_EVENT},
        Role.MAINTENANCE_OFFICER: _READ_ONLY | {Permission.INJECT_EVENT},
        Role.OPS_PLANNER: _READ_ONLY
        | {
            Permission.INJECT_EVENT,
            Permission.RUN_SCENARIO,
            Permission.RUN_DEMO_SCRIPT,
            Permission.VALIDATE_MODIFICATION,
            Permission.SIM_PAUSE,
            Permission.SIM_RESUME,
            Permission.SIM_SPEED,
        },
        Role.COMMANDER: _READ_ONLY
        | {
            Permission.INJECT_EVENT,
            Permission.RUN_SCENARIO,
            Permission.RUN_DEMO_SCRIPT,
            Permission.VALIDATE_MODIFICATION,
            Permission.SIM_PAUSE,
            Permission.SIM_RESUME,
            Permission.SIM_SPEED,
            Permission.SIM_RESET,
        }
        | _DECISION_PERMISSIONS,
        Role.AUDITOR: _READ_ONLY
        | {
            Permission.READ_AUDIT,
            Permission.EXPORT_AUDIT,
            Permission.VERIFY_AUDIT,
        },
        Role.SYS_ADMIN: _READ_ONLY | {Permission.MANAGE_USERS},
    }
)


@dataclass(frozen=True)
class Identity:
    """An authenticated (or demo-default) operator.

    ``user_id`` is stable and is what the two-person rule and audit log key on.
    ``username`` is the human-facing login name; ``display_name`` is for the UI.
    """

    user_id: str
    username: str
    role: Role
    display_name: str = ""
    permissions: frozenset[Permission] = field(default_factory=frozenset)
    step_up_at: datetime | None = None

    def has(self, permission: Permission) -> bool:
        """Return whether this identity is authorised for ``permission``."""
        return is_allowed(self, permission)


@dataclass(frozen=True)
class AccessContext:
    """Extra facts an authorisation decision may depend on.

    Only ``event_type`` is currently consulted: injection is granted per event
    type. The context is an object (not kwargs) so future rules can be added
    without changing the :func:`is_allowed` signature.
    """

    event_type: EventType | None = None


def is_allowed(
    identity: Identity | None,
    permission: Permission,
    context: AccessContext | None = None,
) -> bool:
    """Pure authorisation decision.

    - ``None`` identity is denied everything.
    - Commander-only decision permissions are granted to no other role.
    - ``INJECT_EVENT`` additionally requires the identity's role to be
      permitted to raise ``context.event_type`` (when one is supplied).
    - Sys-admin and auditor never hold an operational permission.
    """
    if identity is None:
        return False

    role_permissions = ROLE_PERMISSIONS.get(identity.role, frozenset())
    if permission not in role_permissions and permission not in identity.permissions:
        return False

    if permission in COMMANDER_ONLY_PERMISSIONS and identity.role is not Role.COMMANDER:
        return False

    if permission in OPERATIONAL_PERMISSIONS and identity.role in {Role.SYS_ADMIN, Role.AUDITOR}:
        return False

    if permission is Permission.INJECT_EVENT:
        if context is None or context.event_type is None:
            return True
        granted = EVENT_TYPE_GRANTS.get(identity.role, frozenset())
        return context.event_type in granted

    return True


def permissions_for(role: Role) -> frozenset[Permission]:
    """Return the permission set for ``role`` (never ``None``)."""
    return ROLE_PERMISSIONS.get(role, frozenset())


def roles() -> tuple[Role, ...]:
    """Return roles in declaration order (used by the matrix generator)."""
    return tuple(Role)


def permissions() -> tuple[Permission, ...]:
    """Return permissions in declaration order (used by the matrix generator)."""
    return tuple(Permission)
