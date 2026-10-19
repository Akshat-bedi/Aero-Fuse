"""Simulation engine: one deterministic stepping entry point for the world.

``tick()`` is synchronous and deterministic (same seed + same sequence of
ticks = same state). The async loop in ``app.runtime`` calls it once per
wall-clock second; tests call it directly to fast-forward without sleeping.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain import ClockTickPayload
from app.sim.clock import SimClock
from app.sim.movement import MovementSim, PositionUpdate
from app.sim.weather import WeatherSim
from app.state.store import StateStore


@dataclass(frozen=True)
class TickResult:
    """Everything a tick produces for broadcast."""

    clock: ClockTickPayload
    position_updates: list[PositionUpdate] = field(default_factory=list)


class SimEngine:
    """Coordinates the clock, movement and weather per tick."""

    def __init__(self, store: StateStore, clock: SimClock) -> None:
        self.store = store
        self.clock = clock
        self.movement = MovementSim(store, clock)
        self.weather = WeatherSim(store, clock)

    def reset(self) -> None:
        self.movement.reset()
        self.weather.reset()

    def tick(self, dt_seconds: float | None = None) -> TickResult:
        """Advance the world by one step (``dt`` defaults to the clock speed)."""
        position_updates: list[PositionUpdate] = []
        if not self.clock.paused:
            dt = self.clock.speed if dt_seconds is None else dt_seconds
            self.clock.advance(dt)
            position_updates = self.movement.step(dt)
            self.weather.step()
        return TickResult(
            clock=ClockTickPayload(
                sim_time=self.clock.now(),
                speed=self.clock.speed,
                paused=self.clock.paused,
            ),
            position_updates=position_updates,
        )
