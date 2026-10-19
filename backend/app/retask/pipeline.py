"""Async retasking pipeline: impact -> progress -> recommendation broadcast.

Runs off the request path so ``POST /api/events`` returns its 201 immediately.
One FIFO worker serialises events; a generation counter invalidated by
``/sim/control reset`` discards stale work so a reset never gets overwritten by
an in-flight plan.

Wire sequence for each event (version stays at the store's current version; the
recommendation is not applied until a commander decision in B8a):

``IMPACT_ANALYSIS`` -> ``ALERT`` -> ``RETASK_PROGRESS`` (fusing, constraints,
optimising, ranking) -> ``RETASK_PROGRESS`` (ready) -> ``RECOMMENDATION_READY``.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
import time
from typing import TYPE_CHECKING, Any

from app.domain import (
    AircraftUnserviceablePayload,
    AlertSeverity,
    AlertType,
    BaseClosedPayload,
    CrewUnavailablePayload,
    ImpactAnalysis,
    NewPriorityMissionPayload,
    OperationalAlert,
    OpsEvent,
    RetaskProgress,
    RetaskStage,
    ThreatDetectedPayload,
    WeatherDegradedPayload,
    dump_wire,
)
from app.retask.engine import RetaskEngine, RetaskProposal, RuleBasedEngine

if TYPE_CHECKING:
    from app.runtime import SimRuntime

logger = logging.getLogger("airops.retask")

STAGES: tuple[tuple[RetaskStage, str], ...] = (
    (RetaskStage.FUSING, "Fusing telemetry & threat coordinates..."),
    (
        RetaskStage.CONSTRAINTS,
        "Validating range, fuel, crew duty & weapon load...",
    ),
    (
        RetaskStage.OPTIMISING,
        "Evaluating route doglegs and alternate airframes...",
    ),
    (RetaskStage.RANKING, "Ranking Pareto trade-offs & confidence scores..."),
)
READY_MESSAGE = "Retasking plan formulated. Pending commander authorization."


class RetaskPipeline:
    """Single-worker retasking pipeline bound to a runtime."""

    def __init__(self, runtime: SimRuntime, engine: RetaskEngine | None = None) -> None:
        self.runtime = runtime
        self.engine: RetaskEngine = engine or RuleBasedEngine()
        self._queue: asyncio.Queue[tuple[int, OpsEvent]] = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[None] | None = None
        self._generation = 0
        self._pending = 0
        self._lock = threading.Lock()
        self._idle = threading.Event()
        self._idle.set()

    # ------------------------------------------------------------- lifecycle

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._task is not None:
            return
        self._loop = loop
        self._task = loop.create_task(self._worker())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None
        self._drain_nowait()

    def reset(self) -> None:
        """Invalidate queued/in-flight analyses (called on ``control reset``)."""
        with self._lock:
            self._generation += 1
            self._pending = 0
            self._idle.set()
        if self._loop is not None and self._loop.is_running():
            self._loop.call_soon_threadsafe(self._drain_nowait)

    # -------------------------------------------------------------- schedule

    def schedule(self, event: OpsEvent) -> None:
        """Queue an event for retasking (thread-safe, returns immediately)."""
        with self._lock:
            self._pending += 1
            generation = self._generation
            self._idle.clear()
        loop = self._loop
        if loop is None or not loop.is_running():
            self._process_sync(generation, event)
            return
        loop.call_soon_threadsafe(self._queue.put_nowait, (generation, event))

    def wait_idle(self, timeout: float = 5.0) -> bool:
        """Block until the pipeline has processed all scheduled events."""
        return self._idle.wait(timeout)

    async def wait_idle_async(self, timeout: float = 5.0) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self._idle.is_set():
                return True
            await asyncio.sleep(0.01)
        return self._idle.is_set()

    # ---------------------------------------------------------------- worker

    async def _worker(self) -> None:
        while True:
            generation, event = await self._queue.get()
            try:
                if generation == self._generation:
                    await self._process(generation, event)
            except Exception:  # keep the pipeline alive for later events
                logger.exception("retask pipeline failed for %s", event.id)
            finally:
                self._queue.task_done()
                self._finish(generation)

    def _process_sync(self, generation: int, event: OpsEvent) -> None:
        """Synchronous fallback used by tests that never bind an event loop."""
        if generation == self._generation:
            try:
                self._process_now(event)
            except Exception:
                logger.exception("retask pipeline failed for %s", event.id)
        self._finish(generation)

    async def _process(self, generation: int, event: OpsEvent) -> None:
        started = time.perf_counter()
        state = self.runtime.store
        impact = self.engine.analyse_impact(event, state)
        self._broadcast("IMPACT_ANALYSIS", dump_wire(impact, exclude_none=True), event)
        proposal = self.engine.propose(event, state, impact)
        alert = _alert(event, impact, proposal)
        self._broadcast("ALERT", dump_wire(alert, exclude_none=True), event)

        for stage, message in STAGES:
            if generation != self._generation:
                return
            elapsed = (time.perf_counter() - started) * 1000.0
            progress = RetaskProgress(
                is_replan_active=True,
                stage=stage,
                elapsed_ms=round(elapsed, 1),
                message=message,
            )
            self._broadcast(
                "RETASK_PROGRESS", dump_wire(progress, exclude_none=True), event
            )
            await asyncio.sleep(self.runtime.settings.retask_min_stage_ms / 1000.0)

        if generation != self._generation:
            return

        recommendation = proposal.primary
        state.recommendations[recommendation.id] = recommendation
        elapsed = (time.perf_counter() - started) * 1000.0
        ready = RetaskProgress(
            is_replan_active=False,
            stage=RetaskStage.READY,
            elapsed_ms=round(elapsed, 1),
            message=READY_MESSAGE,
        )
        self._broadcast("RETASK_PROGRESS", dump_wire(ready, exclude_none=True), event)
        self._broadcast(
            "RECOMMENDATION_READY",
            dump_wire(recommendation, exclude_none=True),
            event,
        )
        logger.info(
            "retasking %s -> %s (score %.1f, no_feasible=%s)",
            event.id,
            recommendation.id,
            recommendation.score,
            proposal.no_feasible_plan,
        )

    def _process_now(self, event: OpsEvent) -> RetaskProposal:
        state = self.runtime.store
        impact = self.engine.analyse_impact(event, state)
        self._broadcast("IMPACT_ANALYSIS", dump_wire(impact, exclude_none=True), event)
        proposal = self.engine.propose(event, state, impact)
        alert = _alert(event, impact, proposal)
        self._broadcast("ALERT", dump_wire(alert, exclude_none=True), event)
        for stage, message in STAGES:
            progress = RetaskProgress(
                is_replan_active=True,
                stage=stage,
                elapsed_ms=0.0,
                message=message,
            )
            self._broadcast(
                "RETASK_PROGRESS", dump_wire(progress, exclude_none=True), event
            )
        recommendation = proposal.primary
        state.recommendations[recommendation.id] = recommendation
        ready = RetaskProgress(
            is_replan_active=False,
            stage=RetaskStage.READY,
            elapsed_ms=0.0,
            message=READY_MESSAGE,
        )
        self._broadcast("RETASK_PROGRESS", dump_wire(ready, exclude_none=True), event)
        self._broadcast(
            "RECOMMENDATION_READY",
            dump_wire(recommendation, exclude_none=True),
            event,
        )
        return proposal

    # ------------------------------------------------------------- internals

    def _finish(self, generation: int) -> None:
        with self._lock:
            if generation == self._generation:
                self._pending = max(0, self._pending - 1)
                if self._pending == 0:
                    self._idle.set()

    def _drain_nowait(self) -> None:
        while True:
            try:
                _generation, _event = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            self._queue.task_done()

    def _broadcast(self, message_type: str, payload: Any, event: OpsEvent) -> None:
        frame = self.runtime.frame(message_type, payload, self.runtime.store.version)
        self.runtime.ws.broadcast(frame)


def _alert(
    event: OpsEvent, impact: ImpactAnalysis, proposal: RetaskProposal
) -> OperationalAlert:
    payload = event.payload
    severity = AlertSeverity.WARNING
    alert_type = AlertType.READINESS
    title = f"Operational event {event.id}"
    details = "; ".join(impact.reasons)

    if proposal.no_feasible_plan:
        severity = AlertSeverity.CRITICAL
        alert_type = AlertType.CONFLICT
        title = "No feasible retasking plan"
    elif isinstance(payload, ThreatDetectedPayload):
        severity = AlertSeverity.CRITICAL
        alert_type = AlertType.THREAT
        title = f"New {payload.threat_type.value} threat detected"
    elif isinstance(payload, AircraftUnserviceablePayload):
        severity = AlertSeverity.CRITICAL
        alert_type = AlertType.READINESS
        title = f"Aircraft {payload.aircraft_id} unserviceable"
    elif isinstance(payload, BaseClosedPayload):
        severity = AlertSeverity.CRITICAL
        alert_type = AlertType.READINESS
        title = f"{payload.base_id} runway {payload.runway_status.value}"
    elif isinstance(payload, WeatherDegradedPayload):
        where = payload.base_id or payload.region or "area"
        alert_type = AlertType.WEATHER
        title = f"Weather {payload.severity.value} at {where}"
    elif isinstance(payload, CrewUnavailablePayload):
        alert_type = AlertType.CREW
        title = f"Crew {payload.crew_id} unavailable"
    elif isinstance(payload, NewPriorityMissionPayload):
        severity = AlertSeverity.INFO
        title = f"New P{int(payload.priority)} tasking: {payload.name}"

    return OperationalAlert(
        id=f"{event.id}-AL",
        title=title,
        message=(
            f"{details} Proposed {proposal.primary.id} "
            f"(score {proposal.primary.score:.0f}); awaiting commander decision."
        ),
        severity=severity,
        type=alert_type,
        timestamp=event.timestamp,
        acknowledged=False,
        entity_id=impact.most_urgent,
        details=details,
    )
