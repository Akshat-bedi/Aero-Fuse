"""Adapter from the security package's ``AuditSink`` to the hash chain."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.security.audit_events import SecurityAuditEvent

if TYPE_CHECKING:
    from app.runtime import SimRuntime

logger = logging.getLogger("airops.audit")


class RuntimeAuditSink:
    """Append security events to the runtime's tamper-evident audit chain.

    The sink is bound during the application lifespan because the hash-chained
    store is owned by ``SimRuntime``. Security events can only be emitted from
    request/WebSocket handlers, which run after startup, so an unbound sink is
    an internal error rather than a user-facing condition.
    """

    def __init__(self) -> None:
        self._runtime: SimRuntime | None = None

    def bind(self, runtime: SimRuntime) -> None:
        self._runtime = runtime

    def record(self, event: SecurityAuditEvent) -> None:
        runtime = self._runtime
        if runtime is None:
            logger.error("security audit event dropped before runtime binding")
            return
        runtime.append_audit_sync(
            operator=event.operator,
            action=event.action.value,
            target_id=event.target_id,
            details=event.details,
            state_version=runtime.store.version,
        )
