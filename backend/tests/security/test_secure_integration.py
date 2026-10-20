"""End-to-end B8b wiring: JWT -> step-up -> two-person approval -> audit."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, cast

import pytest
from app.config import Settings, get_settings
from app.main import create_app
from app.runtime import SimRuntime
from app.security.users import DEMO_PASSWORD, DEMO_STEP_UP_PIN
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

AUTH_SECRET = "secure-integration-" + "x" * 40
PASSWORD = DEMO_PASSWORD
PIN = DEMO_STEP_UP_PIN

THREAT_EVENT: dict[str, Any] = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 4.8, "lng": 7.4},
        "rangeKm": 85,
        "confidence": 0.9,
    },
}


@pytest.fixture()
def secure_client() -> Iterator[tuple[TestClient, SimRuntime]]:
    base = get_settings().model_copy(
        update={
            "retask_min_stage_ms": 0,
            "demo_step_delay_s": 0.0,
            "auth_enabled": True,
            "jwt_secret": AUTH_SECRET,
            "high_impact_mission_threshold": 1,
        }
    )
    settings = Settings.model_validate(base.model_dump())
    application = create_app(autostart_sim=False, settings=settings)
    with TestClient(application) as client:
        yield client, cast(SimRuntime, application.state.runtime)


def _access_token(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return cast(str, response.json()["accessToken"])


def _login(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_access_token(client, username)}"}


def _step_up(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/auth/step-up",
        json={"pin": PIN},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def _inject_threat(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post("/api/events", json=THREAT_EVENT, headers=headers)
    assert response.status_code == 201, response.text
    client.app.state.runtime.retask.wait_idle(5.0)  # type: ignore[attr-defined]
    recommendations = client.get("/api/recommendations", headers=headers).json()
    assert len(recommendations) == 1
    return cast(str, recommendations[0]["id"])


def test_auth_is_required_for_operational_routes(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    assert client.get("/api/snapshot").status_code == 401
    assert client.post("/api/events", json=THREAT_EVENT).status_code == 401


def test_event_permissions_are_per_type(secure_client: tuple[TestClient, SimRuntime]) -> None:
    client, _runtime = secure_client
    observer = _login(client, "observer")
    intel = _login(client, "intel_officer")

    denied = client.post("/api/events", json=THREAT_EVENT, headers=observer)
    assert denied.status_code == 403

    allowed = client.post("/api/events", json=THREAT_EVENT, headers=intel)
    assert allowed.status_code == 201
    assert allowed.json()["operator"] == "intel_officer"


def test_step_up_two_person_approval_and_audit(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, runtime = secure_client
    planner = _login(client, "ops_planner")
    commander = _login(client, "commander")
    commander_2 = _login(client, "commander_2")
    auditor = _login(client, "auditor")

    recommendation_id = _inject_threat(client, planner)
    version_before = runtime.store.version

    no_step_up = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve"},
        headers=commander,
    )
    assert no_step_up.status_code == 428
    assert no_step_up.json()["type"].endswith("/step-up-required")
    assert runtime.store.version == version_before

    _step_up(client, commander)
    first = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve"},
        headers=commander,
    )
    assert first.status_code == 200, first.text
    pending = first.json()
    assert pending["status"] == "pending"
    assert pending["approvalsRequired"] == 2
    assert len(pending["approvals"]) == 1
    assert runtime.store.version == version_before

    _step_up(client, commander_2)
    second = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve"},
        headers=commander_2,
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "approved"
    assert runtime.store.version == version_before + 1

    audit = client.get("/api/audit", headers=auditor).json()
    actions = [entry["action"] for entry in audit]
    assert actions.count("APPROVAL_RECORDED") >= 2
    assert actions[-1] == "DECISION_APPROVED"
    assert audit[-1]["operator"] == "commander_2"


def test_separation_of_duties_blocks_the_triggering_commander(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    commander = _login(client, "commander")
    recommendation_id = _inject_threat(client, commander)
    _step_up(client, commander)

    denied = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve"},
        headers=commander,
    )
    assert denied.status_code == 403
    assert denied.json()["gateCode"] == "separation_of_duties"


def test_spoofed_operator_is_ignored_and_audited(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    intel = _login(client, "intel_officer")
    response = client.post(
        "/api/events",
        json={**THREAT_EVENT, "operator": "commander"},
        headers=intel,
    )
    assert response.status_code == 201
    assert response.json()["operator"] == "intel_officer"

    audit = client.get("/api/audit", headers=_login(client, "auditor")).json()
    spoofs = [entry for entry in audit if entry["action"] == "SPOOF_ATTEMPT"]
    assert spoofs and spoofs[-1]["operator"] == "intel_officer"


def test_commander_can_revoke_own_pending_approval(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    planner = _login(client, "ops_planner")
    commander = _login(client, "commander")
    recommendation_id = _inject_threat(client, planner)
    _step_up(client, commander)

    approved_once = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve"},
        headers=commander,
    )
    assert approved_once.status_code == 200
    assert approved_once.json()["status"] == "pending"

    revoked = client.post(
        f"/api/recommendations/{recommendation_id}/approvals/revoke",
        headers=commander,
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "pending"
    assert revoked.json()["approvals"] == []

    audit = client.get("/api/audit", headers=_login(client, "auditor")).json()
    assert any(entry["action"] == "APPROVAL_REVOKED" for entry in audit)


def test_websocket_sends_no_snapshot_before_auth(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        client.websocket_connect("/ws") as socket,
    ):
        socket.send_json({"type": "PING"})
        socket.receive_json()
    assert caught.value.code == 4401


def test_websocket_query_token_is_rejected(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    token = _access_token(client, "commander")
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        client.websocket_connect(f"/ws?token={token}") as socket,
    ):
        socket.send_json({"type": "PING"})
        socket.receive_json()
    assert caught.value.code == 4401


def test_websocket_authenticates_via_subprotocol(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    token = _access_token(client, "commander")
    with client.websocket_connect("/ws", subprotocols=[f"bearer.{token}"]) as socket:
        assert socket.receive_json()["type"] == "SNAPSHOT"


def test_websocket_authenticates_via_first_message(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    token = _access_token(client, "ops_planner")
    with client.websocket_connect("/ws") as socket:
        socket.send_json({"type": "AUTH", "token": token})
        assert socket.receive_json()["type"] == "SNAPSHOT"


def test_websocket_read_only_role_can_only_ping(
    secure_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = secure_client
    token = _access_token(client, "observer")
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        client.websocket_connect("/ws", subprotocols=[f"bearer.{token}"]) as socket,
    ):
        assert socket.receive_json()["type"] == "SNAPSHOT"
        socket.send_json({"type": "COMMAND"})
        socket.receive_json()
    assert caught.value.code == 4403
