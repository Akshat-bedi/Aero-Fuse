"""Simulation clock: the single time source for all domain logic.

Starts at the seed's ``sim.time`` (2026-10-17T12:00:00.000Z) and advances in
sim seconds. The async loop ticks once per wall-clock second and advances sim
time by the current speed (1/5/20). Domain code never calls ``datetime.now()``;
everything receives this clock.
"""

from __future__ import annotations

from datetime import timedelta

from app.domain import SimState, parse_timestamp, to_iso_z

SPEEDS: tuple[int, ...] = (1, 5, 20)


class SimClock:
    """Deterministic mission clock with pause/resume/speed/reset."""

    def __init__(self, start_time: str, speed: int = 1, paused: bool = False) -> None:
        if speed not in SPEEDS:
            raise ValueError(f"speed must be one of {SPEEDS}, got {speed}")
        if paused:
            raise ValueError("the seed must start with the sim unpaused")
        self._start_time = start_time
        self._now = parse_timestamp(start_time)
        self.speed: int = speed
        self.paused: bool = paused

    @property
    def start_time(self) -> str:
        return self._start_time

    def now(self) -> str:
        """Current sim time as the wire convention ISO-8601 string."""
        return to_iso_z(self._now)

    def advance(self, sim_seconds: float) -> None:
        """Advance sim time by ``sim_seconds`` (no-op while paused)."""
        if self.paused:
            return
        self._now += timedelta(seconds=sim_seconds)

    def set_speed(self, speed: int) -> None:
        if speed not in SPEEDS:
            raise ValueError(f"speed must be one of {SPEEDS}, got {speed}")
        self.speed = speed

    def pause(self) -> None:
        self.paused = True

    def resume(self) -> None:
        self.paused = False

    def reset(self, start_time: str) -> None:
        """Restore the seed start time, speed 1 and running (used by reset)."""
        self._start_time = start_time
        self._now = parse_timestamp(start_time)
        self.speed = 1
        self.paused = False

    def sim_state(self) -> SimState:
        return SimState(time=self.now(), speed=self.speed, paused=self.paused)
