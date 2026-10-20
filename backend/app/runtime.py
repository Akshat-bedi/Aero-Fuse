"""Runtime composition: seed → store → clock → engine → broadcasts.

One ``SimRuntime`` is built per application lifespan. It owns the store, the
sim clock, the deterministic engine and the WebSocket manager, and translates
store changes and clock ticks into the wire frames the frontend expects
(see ``frontend/src/services/liveDataService.ts``):

- ``SNAPSHOT`` on connect and after reset (full replace, new ``stateVersion``);
- ``POSITION_TICK``/``CLOCK_TICK`` every wall second (current version, no bump);
- ``EVENT_INJECTED`` then ``ENTITY_UPDATE`` for injected events;
- ``ENTITY_UPDATE`` for status transitions produced by the sim itself;
- ``HEARTBEAT`` every 5 wall seconds.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from app.api.ws import ConnectionManager
from app.audit import AuditLog
from app.config import Settings
from app.domain import (
    ApprovalRecord,
    AuditEntry,
    ClockTickPayload,
    ModificationsRequest,
    OpsEvent,
    OpsEventRequest,
    PositionTickItem,
    Recommendation,
    WireSnapshot,
    dump_wire,
)
from app.retask.decisions import DecisionService
from app.retask.demos import DemoRunner
from app.retask.pipeline import RetaskPipeline
from app.retask.staleness import StalenessTracker
from app.security.approvals import (
    ApprovalState,
    approval_fields,
    classify_high_impact,
    initial_state,
    required_approvals,
)
from app.security.deps import SecurityContext
from app.sim.clock import SimClock
from app.sim.engine import SimEngine
from app.state.seed import load_seed
from app.state.store import StateChange, StateStore


class SimRuntime:
    """Owns the live simulation and its outbound streams."""

    def __init__(
        self,
        settings: Settings,
        *,
        security: SecurityContext | None = None,
    ) -> None:
        self.settings = settings
        self.security = security
        snapshot = load_seed(settings.seed_path)
        self.store = StateStore(snapshot)
        self.clock = SimClock(
            snapshot.sim.time,
            speed=int(snapshot.sim.speed),
            paused=snapshot.sim.paused,
        )
        self.engine = SimEngine(self.store, self.clock)
        self.ws = ConnectionManager(max_queue=settings.ws_queue_size)
        self.audit = AuditLog(settings.db_url)
        self.staleness = StalenessTracker(self, settings.reco_ttl_min)
        self.retask = RetaskPipeline(self)
        self.demos = DemoRunner(self)
        self.decisions = DecisionService(self)
        self.approval_states: dict[str, ApprovalState] = {}
        self.approval_high_impact: dict[str, bool] = {}
        self.approval_modifiers: dict[str, str] = {}
        self.staged_modifications: dict[str, ModificationsRequest] = {}
        self.decision_epoch = 0
        self._unsubscribe = self.store.subscribe(self._on_store_change)
        self._tasks: list[asyncio.Task[None]] = []

    # ------------------------------------------------------------- approvals

    @property
    def approval_flow_enabled(self) -> bool:
        """True when the two-person/step-up approval flow is active."""
        return self.security is not None and self.security.auth_enabled

    def register_recommendation(
        self, recommendation: Recommendation, *, no_feasible_plan: bool = False
    ) -> None:
        """Attach the B8b approval state when authentication is enabled."""
        if not self.approval_flow_enabled or self.security is None:
            return
        priorities = {mission.id: int(mission.priority) for mission in self.store.missions.values()}
        assessment = classify_high_impact(
            recommendation,
            priorities,
            settings=self.security.settings,
            no_feasible_plan=no_feasible_plan,
        )
        required = required_approvals(
            high_impact=assessment.high_impact,
            approver_is_modifier=False,
            settings=self.security.settings,
        )
        state = initial_state(required)
        self.approval_states[recommendation.id] = state
        self.approval_high_impact[recommendation.id] = assessment.high_impact
        self.sync_approval_fields(recommendation, state)

    def sync_approval_fields(self, recommendation: Recommendation, state: ApprovalState) -> None:
        fields = approval_fields(state)
        recommendation.approvals_required = fields.approvals_required
        recommendation.approvals = [
            ApprovalRecord(
                operator=item.operator,
                role=item.role.value,
                timestamp=item.timestamp,
            )
            for item in fields.approvals or []
        ]

    def forget_approval(self, recommendation: Recommendation, *, clear_fields: bool = True) -> None:
        """Drop internal approval state (stale, expired or decided).

        ``clear_fields`` also removes the optional wire fields; decided
        recommendations keep them so the approval record remains visible.
        """
        self.approval_states.pop(recommendation.id, None)
        self.approval_high_impact.pop(recommendation.id, None)
        self.approval_modifiers.pop(recommendation.id, None)
        self.staged_modifications.pop(recommendation.id, None)
        if clear_fields:
            recommendation.approvals_required = None
            recommendation.approvals = None

    # ------------------------------------------------------------- lifecycle

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind the serving loop for thread-safe broadcasts (no wall-clock loops).

        Used by tests with ``autostart_sim=False`` so ``broadcast_tick()`` and
        event notifications can be driven from another thread deterministically.
        """
        self.ws.bind_loop(loop)
        self.retask.start(loop)
        self.demos.bind(loop)

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        """Start the async tick and heartbeat loops (called from lifespan)."""
        self.bind(loop)
        self._tasks = [
            loop.create_task(self._tick_loop()),
            loop.create_task(self._heartbeat_loop()),
        ]

    async def stop(self) -> None:
        await self.demos.stop()
        await self.retask.stop()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        self._tasks.clear()
        self._unsubscribe()
        self.audit.close()

    async def _tick_loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.sim_tick_interval_s)
            self.broadcast_tick()

    async def _heartbeat_loop(self) -> None:
        while True:
            await asyncio.sleep(self.settings.ws_heartbeat_sec)
            self.broadcast_heartbeat()

    # ---------------------------------------------------------------- frames

    def frame(self, message_type: str, payload: Any, version: int) -> dict[str, Any]:
        """Envelope with a sim-clock timestamp and the given state version."""
        return {
            "type": message_type,
            "payload": payload,
            "ts": self.clock.now(),
            "stateVersion": version,
        }

    def snapshot(self) -> WireSnapshot:
        snapshot = self.store.wire_snapshot(self.clock.sim_state())
        snapshot.audit_log = self.audit.entries()
        return snapshot

    def snapshot_frame(self) -> dict[str, Any]:
        return self.frame(
            "SNAPSHOT", dump_wire(self.snapshot(), exclude_none=True), self.store.version
        )

    def broadcast_tick(self) -> None:
        """One sim step + CLOCK_TICK/POSITION_TICK broadcast (never bumps)."""
        result = self.engine.tick()
        self.staleness.expire_due(self.clock.now())
        version = self.store.version
        self.ws.broadcast(self.frame("CLOCK_TICK", dump_wire(result.clock), version))
        if result.position_updates:
            payload = [
                dump_wire(
                    PositionTickItem(
                        id=update.aircraft_id,
                        position=update.position,
                        heading=update.heading,
                        speed=update.speed,
                        fuel_pct=update.fuel_pct,
                    ),
                    exclude_none=True,
                )
                for update in result.position_updates
            ]
            self.ws.broadcast(self.frame("POSITION_TICK", payload, version))

    def broadcast_heartbeat(self) -> None:
        self.ws.broadcast(self.frame("HEARTBEAT", {}, self.store.version))

    def control(
        self, action: str, speed: int | None, *, operator: str | None = None
    ) -> dict[str, Any]:
        """Apply ``/sim/control``; reset reloads the seed and re-broadcasts it."""
        actor = operator or "demo-commander"
        if action == "pause":
            self.clock.pause()
        elif action == "resume":
            self.clock.resume()
        elif action == "speed" and speed is not None:
            self.clock.set_speed(speed)
        elif action == "reset":
            self.decision_epoch += 1
            self.demos.reset()
            self.retask.reset()
            self.staleness.reset()
            snapshot = load_seed(self.settings.seed_path)
            self.store.reset(snapshot)
            self.clock.reset(snapshot.sim.time)
            self.engine.reset()
            self.approval_states.clear()
            self.approval_high_impact.clear()
            self.approval_modifiers.clear()
            self.staged_modifications.clear()
        self.append_audit_sync(
            operator=actor,
            action="SIM_CONTROL",
            target_id="SIM",
            details=(
                f"Simulation control action '{action}'"
                + (f" speed={speed}" if speed is not None else "")
                + f" applied at {self.clock.now()}."
            ),
            state_version=self.store.version,
        )
        self.broadcast_clock_now()
        return {"simTime": self.clock.now(), "speed": self.clock.speed, "paused": self.clock.paused}

    def broadcast_clock_now(self) -> None:
        """Send the current clock state immediately (control-action feedback)."""
        payload = ClockTickPayload(
            sim_time=self.clock.now(), speed=self.clock.speed, paused=self.clock.paused
        )
        self.ws.broadcast(self.frame("CLOCK_TICK", dump_wire(payload), self.store.version))

    # ---------------------------------------------------------------- events

    def inject_event(self, request: OpsEventRequest, *, operator: str | None = None) -> OpsEvent:
        """Register an event with a sim-clock timestamp and apply its effect.

        The store notification (raised inside ``apply_event``) broadcasts
        ``EVENT_INJECTED`` followed by ``ENTITY_UPDATE``. Callers schedule the
        retasking pipeline separately via ``schedule_retask`` so the HTTP
        response is not blocked by analysis. Raises ``UnknownEntityError`` for
        unknown referenced ids.
        """
        actor = operator if operator is not None else request.operator
        event = OpsEvent(
            id=self.store.next_event_id(),
            timestamp=self.clock.now(),
            type=request.type,
            payload=request.payload,
            severity=request.severity,
            operator=actor,
            description=request.description,
        )
        self.store.apply_event(event)
        self.append_audit_sync(
            operator=actor or "demo-operator",
            action="INJECT_EVENT",
            target_id=event.id,
            details=(
                f"Injected {event.type.value} event {event.id}"
                + (f": {event.description}" if event.description else ".")
            ),
            state_version=self.store.version,
        )
        return event

    def schedule_retask(self, event: OpsEvent) -> None:
        """Queue the event for impact analysis and recommendation generation."""
        self.retask.schedule(event)

    def event_by_id(self, event_id: str) -> OpsEvent | None:
        for event in self.store.active_events:
            if event.id == event_id:
                return event
        return None

    async def append_audit(
        self,
        *,
        operator: str,
        action: str,
        target_id: str,
        details: str | dict[str, Any],
        state_version: int | None = None,
    ) -> AuditEntry:
        entry = await self.audit.append(
            timestamp=self.clock.now(),
            operator=operator,
            action=action,
            target_id=target_id,
            details=details,
            state_version=state_version,
        )
        self._broadcast_audit(entry)
        return entry

    def append_audit_sync(
        self,
        *,
        operator: str,
        action: str,
        target_id: str,
        details: str | dict[str, Any],
        state_version: int | None = None,
    ) -> AuditEntry:
        entry = self.audit.append_sync(
            timestamp=self.clock.now(),
            operator=operator,
            action=action,
            target_id=target_id,
            details=details,
            state_version=state_version,
        )
        self._broadcast_audit(entry)
        return entry

    def _broadcast_audit(self, entry: AuditEntry) -> None:
        self.ws.broadcast(
            self.frame(
                "AUDIT_APPENDED",
                dump_wire(entry, exclude_none=True),
                self.store.version,
            )
        )

    def broadcast_recommendation(self, recommendation: Recommendation, version: int) -> None:
        """Emit RECOMMENDATION_UPDATED after a decision/stale/expiry transition."""
        self.ws.broadcast(
            self.frame(
                "RECOMMENDATION_UPDATED",
                dump_wire(recommendation, exclude_none=True),
                version,
            )
        )

    def _on_store_change(self, change: StateChange) -> None:
        if change.kind == "reset":
            self.staleness.reset()
            self.ws.broadcast(self.snapshot_frame())
            return
        if change.kind == "event" and change.event is not None:
            self.ws.broadcast(self.frame("EVENT_INJECTED", dump_wire(change.event), change.version))
        if change.changed:
            payload = self.store.entities_wire(change.changed)
            if payload:
                self.ws.broadcast(self.frame("ENTITY_UPDATE", payload, change.version))
        self.staleness.on_state_change(change)
