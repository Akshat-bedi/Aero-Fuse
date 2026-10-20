"""Scripted demo runs (Demo 1 / Demo 2) on the sim clock.

``GET /api/demo-scripts`` lists the two scripts the guided-demo UI expects.
``POST /api/demo-scripts/{name}/run`` starts a background task and returns
immediately; steps are spaced by ``demo_step_delay_s`` of *sim* time (scaled by
the clock speed and pausing with the sim) and the retasking pipeline is allowed
to drain between steps so recommendations stay deterministic.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import threading
from typing import TYPE_CHECKING, Any

from app.domain import LatLng, OpsEventRequest, parse_timestamp
from app.retask import geometry_lite

if TYPE_CHECKING:
    from app.runtime import SimRuntime

logger = logging.getLogger("airops.demos")

DEMO_SCRIPTS: tuple[dict[str, str], ...] = (
    {
        "name": "sam-route-b",
        "description": "Demo 1: Surface-to-Air Missile detected along M-04 Route B",
    },
    {
        "name": "runway-closure-aog",
        "description": "Demo 2: BASE-B runway closure + strike aircraft AOG contingency",
    },
)
_SCRIPT_NAMES = {script["name"] for script in DEMO_SCRIPTS}


class DemoBusyError(RuntimeError):
    """A demo script is already running."""


class UnknownDemoError(KeyError):
    """No script with the requested name."""


class DemoRunner:
    """Owns the background demo task and its step definitions."""

    def __init__(self, runtime: SimRuntime) -> None:
        self.runtime = runtime
        self._loop: asyncio.AbstractEventLoop | None = None
        self._task: asyncio.Task[None] | None = None
        self._running = False
        self._name: str | None = None
        self._lock = threading.Lock()
        self._idle = threading.Event()
        self._idle.set()

    # ------------------------------------------------------------- lifecycle

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def stop(self) -> None:
        task = self._take_task()
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        self._idle.set()

    def reset(self) -> None:
        """Cancel a running demo (used by ``/sim/control reset``)."""
        task = self._take_task()
        if task is not None and self._loop is not None and self._loop.is_running():
            self._loop.call_soon_threadsafe(task.cancel)
        self._idle.set()

    @property
    def running(self) -> bool:
        with self._lock:
            return self._running

    def wait_idle(self, timeout: float = 10.0) -> bool:
        return self._idle.wait(timeout)

    # ------------------------------------------------------------------- run

    def start(self, name: str, *, operator: str | None = None) -> dict[str, Any]:
        if name not in _SCRIPT_NAMES:
            raise UnknownDemoError(name)
        with self._lock:
            if self._running:
                raise DemoBusyError(self._name or name)
            loop = self._loop
            if loop is None or not loop.is_running():
                raise DemoBusyError("simulation loop is not running")
            steps = self._steps(name, operator=operator)
            self._running = True
            self._name = name
            self._idle.clear()
            self._task = loop.create_task(self._run(name, steps))
        return {"status": "started", "eventCount": len(steps)}

    async def _run(self, name: str, steps: list[OpsEventRequest]) -> None:
        current = asyncio.current_task()
        try:
            for index, request in enumerate(steps):
                if index and not await self._wait_step():
                    return
                await self.runtime.retask.wait_idle_async()
                event = self.runtime.inject_event(request)
                self.runtime.schedule_retask(event)
            await self.runtime.retask.wait_idle_async()
            logger.info("demo script %s completed (%d events)", name, len(steps))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("demo script %s failed", name)
        finally:
            with self._lock:
                if self._task is current:
                    self._running = False
                    self._name = None
                    self._task = None
                    self._idle.set()

    async def _wait_step(self) -> bool:
        """Wait one inter-step gap in sim seconds (pauses with the clock)."""
        remaining = float(self.runtime.settings.demo_step_delay_s)
        if remaining <= 0:
            return True
        last = parse_timestamp(self.runtime.clock.now())
        while remaining > 0:
            await asyncio.sleep(0.05)
            if self.runtime.clock.paused:
                last = parse_timestamp(self.runtime.clock.now())
                continue
            now = parse_timestamp(self.runtime.clock.now())
            remaining -= max(0.0, (now - last).total_seconds())
            last = now
        return True

    def _take_task(self) -> asyncio.Task[None] | None:
        with self._lock:
            task = self._task
            self._task = None
            self._running = False
            self._name = None
        return task

    # --------------------------------------------------------------- scripts

    def _steps(self, name: str, *, operator: str | None = None) -> list[OpsEventRequest]:
        if name == "sam-route-b":
            return [self._sam_step(operator=operator)]
        if name == "runway-closure-aog":
            return [
                OpsEventRequest(
                    type="BASE_CLOSED",
                    payload={
                        "baseId": "BASE-B",
                        "runwayStatus": "closed",
                        "durationHours": 6,
                    },
                    description="Runway closed at BASE-B due to emergency cratering",
                    operator=operator or "demo-commander",
                ),
                OpsEventRequest(
                    type="AIRCRAFT_UNSERVICEABLE",
                    payload={
                        "aircraftId": "AC-07",
                        "reason": "Hydraulic failure on emergency diversion approach (AOG)",
                    },
                    description="Strike airframe AC-07 declared AOG at Sector Alpha",
                    operator=operator or "demo-commander",
                ),
            ]
        raise UnknownDemoError(name)

    def _sam_step(self, *, operator: str | None = None) -> OpsEventRequest:
        position = self._route_b_interior_waypoint()
        return OpsEventRequest(
            type="THREAT_DETECTED",
            payload={
                "threatType": "SAM",
                "position": {"lat": position.lat, "lng": position.lng},
                "rangeKm": 85,
                "confidence": 0.9,
            },
            description="SAM site detected on Route B near Contested Hub Oscar",
            operator=operator or "demo-commander",
        )

    def _route_b_interior_waypoint(self) -> LatLng:
        state = self.runtime.store
        mission = state.missions.get("M-04")
        fallback = LatLng(lat=4.8, lng=7.4)
        if mission is None:
            return fallback
        option = geometry_lite.route_option_for(mission, "Route B")
        points = list(option.waypoints) if option is not None else list(mission.route)
        base = state.bases.get(mission.launch_base_id)
        interior = geometry_lite.strip_base_endpoints(
            points, base.location if base is not None else None
        )
        if not interior:
            return fallback
        return interior[0]
