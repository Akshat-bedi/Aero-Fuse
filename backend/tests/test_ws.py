"""WebSocket coverage: SNAPSHOT first, ticks, heartbeat, event broadcasts.

The TestClient runs the app lifespan (loop bound, no wall-clock loops), so the
tests drive ``runtime.engine.tick()`` / ``runtime.broadcast_heartbeat()`` and
assert on the frames that arrive. Every frame payload is validated against the
domain models (contract tests).
"""

from typing import Any

from app.domain import ClockTickPayload, OpsEvent, PositionTickItem, WireSnapshot
from app.runtime import SimRuntime
from fastapi.testclient import TestClient

LiveApp = tuple[TestClient, SimRuntime]

THREAT_EVENT: dict[str, Any] = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 4.9, "lng": 7.6},
        "rangeKm": 85,
        "confidence": 0.9,
    },
}


def test_first_frame_is_the_snapshot(app_client: LiveApp) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        frame = ws.receive_json()
        assert frame["type"] == "SNAPSHOT"
        assert frame["stateVersion"] == runtime.store.version
        assert frame["ts"] == runtime.clock.now()
        snapshot = WireSnapshot.model_validate(frame["payload"])
        assert len(snapshot.missions) == 10
        assert snapshot.state_version == runtime.store.version


def test_tick_broadcasts_clock_then_position(app_client: LiveApp) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()

        runtime.broadcast_tick()

        clock_frame = ws.receive_json()
        position_frame = ws.receive_json()
        assert clock_frame["type"] == "CLOCK_TICK"
        assert position_frame["type"] == "POSITION_TICK"

        clock = ClockTickPayload.model_validate(clock_frame["payload"])
        assert clock.sim_time == "2026-10-17T12:00:01.000Z"
        assert clock.speed == 1
        assert clock.paused is False
        assert clock_frame["stateVersion"] == runtime.store.version

        items = [PositionTickItem.model_validate(item) for item in position_frame["payload"]]
        assert items
        assert all(item.position is not None for item in items)
        assert position_frame["stateVersion"] == runtime.store.version


def test_heartbeat_and_ping_are_harmless(app_client: LiveApp) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()

        runtime.broadcast_heartbeat()
        frame = ws.receive_json()
        assert frame["type"] == "HEARTBEAT"
        assert frame["payload"] == {}

        ws.send_json({"type": "PING"})
        ws.send_json({"type": "NOT_A_REAL_MESSAGE"})

        runtime.broadcast_tick()
        assert ws.receive_json()["type"] == "CLOCK_TICK"


def test_event_injection_broadcasts_event_then_entity_update(app_client: LiveApp) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()

        response = client.post("/api/events", json=THREAT_EVENT)
        assert response.status_code == 201

        event_frame = ws.receive_json()
        update_frame = ws.receive_json()
        assert event_frame["type"] == "EVENT_INJECTED"
        assert update_frame["type"] == "ENTITY_UPDATE"

        event = OpsEvent.model_validate(event_frame["payload"])
        assert event.id == "EV-0001"
        assert event_frame["stateVersion"] == runtime.store.version
        assert update_frame["stateVersion"] == runtime.store.version
        assert [threat["id"] for threat in update_frame["payload"]["threats"]] == ["THR-05"]


def test_reset_broadcasts_a_full_snapshot(app_client: LiveApp) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()

        client.post("/api/events", json=THREAT_EVENT)
        ws.receive_json()  # EVENT_INJECTED
        ws.receive_json()  # ENTITY_UPDATE

        client.post("/api/sim/control", json={"action": "reset"})

        frame = ws.receive_json()
        while frame["type"] != "SNAPSHOT":
            frame = ws.receive_json()
        assert frame["stateVersion"] == runtime.store.version
        snapshot = WireSnapshot.model_validate(frame["payload"])
        assert len(snapshot.threats) == 4
