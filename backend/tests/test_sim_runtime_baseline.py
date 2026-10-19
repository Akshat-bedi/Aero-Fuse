"""The hard B2 invariant: the baseline stays conflict-free while time runs.

Runs the deterministic engine for 6 sim hours at 20x (as production would with
``/sim/control`` speed 20) and re-applies the B1 baseline conflict rules on
every sim hour, plus the "nothing becomes at-risk by itself" check.
"""

from typing import Any

from app.config import get_settings
from app.domain import MissionStatus, dump_wire
from app.runtime import SimRuntime
from app.state.store import StateStore

from baseline_rules import baseline_violations


def _wire_state(store: StateStore) -> dict[str, Any]:
    return {
        "aircraft": [dump_wire(airframe) for airframe in store.aircraft.values()],
        "crew": [dump_wire(member) for member in store.crew.values()],
        "missions": [dump_wire(mission) for mission in store.missions.values()],
    }


def test_baseline_stays_clean_for_six_sim_hours_at_20x() -> None:
    runtime = SimRuntime(get_settings())
    runtime.clock.set_speed(20)

    for hour in range(1, 7):
        for _ in range(3600 // 20):
            runtime.engine.tick()
        raw = _wire_state(runtime.store)

        violations = baseline_violations(raw)
        assert violations == [], f"hour {hour} conflicts:\n" + "\n".join(violations)

        at_risk = [m["id"] for m in raw["missions"] if m["status"] == "at-risk"]
        assert at_risk == [], f"hour {hour}: missions became at-risk: {at_risk}"

    assert runtime.clock.now() == "2026-10-17T18:00:00.000Z"

    statuses = [mission.status for mission in runtime.store.missions.values()]
    assert statuses.count(MissionStatus.COMPLETED) == 5
    assert statuses.count(MissionStatus.IN_PROGRESS) >= 1
    assert statuses.count(MissionStatus.AT_RISK) == 0
