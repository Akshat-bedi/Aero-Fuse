"""``POST /sim/control`` coverage: pause, resume, speed, reset semantics."""

from typing import Any

from app.domain import MissionStatus
from app.runtime import SimRuntime
from fastapi.testclient import TestClient

LiveApp = tuple[TestClient, SimRuntime]


def _control(client: TestClient, action: str, speed: int | None = None) -> Any:
    body: dict[str, object] = {"action": action}
    if speed is not None:
        body["speed"] = speed
    return client.post("/api/sim/control", json=body)


def test_pause_and_resume(app_client: LiveApp) -> None:
    client, runtime = app_client
    paused = _control(client, "pause").json()
    assert paused == {"simTime": "2026-10-17T12:00:00.000Z", "speed": 1, "paused": True}

    runtime.engine.tick(30.0)
    assert runtime.clock.now() == "2026-10-17T12:00:00.000Z"

    resumed = _control(client, "resume").json()
    assert resumed["paused"] is False
    runtime.engine.tick(30.0)
    assert runtime.clock.now() == "2026-10-17T12:00:30.000Z"


def test_speed_sets_multiplier(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _control(client, "speed", speed=20).json()
    assert response["speed"] == 20
    assert runtime.clock.speed == 20
    assert runtime.clock.now() == "2026-10-17T12:00:00.000Z"


def test_speed_action_requires_value(app_client: LiveApp) -> None:
    client, _runtime = app_client
    response = _control(client, "speed")
    assert response.status_code == 422


def test_invalid_speed_rejected(app_client: LiveApp) -> None:
    client, _runtime = app_client
    response = _control(client, "speed", speed=7)
    assert response.status_code == 422


def test_reset_restores_seed_and_bumps_version_once(app_client: LiveApp) -> None:
    client, runtime = app_client
    client.post(
        "/api/events",
        json={
            "type": "THREAT_DETECTED",
            "payload": {
                "threatType": "SAM",
                "position": {"lat": 4.9, "lng": 7.6},
                "rangeKm": 85,
            },
        },
    )
    assert "THR-05" in runtime.store.threats
    runtime.engine.tick(10.0)
    version_before = runtime.store.version

    response = _control(client, "reset")
    assert response.status_code == 200
    assert response.json() == {
        "simTime": "2026-10-17T12:00:00.000Z",
        "speed": 1,
        "paused": False,
    }

    assert runtime.store.version == version_before + 1
    assert "THR-05" not in runtime.store.threats
    assert len(runtime.store.threats) == 4
    assert runtime.store.active_events == []
    assert runtime.store.audit_log == []
    assert runtime.store.missions["M-07"].status is MissionStatus.APPROVED

    snapshot = client.get("/api/snapshot").json()
    assert snapshot["stateVersion"] == version_before + 1
    assert snapshot["sim"] == {"time": "2026-10-17T12:00:00.000Z", "speed": 1, "paused": False}
    assert len(snapshot["threats"]) == 4


def test_reset_clears_recommendation_stub(app_client: LiveApp) -> None:
    client, runtime = app_client
    _control(client, "reset")
    assert runtime.store.recommendations == {}
