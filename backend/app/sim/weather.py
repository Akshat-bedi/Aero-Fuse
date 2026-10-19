"""Deterministic weather drift.

Slow sinusoidal evolution around the seed values (no randomness): visibility
and wind oscillate ±10-15% with per-base phase, driven purely by elapsed sim
time, so a given sim time always produces the same weather. Severity may move
between ``nominal`` and ``caution`` but never reaches ``severe`` on its own;
an operator-injected ``severe`` state is left untouched until reset.
"""

from __future__ import annotations

import math

from app.domain import Severity, parse_timestamp
from app.sim.clock import SimClock
from app.state.store import StateStore


class WeatherSim:
    """Slow, deterministic weather evolution (never severe by itself)."""

    def __init__(self, store: StateStore, clock: SimClock) -> None:
        self.store = store
        self.clock = clock
        self._baseline: dict[str, tuple[float, float]] = {}

    def reset(self) -> None:
        self._baseline.clear()

    def step(self) -> None:
        now = parse_timestamp(self.clock.now())
        elapsed_h = (now - parse_timestamp(self.clock.start_time)).total_seconds() / 3600.0
        for index, (key, weather) in enumerate(sorted(self.store.weather.items())):
            if key not in self._baseline:
                self._baseline[key] = (weather.visibility_km, weather.wind_kts)
            base_visibility, base_wind = self._baseline[key]
            phase = 0.7 * (index + 1)

            wind_factor = 1.0 + 0.12 * math.sin(0.50 * elapsed_h + phase)
            visibility_factor = 1.0 + 0.15 * math.sin(0.35 * elapsed_h + phase * 1.3)

            weather.wind_kts = round(max(0.0, base_wind * wind_factor), 1)
            weather.visibility_km = round(max(0.0, base_visibility * visibility_factor), 1)

            if weather.severity is not Severity.SEVERE:
                if wind_factor > 1.08 or visibility_factor < 0.90:
                    weather.severity = Severity.CAUTION
                else:
                    weather.severity = Severity.NOMINAL
