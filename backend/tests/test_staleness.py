"""B8a staleness: ticks are ignored; material changes invalidate pending recs."""

from __future__ import annotations

from typing import Any, cast

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
ROUTE_C_THREAT: dict[str, Any] = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 3.5, "lng": 6.5},
        "rangeKm": 40,
        "confidence": 0.85,
    },
}


def _recommendation(client: TestClient, runtime: SimRuntime) -> dict[str, Any]:
    assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
    assert runtime.retask.wait_idle(5.0)
    return cast(dict[str, Any], client.get("/api/recommendations/REC-0001").json())


def test_ticks_do_not_stale_a_pending_recommendation(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _recommendation(client, runtime)
    runtime.engine.tick(120)

    current = client.get(f"/api/recommendations/{recommendation['id']}").json()
    assert current["status"] == "pending"


def test_new_threat_on_the_proposed_route_stales_the_recommendation(
    app_client: LiveApp,
) -> None:
    client, runtime = app_client
    recommendation = _recommendation(client, runtime)

    assert client.post("/api/events", json=ROUTE_C_THREAT).status_code == 201
    assert runtime.retask.wait_idle(5.0)

    current = client.get(f"/api/recommendations/{recommendation['id']}").json()
    assert current["status"] == "stale"
    stale_entries = [
        entry
        for entry in client.get("/api/audit").json()
        if entry["action"] == "RECOMMENDATION_STALE"
    ]
    assert stale_entries
    assert recommendation["id"] in stale_entries[0]["details"]


def test_base_closure_stales_a_dependent_recommendation(app_client: LiveApp) -> None:
    client, runtime = app_client
    recommendation = _recommendation(client, runtime)

    assert (
        client.post(
            "/api/events",
            json={
                "type": "BASE_CLOSED",
                "payload": {
                    "baseId": "BASE-B",
                    "runwayStatus": "closed",
                    "durationHours": 6,
                },
            },
        ).status_code
        == 201
    )
    assert runtime.retask.wait_idle(5.0)

    current = client.get(f"/api/recommendations/{recommendation['id']}").json()
    assert current["status"] == "stale"
