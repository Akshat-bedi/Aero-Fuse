"""Retask API and WebSocket integration tests (B6a)."""

import time
from typing import Any, cast

from app.config import get_settings
from app.domain import OperationalAlert, Recommendation, RetaskProgress
from app.main import create_app
from app.retask.pipeline import READY_MESSAGE, STAGES
from app.runtime import SimRuntime
from fastapi import FastAPI
from fastapi.testclient import TestClient

THREAT_EVENT = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 4.8, "lng": 7.4},
        "rangeKm": 85,
        "confidence": 0.9,
    },
}
PIPELINE_TYPES = {
    "IMPACT_ANALYSIS",
    "ALERT",
    "RETASK_PROGRESS",
    "RECOMMENDATION_READY",
}


def test_event_returns_immediately_and_creates_recommendation(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, runtime = app_client
    version_before = runtime.store.version

    response = client.post("/api/events", json=THREAT_EVENT)

    assert response.status_code == 201
    assert response.json()["id"] == "EV-0001"
    assert runtime.store.version == version_before + 1
    assert runtime.retask.wait_idle(5.0)

    recommendations = client.get("/api/recommendations").json()
    assert len(recommendations) == 1
    recommendation = Recommendation.model_validate(recommendations[0])
    assert recommendation.id == "REC-0001"
    assert recommendation.status.value == "pending"
    assert recommendation.summary == "M-04 rerouted via Route C."
    assert recommendation.state_version == runtime.store.version
    assert len(recommendation.alternatives or []) == 2

    assert client.get("/api/recommendations?status=pending").json() == recommendations
    assert client.get("/api/recommendations?status=approved").json() == []

    one = client.get("/api/recommendations/REC-0001")
    assert one.status_code == 200
    assert one.json()["id"] == "REC-0001"
    assert client.get("/api/recommendations/REC-9999").status_code == 404


def test_snapshot_includes_pending_recommendations(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = app_client
    client.post("/api/events", json=THREAT_EVENT)
    assert _runtime.retask.wait_idle(5.0)
    snapshot = client.get("/api/snapshot").json()
    assert [item["id"] for item in snapshot["recommendations"]] == ["REC-0001"]


def test_eligible_resources_returns_type_matched_aircraft_and_crew(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = app_client
    response = client.get("/api/missions/M-04/eligible-resources")
    assert response.status_code == 200
    body = response.json()
    assert body["aircraft"]
    assert body["crew"]
    assert all(item["type"] == "Strike-B" for item in body["aircraft"])
    assert "AC-07" in {item["id"] for item in body["aircraft"]}
    assert all(
        item["status"] in {"serviceable", "airborne", "turnaround"}
        for item in body["aircraft"]
    )
    assert client.get("/api/missions/M-99/eligible-resources").status_code == 404


def test_websocket_streams_the_full_retask_sequence(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, runtime = app_client
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()
        client.post("/api/events", json=THREAT_EVENT)
        assert runtime.retask.wait_idle(5.0)

        frames: list[dict[str, Any]] = []
        while len(frames) < 40:
            frame = ws.receive_json()
            frames.append(frame)
            if frame["type"] == "RECOMMENDATION_READY":
                break

    pipeline_frames = [frame for frame in frames if frame["type"] in PIPELINE_TYPES]
    assert [frame["type"] for frame in pipeline_frames] == [
        "IMPACT_ANALYSIS",
        "ALERT",
        "RETASK_PROGRESS",
        "RETASK_PROGRESS",
        "RETASK_PROGRESS",
        "RETASK_PROGRESS",
        "RETASK_PROGRESS",
        "RECOMMENDATION_READY",
    ]

    impact_frame = pipeline_frames[0]
    assert impact_frame["payload"]["impactedMissionIds"] == ["M-04", "M-05"]
    assert impact_frame["payload"]["mostUrgent"] == "M-04"

    alert = OperationalAlert.model_validate(pipeline_frames[1]["payload"])
    assert alert.id == "EV-0001-AL"
    assert alert.severity.value == "critical"
    assert alert.type.value == "threat"
    assert "SAM" in alert.title
    assert alert.acknowledged is False

    progress = [
        RetaskProgress.model_validate(frame["payload"])
        for frame in pipeline_frames[2:7]
    ]
    stages = []
    for item in progress:
        assert item.stage is not None
        stages.append(item.stage.value)
    assert stages == [stage.value for stage, _message in STAGES] + ["ready"]
    assert [item.message for item in progress] == [
        message for _stage, message in STAGES
    ] + [READY_MESSAGE]
    assert [item.is_replan_active for item in progress] == [True] * 4 + [False]

    recommendation = Recommendation.model_validate(pipeline_frames[-1]["payload"])
    assert recommendation.id == "REC-0001"
    assert len(recommendation.alternatives or []) == 2
    assert {frame["stateVersion"] for frame in pipeline_frames} == {
        runtime.store.version
    }


def test_demo_scripts_catalogue_and_run(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, runtime = app_client
    scripts = client.get("/api/demo-scripts").json()
    assert [script["name"] for script in scripts] == [
        "sam-route-b",
        "runway-closure-aog",
    ]

    response = client.post("/api/demo-scripts/sam-route-b/run?reset=true")
    assert response.status_code == 200
    assert response.json() == {"status": "started", "eventCount": 1}
    assert runtime.demos.wait_idle(5.0)
    assert runtime.retask.wait_idle(5.0)
    assert [item["summary"] for item in client.get("/api/recommendations").json()] == [
        "M-04 rerouted via Route C."
    ]

    response = client.post("/api/demo-scripts/runway-closure-aog/run?reset=true")
    assert response.json() == {"status": "started", "eventCount": 2}
    assert runtime.demos.wait_idle(5.0)
    assert runtime.retask.wait_idle(5.0)
    assert len(runtime.store.recommendations) == 2
    assert [event.type.value for event in runtime.store.active_events] == [
        "BASE_CLOSED",
        "AIRCRAFT_UNSERVICEABLE",
    ]

    assert client.post("/api/demo-scripts/unknown/run").status_code == 404


def test_reset_clears_recommendations(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, runtime = app_client
    client.post("/api/demo-scripts/sam-route-b/run")
    assert runtime.demos.wait_idle(5.0)
    assert runtime.retask.wait_idle(5.0)
    assert runtime.store.recommendations

    response = client.post("/api/sim/control", json={"action": "reset"})
    assert response.status_code == 200
    assert runtime.store.recommendations == {}
    assert client.get("/api/recommendations").json() == []
    assert client.get("/api/snapshot").json()["recommendations"] == []
    assert runtime.store.audit_log == []


def test_state_change_during_retask_recomputes_the_recommendation() -> None:
    settings = get_settings().model_copy(update={"retask_min_stage_ms": 500})
    application: FastAPI = create_app(autostart_sim=False, settings=settings)
    with TestClient(application) as client:
        runtime = cast(SimRuntime, application.state.runtime)
        assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
        time.sleep(0.05)
        assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
        assert runtime.retask.wait_idle(5.0)

        recommendations = runtime.store.recommendations
        assert len(recommendations) == 2
        first = recommendations["REC-0001"]
        assert first.state_version == runtime.store.version == 3
        assert first.status.value == "pending"


def test_reset_during_retask_discards_the_stale_result() -> None:
    settings = get_settings().model_copy(update={"retask_min_stage_ms": 100})
    application: FastAPI = create_app(autostart_sim=False, settings=settings)
    with TestClient(application) as client:
        runtime = cast(SimRuntime, application.state.runtime)
        assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
        assert client.post("/api/sim/control", json={"action": "reset"}).status_code == 200
        time.sleep(0.7)
        assert runtime.store.recommendations == {}
        assert runtime.store.audit_log == []


def test_restarting_a_running_demo_keeps_the_new_run_alive() -> None:
    settings = get_settings().model_copy(update={"demo_step_delay_s": 30.0})
    application: FastAPI = create_app(autostart_sim=False, settings=settings)
    with TestClient(application) as client:
        runtime = cast(SimRuntime, application.state.runtime)
        assert client.post("/api/demo-scripts/runway-closure-aog/run").status_code == 200
        assert client.post("/api/sim/control", json={"action": "reset"}).status_code == 200
        assert client.post("/api/demo-scripts/runway-closure-aog/run").status_code == 200
        assert runtime.demos.running is True
        assert runtime.demos.wait_idle(0.2) is False
        assert client.post("/api/sim/control", json={"action": "reset"}).status_code == 200
        assert runtime.demos.wait_idle(2.0) is True
