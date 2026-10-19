"""Typed event payload coverage, including the verified injector shapes."""

from typing import Any

import pytest
from app.domain import (
    AircraftUnserviceablePayload,
    BaseClosedPayload,
    CrewUnavailablePayload,
    EventType,
    NewPriorityMissionPayload,
    OpsEvent,
    OpsEventRequest,
    ThreatDetectedPayload,
    ThreatType,
    WeatherDegradedPayload,
    dump_wire,
    parse_event_payload,
)
from pydantic import ValidationError


def test_threat_detected_uses_scenario_panel_shape() -> None:
    payload = ThreatDetectedPayload.model_validate(
        {
            "threatType": "SAM",
            "position": {"lat": 4.8, "lng": 7.5},
            "rangeKm": 85,
            "confidence": 0.9,
        }
    )
    assert payload.threat_type is ThreatType.SAM
    assert payload.status.value == "active"
    assert dump_wire(payload)["threatType"] == "SAM"
    assert "type" not in dump_wire(payload)


def test_threat_detected_uses_debug_page_shape_without_confidence() -> None:
    payload = ThreatDetectedPayload.model_validate(
        {"threatType": "SAM", "position": {"lat": 4.8, "lng": 7.5}, "rangeKm": 85}
    )
    assert payload.confidence is None


def test_threat_detected_normalises_aliases() -> None:
    parsed = parse_event_payload(
        "THREAT_DETECTED",
        {
            "type": "EW",
            "position": {"lat": 4.0, "lng": 7.0},
            "rangeKm": 50,
            "confidence": 0.5,
        },
    )
    assert isinstance(parsed, ThreatDetectedPayload)
    assert parsed.threat_type is ThreatType.RADAR
    assert ThreatDetectedPayload.model_validate(
        {"threatType": "aaa", "position": {"lat": 4.0, "lng": 7.0}, "rangeKm": 30}
    ).threat_type is ThreatType.AAA
    assert ThreatDetectedPayload.model_validate(
        {"threatType": "Fighter", "position": {"lat": 4.0, "lng": 7.0}, "rangeKm": 30}
    ).threat_type is ThreatType.FIGHTER
    with pytest.raises(ValidationError):
        ThreatDetectedPayload.model_validate(
            {"threatType": "bogey", "position": {"lat": 4.0, "lng": 7.0}, "rangeKm": 30}
        )


def test_base_closed_defaults_from_debug_page_shape() -> None:
    payload = BaseClosedPayload.model_validate({"baseId": "BASE-B", "reason": "crosswinds"})
    assert payload.runway_status.value == "closed"
    assert payload.duration_hours is None


def test_base_closed_scenario_panel_shape() -> None:
    payload = BaseClosedPayload.model_validate(
        {"baseId": "BASE-B", "runwayStatus": "closed", "durationHours": 6}
    )
    assert payload.duration_hours == 6


def test_aircraft_unserviceable_shape() -> None:
    payload = AircraftUnserviceablePayload.model_validate(
        {"aircraftId": "AC-07", "reason": "Hydraulic failure", "etrHours": 4}
    )
    assert payload.aircraft_id == "AC-07"
    assert payload.etr_hours == 4


def test_weather_degraded_shape() -> None:
    payload = WeatherDegradedPayload.model_validate(
        {"baseId": "BASE-B", "severity": "severe", "windKts": 38, "visibilityKm": 2.5}
    )
    assert payload.base_id == "BASE-B"
    assert payload.severity.value == "severe"


def test_new_priority_mission_flat_shape() -> None:
    payload = NewPriorityMissionPayload.model_validate(
        {
            "name": "Emergency Intercept",
            "type": "CAP",
            "priority": 1,
            "launchBaseId": "BASE-A",
            "targetCoordinates": {"lat": 8.0, "lng": 5.5},
            "requiredAircraftType": "Fighter-A",
        }
    )
    assert payload.priority == 1
    assert payload.target_coordinates.lat == 8.0
    with pytest.raises(ValidationError):
        NewPriorityMissionPayload.model_validate(
            {
                "name": "Bad",
                "type": "CAP",
                "priority": 5,
                "launchBaseId": "BASE-A",
                "targetCoordinates": {"lat": 8.0, "lng": 5.5},
                "requiredAircraftType": "Fighter-A",
            }
        )


def test_crew_unavailable_shape() -> None:
    payload = CrewUnavailablePayload.model_validate({"crewId": "CR-01", "reason": "fatigue"})
    assert payload.crew_id == "CR-01"


def test_ops_event_request_needs_no_id_or_timestamp() -> None:
    request = OpsEventRequest.model_validate(
        {
            "type": "CREW_UNAVAILABLE",
            "payload": {"crewId": "CR-01", "reason": "fatigue"},
            "description": "grounded",
        }
    )
    assert request.type is EventType.CREW_UNAVAILABLE
    assert not hasattr(request, "id")


def test_ops_event_requires_id_and_timestamp() -> None:
    base: dict[str, Any] = {
        "type": "CREW_UNAVAILABLE",
        "payload": {"crewId": "CR-01", "reason": "fatigue"},
    }
    with pytest.raises(ValidationError):
        OpsEvent.model_validate(base)
    event = OpsEvent.model_validate(
        {**base, "id": "EV-0001", "timestamp": "2026-10-17T12:00:00Z"}
    )
    dumped = dump_wire(event)
    assert dumped["payload"] == {"crewId": "CR-01", "reason": "fatigue"}


def test_unknown_event_type_is_rejected() -> None:
    with pytest.raises(ValidationError):
        OpsEventRequest.model_validate(
            {"type": "ALIEN_INVASION", "payload": {"weird": True}}
        )


def test_parse_event_payload_helper() -> None:
    with pytest.raises(KeyError):
        parse_event_payload("NOT_A_TYPE", {})
    with pytest.raises(ValidationError):
        parse_event_payload("THREAT_DETECTED", {"threatType": "SAM"})
