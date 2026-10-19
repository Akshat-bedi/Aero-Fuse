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
from app.config import Settings
from app.domain import (
    ClockTickPayload,
    OpsEvent,
    OpsEventRequest,
    PositionTickItem,
    WireSnapshot,
    dump_wire,
)
from app.retask.demos import DemoRunner
from app.retask.pipeline import RetaskPipeline
from app.sim.clock import SimClock
from app.sim.engine import SimEngine
from app.state.seed import load_seed
from app.state.store import StateChange, StateStore


class SimRuntime:
    """Owns the live simulation and its outbound streams."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        snapshot = load_seed(settings.seed_path)
        self.store = StateStore(snapshot)
        self.clock = SimClock(
            snapshot.sim.time,
            speed=int(snapshot.sim.speed),
            paused=snapshot.sim.paused,
        )
        self.engine = SimEngine(self.store, self.clock)
        self.ws = ConnectionManager(max_queue=settings.ws_queue_size)
        self.retask = RetaskPipeline(self)
        self.demos = DemoRunner(self)
        self._unsubscribe = self.store.subscribe(self._on_store_change)
        self._tasks: list[asyncio.Task[None]] = []

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
        return self.store.wire_snapshot(self.clock.sim_state())

    def snapshot_frame(self) -> dict[str, Any]:
        return self.frame(
            "SNAPSHOT", dump_wire(self.snapshot(), exclude_none=True), self.store.version
        )

    def broadcast_tick(self) -> None:
        """One sim step + CLOCK_TICK/POSITION_TICK broadcast (never bumps)."""
        result = self.engine.tick()
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

    def control(self, action: str, speed: int | None) -> dict[str, Any]:
        """Apply ``/sim/control``; reset reloads the seed and re-broadcasts it."""
        if action == "pause":
            self.clock.pause()
        elif action == "resume":
            self.clock.resume()
        elif action == "speed" and speed is not None:
            self.clock.set_speed(speed)
        elif action == "reset":
            self.demos.reset()
            self.retask.reset()
            snapshot = load_seed(self.settings.seed_path)
            self.store.reset(snapshot)
            self.clock.reset(snapshot.sim.time)
            self.engine.reset()
        self.broadcast_clock_now()
        return {"simTime": self.clock.now(), "speed": self.clock.speed, "paused": self.clock.paused}

    def broadcast_clock_now(self) -> None:
        """Send the current clock state immediately (control-action feedback)."""
        payload = ClockTickPayload(
            sim_time=self.clock.now(), speed=self.clock.speed, paused=self.clock.paused
        )
        self.ws.broadcast(self.frame("CLOCK_TICK", dump_wire(payload), self.store.version))

    # ---------------------------------------------------------------- events

    def inject_event(self, request: OpsEventRequest) -> OpsEvent:
        """Register an event with a sim-clock timestamp and apply its effect.

        The store notification (raised inside ``apply_event``) broadcasts
        ``EVENT_INJECTED`` followed by ``ENTITY_UPDATE``. Callers schedule the
        retasking pipeline separately via ``schedule_retask`` so the HTTP
        response is not blocked by analysis. Raises ``UnknownEntityError`` for
        unknown referenced ids.
        """
        event = OpsEvent(
            id=self.store.next_event_id(),
            timestamp=self.clock.now(),
            type=request.type,
            payload=request.payload,
            severity=request.severity,
            operator=request.operator,
            description=request.description,
        )
        self.store.apply_event(event)
        return event

    def schedule_retask(self, event: OpsEvent) -> None:
        """Queue the event for impact analysis and recommendation generation."""
        self.retask.schedule(event)

    def _on_store_change(self, change: StateChange) -> None:
        if change.kind == "reset":
            self.ws.broadcast(self.snapshot_frame())
            return
        if change.kind == "event" and change.event is not None:
            self.ws.broadcast(self.frame("EVENT_INJECTED", dump_wire(change.event), change.version))
        if change.changed:
            payload = self.store.entities_wire(change.changed)
            if payload:
                self.ws.broadcast(self.frame("ENTITY_UPDATE", payload, change.version))
