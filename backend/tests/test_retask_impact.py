"""Impact analysis for each event type (B6a)."""

from app.domain import OpsEvent
from app.retask.impact import analyse_impact
from app.state.store import StateStore

TS = "2026-10-17T12:00:00.000Z"


def _inject(state: StateStore, event_type: str, payload: dict[str, object]) -> OpsEvent:
    event = OpsEvent(
        id=state.next_event_id(), timestamp=TS, type=event_type, payload=payload
    )
    state.apply_event(event)
    return event


def test_threat_detected_flags_route_b_and_base_recovery() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "THREAT_DETECTED",
        {
            "threatType": "SAM",
            "position": {"lat": 4.8, "lng": 7.4},
            "rangeKm": 85,
            "confidence": 0.9,
        },
    )
    impact = analyse_impact(event, state)
    assert impact.impacted_mission_ids == ["M-04", "M-05"]
    assert impact.most_urgent == "M-04"
    assert impact.time_to_decision_min == 5.0
    assert len(impact.reasons) == 2
    assert all("THR-05" in reason for reason in impact.reasons)


def test_aircraft_unserviceable_flags_assigned_mission() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "AIRCRAFT_UNSERVICEABLE",
        {"aircraftId": "AC-07", "reason": "Hydraulic failure"},
    )
    impact = analyse_impact(event, state)
    assert impact.impacted_mission_ids == ["M-04"]
    assert impact.most_urgent == "M-04"
    assert "AC-07" in impact.reasons[0]


def test_base_closed_flags_launch_and_recovery_users() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "BASE_CLOSED",
        {"baseId": "BASE-B", "runwayStatus": "closed", "durationHours": 6},
    )
    impact = analyse_impact(event, state)
    assert impact.impacted_mission_ids == ["M-04", "M-05", "M-07"]
    assert sum(reason.startswith("Inter-Base") for reason in impact.reasons) == 1
    assert all("BASE-B" in reason for reason in impact.reasons)


def test_weather_flags_missions_at_affected_base() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "WEATHER_DEGRADED",
        {"baseId": "BASE-B", "severity": "severe", "windKts": 45},
    )
    impact = analyse_impact(event, state)
    assert impact.impacted_mission_ids == ["M-04", "M-05", "M-07"]
    assert any("recovers at BASE-B" in reason for reason in impact.reasons)


def test_crew_unavailable_flags_assigned_mission() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state, "CREW_UNAVAILABLE", {"crewId": "CR-07", "reason": "Medical"}
    )
    impact = analyse_impact(event, state)
    assert impact.impacted_mission_ids == ["M-04"]
    assert "CR-07" in impact.reasons[0]


def test_new_priority_mission_flags_lower_priority_candidates() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "NEW_PRIORITY_MISSION",
        {
            "name": "Emergency Aeromedical Lift",
            "type": "airlift",
            "priority": 2,
            "launchBaseId": "BASE-C",
            "targetCoordinates": {"lat": 4.6, "lng": 10.5},
            "requiredAircraftType": "Transport-C",
        },
    )
    impact = analyse_impact(event, state)
    assert "M-11" in state.missions
    assert impact.most_urgent == "M-11"
    assert impact.impacted_mission_ids == ["M-10"]
    assert "M-10" in impact.reasons[0]
