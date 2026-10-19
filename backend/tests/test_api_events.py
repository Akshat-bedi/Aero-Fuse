"""Event injection coverage: factual effects, id/timestamp rules, 404/422."""

from typing import Any

from app.domain import AircraftStatus, CrewStatus, MissionStatus, RunwayStatus, Severity
from app.runtime import SimRuntime
from app.state.store import StateChange
from fastapi.testclient import TestClient

LiveApp = tuple[TestClient, SimRuntime]


def _post(client: Any, event_type: str, payload: dict[str, Any]) -> Any:
    return client.post("/api/events", json={"type": event_type, "payload": payload})


def test_threat_detected_creates_new_threat_and_bumps_once(app_client: LiveApp) -> None:
    client, runtime = app_client
    version_before = runtime.store.version

    response = _post(
        client,
        "THREAT_DETECTED",
        {
            "threatType": "SAM",
            "position": {"lat": 4.9, "lng": 7.6},
            "rangeKm": 85,
            "confidence": 0.9,
        },
    )
    assert response.status_code == 201
    event = response.json()
    assert event["id"] == "EV-0001"
    assert event["timestamp"] == runtime.clock.now()
    assert event["payload"]["threatType"] == "SAM"

    assert runtime.store.version == version_before + 1
    assert "THR-05" in runtime.store.threats
    assert runtime.store.threats["THR-05"].status.value == "active"
    assert len(runtime.store.threats) == 5

    # baseline threats are untouched (THR-01..04 keep their geometry)
    assert runtime.store.threats["THR-02"].position.lat == 4.8
    assert runtime.store.threats["THR-02"].position.lng == 7.5
    assert runtime.store.active_events[0].id == "EV-0001"


def test_event_ids_increment(app_client: LiveApp) -> None:
    client, runtime = app_client
    first = _post(
        client,
        "THREAT_DETECTED",
        {"threatType": "EW", "position": {"lat": 1.0, "lng": 1.0}, "rangeKm": 40},
    )
    second = _post(
        client,
        "THREAT_DETECTED",
        {"threatType": "Radar", "position": {"lat": 2.0, "lng": 2.0}, "rangeKm": 30},
    )
    assert first.json()["id"] == "EV-0001"
    assert second.json()["id"] == "EV-0002"
    # EW normalises to radar (Q1); omitted confidence defaults to 0.9
    assert first.json()["payload"]["threatType"] == "radar"
    assert "THR-05" in runtime.store.threats
    assert "THR-06" in runtime.store.threats


def test_aircraft_unserviceable_sets_status(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(
        client,
        "AIRCRAFT_UNSERVICEABLE",
        {"aircraftId": "AC-07", "reason": "hydraulic failure"},
    )
    assert response.status_code == 201
    assert runtime.store.aircraft["AC-07"].status is AircraftStatus.UNSERVICEABLE


def test_base_closed_sets_runway_status(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(
        client,
        "BASE_CLOSED",
        {"baseId": "BASE-B", "runwayStatus": "closed", "durationHours": 6},
    )
    assert response.status_code == 201
    assert runtime.store.bases["BASE-B"].runway_status is RunwayStatus.CLOSED


def test_base_closed_defaults_when_debug_page_omits_fields(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(client, "BASE_CLOSED", {"baseId": "BASE-D", "reason": "cratering"})
    assert response.status_code == 201
    assert runtime.store.bases["BASE-D"].runway_status is RunwayStatus.CLOSED


def test_weather_degraded_sets_severity(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(
        client,
        "WEATHER_DEGRADED",
        {"baseId": "BASE-B", "severity": "caution", "windKts": 32, "visibilityKm": 6},
    )
    assert response.status_code == 201
    weather = runtime.store.weather["BASE-B"]
    assert weather.severity is Severity.CAUTION
    assert weather.wind_kts == 32
    assert weather.visibility_km == 6


def test_crew_unavailable_sets_status(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(client, "CREW_UNAVAILABLE", {"crewId": "CR-12", "reason": "injury"})
    assert response.status_code == 201
    assert runtime.store.crew["CR-12"].status is CrewStatus.UNAVAILABLE


def test_new_priority_mission_creates_planned_mission(app_client: LiveApp) -> None:
    client, runtime = app_client
    response = _post(
        client,
        "NEW_PRIORITY_MISSION",
        {
            "name": "Alpha Interdiction",
            "type": "strike",
            "priority": 2,
            "launchBaseId": "BASE-B",
            "targetCoordinates": {"lat": 5.0, "lng": 6.0},
            "requiredAircraftType": "Strike-B",
        },
    )
    assert response.status_code == 201
    event = response.json()
    mission = runtime.store.missions["M-11"]
    assert mission.status is MissionStatus.PLANNED
    assert mission.window_start == event["timestamp"]
    assert mission.launch_base_id == "BASE-B"
    assert mission.route[0] == runtime.store.bases["BASE-B"].location
    assert mission.assigned.aircraft_ids == []


def test_unknown_aircraft_returns_404_problem(app_client: LiveApp) -> None:
    client, runtime = app_client
    version_before = runtime.store.version
    response = _post(client, "AIRCRAFT_UNSERVICEABLE", {"aircraftId": "AC-99", "reason": "x"})
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 404
    assert "AC-99" in body["detail"]
    assert runtime.store.version == version_before


def test_unknown_base_returns_404_problem(app_client: LiveApp) -> None:
    client, _runtime = app_client
    response = _post(client, "BASE_CLOSED", {"baseId": "BASE-Z"})
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")


def test_malformed_payload_returns_422(app_client: LiveApp) -> None:
    client, runtime = app_client
    version_before = runtime.store.version
    missing_range = _post(
        client, "THREAT_DETECTED", {"threatType": "SAM", "position": {"lat": 1.0, "lng": 1.0}}
    )
    assert missing_range.status_code == 422
    assert missing_range.headers["content-type"].startswith("application/problem+json")

    unknown_type = _post(client, "ALIEN_INVASION", {"whatever": True})
    assert unknown_type.status_code == 422
    assert runtime.store.version == version_before


def test_store_notification_reports_single_bump_and_changed_ids(app_client: LiveApp) -> None:
    client, runtime = app_client
    changes: list[StateChange] = []
    runtime.store.subscribe(changes.append)
    _post(
        client,
        "THREAT_DETECTED",
        {"threatType": "SAM", "position": {"lat": 4.9, "lng": 7.6}, "rangeKm": 85},
    )
    assert len(changes) == 1
    change = changes[0]
    assert change.kind == "event"
    assert change.changed == {"threats": ["THR-05"]}
    assert change.event is not None and change.event.id == "EV-0001"
