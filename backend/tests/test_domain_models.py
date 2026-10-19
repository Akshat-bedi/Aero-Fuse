"""Model validator coverage: aliases, bounds and structural rules."""

from copy import deepcopy
from typing import Any

import pytest
from app.domain import (
    Aircraft,
    Airspace,
    AuditEntry,
    Crew,
    LatLng,
    MapBounds,
    Mission,
    ModificationsRequest,
    Recommendation,
    ScenarioParams,
    WireSnapshot,
    dump_wire,
)
from pydantic import ValidationError


def _aircraft_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "AC-99",
        "tailNumber": "VR-F99",
        "type": "Fighter-A",
        "baseId": "BASE-A",
        "status": "serviceable",
        "fuelPct": 80,
        "flightHoursToNextService": 40,
        "weaponLoad": [],
    }
    payload.update(overrides)
    return payload


def _mission_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": "M-99",
        "name": "Test Sortie",
        "type": "CAP",
        "priority": 2,
        "status": "planned",
        "launchBaseId": "BASE-A",
        "target": {"lat": 5.0, "lng": 6.0, "name": "Target"},
        "route": [{"lat": 8.5, "lng": 3.5}, {"lat": 5.0, "lng": 6.0}],
        "windowStart": "2026-10-17T12:00:00Z",
        "windowEnd": "2026-10-17T14:00:00Z",
        "requiredAircraftType": "Fighter-A",
        "assigned": {"aircraftIds": [], "crewIds": []},
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize("priority", [0, 5, "high"])
def test_mission_rejects_invalid_priority(priority: Any) -> None:
    with pytest.raises(ValidationError):
        Mission.model_validate(_mission_payload(priority=priority))


@pytest.mark.parametrize("fuel", [-1, 101])
def test_aircraft_rejects_out_of_range_fuel(fuel: float) -> None:
    with pytest.raises(ValidationError):
        Aircraft.model_validate(_aircraft_payload(fuelPct=fuel))


def test_aircraft_rejects_bad_id_prefix() -> None:
    with pytest.raises(ValidationError):
        Aircraft.model_validate(_aircraft_payload(id="AIR-99"))


@pytest.mark.parametrize(("lat", "lng"), [(11, 5), (-1, 5), (5, 13), (5, -0.5)])
def test_latlng_enforces_map_bounds(lat: float, lng: float) -> None:
    with pytest.raises(ValidationError):
        LatLng(lat=lat, lng=lng)


def test_mission_requires_window_end_after_start() -> None:
    with pytest.raises(ValidationError):
        Mission.model_validate(_mission_payload(windowEnd="2026-10-17T12:00:00Z"))
    with pytest.raises(ValidationError):
        Mission.model_validate(_mission_payload(windowEnd="2026-10-17T11:00:00Z"))


def test_map_bounds_requires_ordering() -> None:
    with pytest.raises(ValidationError):
        MapBounds(minLat=9, maxLat=1, minLng=0, maxLng=12)


def test_recommendation_criteria_scores_are_0_to_100() -> None:
    base: dict[str, Any] = {
        "id": "REC-0001",
        "triggerEventId": "EV-0001",
        "summary": "Reroute M-04",
        "score": 86,
        "changes": [],
        "impactedMissionIds": ["M-04"],
        "tradeoffs": [],
        "explanation": [],
        "constraintsSatisfied": [],
        "constraintsRelaxed": [],
        "status": "pending",
        "createdAt": "2026-10-17T12:00:05Z",
        "stateVersion": 2,
        "confidence": 0.8,
        "dataFreshnessSec": 5,
    }
    parsed = Recommendation.model_validate(
        {**base, "criteriaScores": {"overallFeasibility": 90, "threatAvoidance": 80}}
    )
    assert parsed.criteria_scores == {"overallFeasibility": 90.0, "threatAvoidance": 80.0}

    with pytest.raises(ValidationError):
        Recommendation.model_validate({**base, "criteriaScores": {"threatAvoidance": 120}})


def test_recommendation_alternatives_recurse() -> None:
    base: dict[str, Any] = {
        "id": "REC-0001",
        "triggerEventId": "EV-0001",
        "summary": "Primary",
        "score": 86,
        "changes": [],
        "impactedMissionIds": [],
        "tradeoffs": [],
        "explanation": [],
        "constraintsSatisfied": [],
        "constraintsRelaxed": [],
        "status": "pending",
        "createdAt": "2026-10-17T12:00:05Z",
        "stateVersion": 2,
        "confidence": 0.8,
        "dataFreshnessSec": 5,
        "alternatives": [
            {
                "id": "REC-0001-A1",
                "triggerEventId": "EV-0001",
                "summary": "Alternative",
                "score": 70,
                "changes": [],
                "impactedMissionIds": [],
                "tradeoffs": [],
                "explanation": [],
                "constraintsSatisfied": [],
                "constraintsRelaxed": [],
                "status": "pending",
                "createdAt": "2026-10-17T12:00:05Z",
                "stateVersion": 2,
                "confidence": 0.6,
                "dataFreshnessSec": 5,
                "alternatives": [],
            }
        ],
    }
    parsed = Recommendation.model_validate(base)
    assert parsed.alternatives is not None
    assert parsed.alternatives[0].alternatives == []


def test_crew_tolerates_legacy_field_names() -> None:
    parsed = Crew.model_validate(
        {
            "id": "CR-99",
            "callsign": "TEST",
            "role": "Pilot",
            "qualifications": ["NIGHT_OPS"],
            "baseId": "BASE-A",
            "fatigueScore": 55,
            "dutyHours24h": 7.5,
            "status": "available",
        }
    )
    dumped = dump_wire(parsed)
    assert dumped["fatigueIndex"] == 55
    assert dumped["dutyHoursLast24h"] == 7.5
    assert "fatigueScore" not in dumped
    assert "dutyHours24h" not in dumped


def test_audit_entry_tolerates_previous_hash_alias() -> None:
    parsed = AuditEntry.model_validate(
        {
            "id": "AUD-0001",
            "timestamp": "2026-10-17T12:00:00Z",
            "operator": "demo-commander",
            "action": "GENESIS",
            "targetId": "system",
            "details": "genesis entry",
            "previousHash": "0" * 64,
            "hash": "a" * 64,
        }
    )
    assert dump_wire(parsed)["prevHash"] == "0" * 64


def test_scenario_params_validates_envelope() -> None:
    parsed = ScenarioParams.model_validate({"threatLevel": "high", "surgeMissions": 2})
    assert parsed.threat_level == "high"
    assert ScenarioParams.model_validate({"threatLevel": 3}).threat_level == 3
    with pytest.raises(ValidationError):
        ScenarioParams.model_validate({"threatLevel": "extreme"})
    with pytest.raises(ValidationError):
        ScenarioParams.model_validate({"surgeMissions": 9})
    with pytest.raises(ValidationError):
        ScenarioParams.model_validate({"crewAvailabilityReductionPct": 101})


def test_modifications_request_accepts_both_shapes() -> None:
    keyed = ModificationsRequest.model_validate(
        {
            "aircraftSwap": {"missionId": "M-04", "newAircraftId": "AC-11"},
            "crewSwap": {"missionId": "M-04", "newCrewId": "CR-12"},
        }
    )
    assert keyed.aircraft_swap is not None
    assert keyed.aircraft_swap.new_aircraft_id == "AC-11"

    array_shape = ModificationsRequest.model_validate(
        [{"missionId": "M-04", "aircraftIds": ["AC-11"], "crewIds": ["CR-12"]}]
    )
    assert array_shape.assignments is not None
    assert array_shape.assignments[0].aircraft_ids == ["AC-11"]


def test_airspace_polygon_must_be_closed(seed_raw: dict[str, Any]) -> None:
    airspace = deepcopy(seed_raw["airspace"][0])
    ring = airspace["polygon"]["coordinates"][0]
    ring.pop()
    with pytest.raises(ValidationError):
        Airspace.model_validate(airspace)


def test_airspace_polygon_must_stay_in_bounds(seed_raw: dict[str, Any]) -> None:
    airspace = deepcopy(seed_raw["airspace"][0])
    airspace["polygon"]["coordinates"][0][0] = [99.0, 7.8]
    airspace["polygon"]["coordinates"][0][-1] = [99.0, 7.8]
    with pytest.raises(ValidationError):
        Airspace.model_validate(airspace)


def test_airspace_rejects_inverted_floor_ceiling(seed_raw: dict[str, Any]) -> None:
    airspace = deepcopy(seed_raw["airspace"][0])
    airspace["floorFt"] = 40000
    airspace["ceilingFt"] = 10000
    with pytest.raises(ValidationError):
        Airspace.model_validate(airspace)


def test_seed_entities_parse(seed_snapshot: WireSnapshot) -> None:
    mission = seed_snapshot.missions[3]
    assert mission.route_options is not None
    assert mission.route_options[1].id == "Route B"
    assert mission.route_options[1].risk_score == 88
