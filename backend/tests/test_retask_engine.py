"""Rule-based engine behaviour and determinism (B6a)."""

from app.domain import (
    AircraftStatus,
    ChangeKind,
    OpsEvent,
    Recommendation,
    dump_wire,
)
from app.retask.engine import PRIORITY_WEIGHTS, RuleBasedEngine
from app.state.store import StateStore

TS = "2026-10-17T12:00:00.000Z"
ENGINE = RuleBasedEngine()
CRITERIA = {
    "Overall Feasibility",
    "Threat Avoidance",
    "Fuel Efficiency",
    "Schedule Adherence",
    "Fleet Margin Preserved",
}


def _inject(state: StateStore, event_type: str, payload: dict[str, object]) -> OpsEvent:
    event = OpsEvent(
        id=state.next_event_id(), timestamp=TS, type=event_type, payload=payload
    )
    state.apply_event(event)
    return event


def _threat_event(state: StateStore) -> OpsEvent:
    return _inject(
        state,
        "THREAT_DETECTED",
        {
            "threatType": "SAM",
            "position": {"lat": 4.8, "lng": 7.4},
            "rangeKm": 85,
            "confidence": 0.9,
        },
    )


def test_priority_weights_match_the_contract() -> None:
    assert PRIORITY_WEIGHTS == {1: 1000, 2: 300, 3: 100, 4: 30}


def test_threat_proposal_reroutes_m04_and_offers_two_alternatives() -> None:
    state = StateStore.from_seed()
    original_route = list(state.missions["M-04"].route)
    original_window = state.missions["M-04"].window_start
    event = _threat_event(state)
    impact = ENGINE.analyse_impact(event, state)
    proposal = ENGINE.propose(event, state, impact)
    primary = proposal.primary

    assert not proposal.no_feasible_plan
    assert [change.kind for change in primary.changes] == [ChangeKind.REROUTE]
    assert primary.changes[0].before == "Route B"
    assert primary.changes[0].after == "Route C"
    assert primary.summary == "M-04 rerouted via Route C."
    assert primary.state_version == state.version
    assert primary.created_at == event.timestamp
    assert primary.data_freshness_sec == 0.0
    assert 0.0 <= primary.score <= 100.0
    assert 0.0 <= primary.confidence <= 1.0
    assert primary.impacted_mission_ids == ["M-04", "M-05"]
    assert set(primary.criteria_scores or {}) == CRITERIA
    assert all(0.0 <= value <= 100.0 for value in (primary.criteria_scores or {}).values())
    assert any("THR-05" in reason for reason in primary.explanation)
    assert any("M-05" in item for item in primary.constraints_relaxed)

    route_tradeoff = next(
        t for t in primary.tradeoffs if t.label == "M-04 route distance"
    )
    risk_tradeoff = next(t for t in primary.tradeoffs if t.label == "M-04 route risk")
    assert route_tradeoff.direction.value == "bad"
    assert route_tradeoff.delta == 85.0
    assert risk_tradeoff.direction.value == "good"
    assert risk_tradeoff.delta == -78.0

    assert len(proposal.alternatives) == 2
    assert len(primary.alternatives or []) == 2
    assert [alternative.id for alternative in primary.alternatives or []] == [
        "REC-0001-ALT1",
        "REC-0001-ALT2",
    ]
    assert primary.alternatives is not None
    assert {alternative.id for alternative in proposal.alternatives} == {
        alternative.id for alternative in primary.alternatives
    }

    assert state.missions["M-04"].route == original_route
    assert state.missions["M-04"].window_start == original_window
    assert state.missions["M-04"].route_options is not None
    assert state.missions["M-04"].route_options[1].id == "Route B"


def test_same_state_and_event_produce_identical_recommendations() -> None:
    first_state = StateStore.from_seed()
    first_event = _threat_event(first_state)
    first = ENGINE.propose(
        first_event, first_state, ENGINE.analyse_impact(first_event, first_state)
    )

    second_state = StateStore.from_seed()
    second_event = _threat_event(second_state)
    second = ENGINE.propose(
        second_event, second_state, ENGINE.analyse_impact(second_event, second_state)
    )

    assert dump_wire(first.primary, exclude_none=True) == dump_wire(
        second.primary, exclude_none=True
    )
    assert [dump_wire(a, exclude_none=True) for a in first.alternatives] == [
        dump_wire(a, exclude_none=True) for a in second.alternatives
    ]


def test_aircraft_unserviceable_swaps_to_a_serviceable_spare() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "AIRCRAFT_UNSERVICEABLE",
        {"aircraftId": "AC-07", "reason": "Hydraulic failure"},
    )
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    primary = proposal.primary
    swaps = [change for change in primary.changes if change.kind is ChangeKind.AIRCRAFT_SWAP]
    assert len(swaps) == 1
    assert swaps[0].before == "AC-07"
    replacement = swaps[0].after
    assert replacement == "AC-10"
    airframe = state.aircraft[replacement]
    assert airframe.type == state.missions["M-04"].required_aircraft_type
    assert airframe.status is AircraftStatus.SERVICEABLE
    assert state.missions["M-04"].assigned.aircraft_ids == ["AC-07"]


def test_base_closed_diverts_to_open_bases() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state,
        "BASE_CLOSED",
        {"baseId": "BASE-B", "runwayStatus": "closed", "durationHours": 6},
    )
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    primary = proposal.primary
    assert "BASE-B" not in primary.summary
    assert primary.impacted_mission_ids == ["M-04", "M-05", "M-07"]
    destinations = {
        change.after
        for change in primary.changes
        if change.kind is ChangeKind.REROUTE
    }
    assert destinations
    assert destinations <= {"BASE-A", "BASE-C", "BASE-D"}
    assert state.missions["M-04"].launch_base_id == "BASE-B"


def test_crew_unavailable_replaces_with_rested_qualified_crew() -> None:
    state = StateStore.from_seed()
    event = _inject(
        state, "CREW_UNAVAILABLE", {"crewId": "CR-07", "reason": "Medical"}
    )
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    swaps = [
        change
        for change in proposal.primary.changes
        if change.kind is ChangeKind.CREW_SWAP
    ]
    assert swaps and swaps[0].before == "CR-07"
    replacement = state.crew[swaps[0].after]
    assert replacement.status.value == "available"
    assert replacement.duty_hours_last24h + 4.0 <= 12.0
    assert set(state.missions["M-04"].required_crew_quals) <= set(
        replacement.qualifications
    )


def test_new_priority_mission_gets_new_assignment() -> None:
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
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    assignments = [
        change
        for change in proposal.primary.changes
        if change.kind is ChangeKind.NEW_ASSIGNMENT
    ]
    assert assignments and assignments[0].mission_id == "M-11"
    assert state.missions["M-11"].status.value == "planned"
    assert state.missions["M-11"].assigned.aircraft_ids == []


def test_no_feasible_plan_for_p1_without_spares() -> None:
    state = StateStore.from_seed()
    for aircraft_id in ["AC-09", "AC-10", "AC-11", "AC-12", "AC-13", "AC-14"]:
        state.aircraft[aircraft_id].status = AircraftStatus.UNSERVICEABLE
    event = _inject(
        state,
        "AIRCRAFT_UNSERVICEABLE",
        {"aircraftId": "AC-07", "reason": "Hydraulic failure"},
    )
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    assert proposal.no_feasible_plan
    assert proposal.primary.summary.startswith("NO FEASIBLE PLAN")
    assert proposal.primary.changes == []
    assert proposal.primary.constraints_relaxed
    assert proposal.primary.score == 10.0
    assert proposal.primary.confidence == 0.3
    assert proposal.alternatives == []


def test_recommendation_round_trips_wire_contract() -> None:
    state = StateStore.from_seed()
    event = _threat_event(state)
    proposal = ENGINE.propose(event, state, ENGINE.analyse_impact(event, state))
    wire = dump_wire(proposal.primary, exclude_none=True)
    assert wire["id"] == "REC-0001"
    assert wire["status"] == "pending"
    assert "alternatives" in wire
    assert Recommendation.model_validate(wire).id == "REC-0001"
