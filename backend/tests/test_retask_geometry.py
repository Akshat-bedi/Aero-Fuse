"""Geometry helpers used by the B6a rule slice."""

from app.domain import LatLng, Threat, ThreatStatus, ThreatType
from app.retask import geometry_lite
from app.state.store import StateStore

THREAT = Threat(
    id="THR-99",
    type=ThreatType.SAM,
    position=LatLng(lat=4.8, lng=7.4),
    range_km=85.0,
    confidence=0.9,
    last_seen="2026-10-17T12:00:00.000Z",
    status=ThreatStatus.ACTIVE,
)


def test_distance_uses_local_projection() -> None:
    assert geometry_lite.distance_km(LatLng(lat=5.0, lng=6.0), LatLng(lat=6.0, lng=6.0)) == 111.0
    assert geometry_lite.distance_km(LatLng(lat=5.0, lng=6.0), LatLng(lat=5.0, lng=6.0)) == 0.0


def test_segment_exposure_inside_ring() -> None:
    start = LatLng(lat=4.8, lng=6.0)
    end = LatLng(lat=4.8, lng=8.0)
    exposure = geometry_lite.segment_circle_exposure_km(
        start, end, THREAT.position, THREAT.range_km
    )
    assert exposure > 0.0
    assert exposure < geometry_lite.distance_km(start, end)


def test_m04_route_b_intersects_and_route_c_clears() -> None:
    state = StateStore.from_seed()
    mission = state.missions["M-04"]
    base = state.bases["BASE-B"]
    assessments = {
        assessment.option.id: assessment
        for assessment in geometry_lite.assess_route_options(
            mission, THREAT, base.location
        )
    }
    assert assessments["Route C"].clears
    assert not assessments["Route B"].clears
    assert assessments["Route B"].exposure_km > 0.0
    assert assessments["Route C"].exposure_km == 0.0


def test_base_endpoints_are_stripped_for_loops() -> None:
    state = StateStore.from_seed()
    mission = state.missions["M-04"]
    base = state.bases["BASE-B"]
    option = geometry_lite.route_option_for(mission, "Route C")
    assert option is not None
    points = geometry_lite.option_clearance_points(mission, option, base.location)
    assert points[0] != base.location
    assert points[-1] != base.location
    assert all(
        geometry_lite.distance_km(point, base.location) > 1.0 for point in points
    )


def test_remaining_route_starts_at_current_waypoint() -> None:
    state = StateStore.from_seed()
    mission = state.missions["M-04"]
    mission.current_waypoint_index = 2
    remaining = geometry_lite.remaining_route_points(mission)
    assert remaining[0] == mission.route[2]
    assert len(remaining) == len(mission.route)


def test_route_option_lookup_by_id() -> None:
    state = StateStore.from_seed()
    mission = state.missions["M-04"]
    assert geometry_lite.route_option_id_for(mission) == "Route B"
    option = geometry_lite.route_option_for(mission, "Route C")
    assert option is not None and option.id == "Route C"
    assert geometry_lite.route_option_for(mission, "Route Z") is None
