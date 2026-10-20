"""B8a decision endpoints: approve, reject, modify, validation, staleness."""

from __future__ import annotations

from datetime import timedelta
from typing import Any, cast

from app.domain import Recommendation, RecommendationStatus
from app.retask import geometry_lite
from app.runtime import SimRuntime
from fastapi.testclient import TestClient

LiveApp = tuple[TestClient, SimRuntime]

THREAT_EVENT: dict[str, Any] = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 4.8, "lng": 7.4},
        "rangeKm": 85,
        "confidence": 0.9,
    },
}


def _pending_recommendation(client: TestClient, runtime: SimRuntime) -> dict[str, Any]:
    assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
    assert runtime.retask.wait_idle(5.0)
    body = client.get("/api/recommendations").json()
    assert len(body) == 1
    return cast(dict[str, Any], body[0])


def test_approve_applies_plan_once_and_audits(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    recommendation_id = recommendation["id"]
    version_before = runtime.store.version
    route_before = list(runtime.store.missions["M-04"].route)

    response = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={
            "decision": "approve",
            "reason": "Threat picture accepted; reroute approved.",
            "operator": "COMMANDER_ALPHA",
        },
    )
    assert response.status_code == 200
    approved = Recommendation.model_validate(response.json())
    assert approved.status is RecommendationStatus.APPROVED
    assert runtime.store.version == version_before + 1
    assert runtime.store.missions["M-04"].route != route_before
    assert "Route C" in recommendation["summary"]

    audit = client.get("/api/audit").json()
    assert audit[-1]["action"] == "DECISION_APPROVED"
    assert audit[-1]["operator"] == "COMMANDER_ALPHA"
    assert audit[-1]["targetId"] == recommendation_id

    repeated = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve", "operator": "COMMANDER_ALPHA"},
    )
    assert repeated.status_code == 200
    assert runtime.store.version == version_before + 1
    assert len(client.get("/api/audit").json()) == len(audit)


def test_reject_requires_reason_and_leaves_plan_untouched(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    recommendation_id = recommendation["id"]
    version_before = runtime.store.version

    missing = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "reject", "reason": "   "},
    )
    assert missing.status_code == 422
    assert missing.json()["type"].endswith("/reason-required")
    assert runtime.store.version == version_before

    response = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={
            "decision": "reject",
            "reason": "Commander elected to hold the current route.",
            "operator": "COMMANDER_ALPHA",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert runtime.store.version == version_before
    assert geometry_lite.route_option_id_for(runtime.store.missions["M-04"]) == "Route B"
    assert client.get("/api/audit").json()[-1]["action"] == "DECISION_REJECTED"


def test_validate_and_modify_with_manual_aircraft_swap(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    recommendation_id = recommendation["id"]
    eligible = client.get("/api/missions/M-04/eligible-resources").json()
    replacement = next(
        item["id"] for item in eligible["aircraft"] if item["id"] != "AC-07"
    )
    modifications = {
        "aircraftSwap": {"missionId": "M-04", "newAircraftId": replacement}
    }
    version_before = runtime.store.version

    validated = client.post(
        f"/api/recommendations/{recommendation_id}/validate-modification",
        json=modifications,
    )
    assert validated.status_code == 200
    body = validated.json()
    assert body["valid"] is True
    assert body["conflicts"] == []
    assert 0 <= body["score"] <= 100
    assert runtime.store.version == version_before
    assert runtime.store.missions["M-04"].assigned.aircraft_ids == ["AC-07"]

    response = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={
            "decision": "modify",
            "modifications": modifications,
            "operator": "COMMANDER_ALPHA",
        },
    )
    assert response.status_code == 200
    modified = response.json()
    assert modified["status"] == "modified"
    assert modified["modifications"] == modifications
    assert runtime.store.missions["M-04"].assigned.aircraft_ids == [replacement]
    assert runtime.store.version == version_before + 1
    assert client.get("/api/audit").json()[-1]["action"] == "DECISION_MODIFIED"


def test_contract_assignment_array_is_accepted(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    eligible = client.get("/api/missions/M-04/eligible-resources").json()
    replacement = next(
        item["id"] for item in eligible["aircraft"] if item["id"] != "AC-07"
    )
    assignments = [{"missionId": "M-04", "aircraftIds": [replacement]}]

    validated = client.post(
        f"/api/recommendations/{recommendation['id']}/validate-modification",
        json=assignments,
    )
    assert validated.status_code == 200
    assert validated.json()["valid"] is True

    response = client.post(
        f"/api/recommendations/{recommendation['id']}/decision",
        json={
            "decision": "modify",
            "modifications": assignments,
            "operator": "COMMANDER_ALPHA",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "modified"
    assert runtime.store.missions["M-04"].assigned.aircraft_ids == [replacement]


def test_modify_rejects_type_mismatch(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    recommendation_id = recommendation["id"]

    response = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={
            "decision": "modify",
            "modifications": {
                "aircraftSwap": {"missionId": "M-04", "newAircraftId": "AC-15"}
            },
            "operator": "COMMANDER_ALPHA",
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["type"].endswith("/modification-invalid")
    assert body["violations"]
    assert runtime.store.missions["M-04"].assigned.aircraft_ids == ["AC-07"]


def test_stale_recommendation_cannot_be_approved(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    recommendation_id = recommendation["id"]

    response = client.post(
        "/api/events",
        json={
            "type": "AIRCRAFT_UNSERVICEABLE",
            "payload": {"aircraftId": "AC-07", "reason": "Hydraulic failure"},
        },
    )
    assert response.status_code == 201
    assert runtime.retask.wait_idle(5.0)
    stale = client.get(f"/api/recommendations/{recommendation_id}").json()
    assert stale["status"] == "stale"

    blocked = client.post(
        f"/api/recommendations/{recommendation_id}/decision",
        json={"decision": "approve", "operator": "COMMANDER_ALPHA"},
    )
    assert blocked.status_code == 409
    assert blocked.json()["type"] == "https://airops.dss/errors/stale-recommendation"
    assert blocked.json()["recommendationStateVersion"] == recommendation["stateVersion"]
    assert blocked.json()["currentStateVersion"] == runtime.store.version
    assert client.get("/api/audit").json()[-1]["action"] == "RECOMMENDATION_GENERATED"


def test_pending_recommendation_expires(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _pending_recommendation(client, runtime)
    runtime.staleness.ttl = timedelta(seconds=30)
    runtime.engine.tick(31)
    runtime.broadcast_tick()

    expired = client.get(f"/api/recommendations/{recommendation['id']}").json()
    assert expired["status"] == "expired"
    assert "RECOMMENDATION_EXPIRED" in [
        entry["action"] for entry in client.get("/api/audit").json()
    ]
    response = client.post(
        f"/api/recommendations/{recommendation['id']}/decision",
        json={"decision": "approve", "operator": "COMMANDER_ALPHA"},
    )
    assert response.status_code == 409
    assert response.json()["type"] == "https://airops.dss/errors/stale-recommendation"
