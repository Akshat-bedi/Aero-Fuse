"""Sim clock coverage: pause/resume/speed/reset and determinism."""

import pytest
from app.domain import parse_timestamp
from app.runtime import SimRuntime
from app.sim.clock import SimClock
from app.sim.engine import SimEngine
from app.state.store import StateStore


def _clock() -> SimClock:
    return SimClock("2026-10-17T12:00:00.000Z", speed=1, paused=False)


def test_starts_at_seed_time() -> None:
    clock = _clock()
    assert clock.now() == "2026-10-17T12:00:00.000Z"
    assert clock.speed == 1
    assert clock.paused is False


def test_advance_by_speed() -> None:
    clock = _clock()
    clock.set_speed(20)
    clock.advance(clock.speed)
    clock.advance(clock.speed)
    assert clock.now() == "2026-10-17T12:00:40.000Z"


def test_pause_freezes_time() -> None:
    clock = _clock()
    clock.pause()
    clock.advance(120)
    assert clock.now() == "2026-10-17T12:00:00.000Z"
    clock.resume()
    clock.advance(60)
    assert clock.now() == "2026-10-17T12:01:00.000Z"


def test_reset_restores_start_time_and_speed() -> None:
    clock = _clock()
    clock.set_speed(5)
    clock.advance(600)
    clock.pause()
    clock.reset("2026-10-17T12:00:00.000Z")
    assert clock.now() == "2026-10-17T12:00:00.000Z"
    assert clock.speed == 1
    assert clock.paused is False


def test_rejects_invalid_speed() -> None:
    clock = _clock()
    with pytest.raises(ValueError):
        clock.set_speed(7)


def test_seed_must_not_be_paused() -> None:
    with pytest.raises(ValueError):
        SimClock("2026-10-17T12:00:00.000Z", speed=1, paused=True)


def test_engine_tick_advances_sim_time_by_speed(runtime: SimRuntime) -> None:
    runtime.clock.set_speed(20)
    result = runtime.engine.tick()
    assert result.clock.speed == 20
    assert result.clock.sim_time == "2026-10-17T12:00:20.000Z"


def test_engine_tick_is_a_noop_when_paused(runtime: SimRuntime) -> None:
    runtime.clock.pause()
    before = runtime.clock.now()
    result = runtime.engine.tick()
    assert runtime.clock.now() == before
    assert result.position_updates == []


def test_engine_tick_is_deterministic() -> None:
    first = SimEngine(StateStore.from_seed(), _clock())
    second = SimEngine(StateStore.from_seed(), _clock())
    for _ in range(50):
        first.tick(1.0)
        second.tick(1.0)
    snap_a = first.store.wire_snapshot(first.clock.sim_state()).model_dump(
        mode="json", by_alias=True
    )
    snap_b = second.store.wire_snapshot(second.clock.sim_state()).model_dump(
        mode="json", by_alias=True
    )
    assert snap_a == snap_b
    elapsed = parse_timestamp(first.clock.now()) - parse_timestamp("2026-10-17T12:00:00.000Z")
    assert elapsed.total_seconds() == 50
