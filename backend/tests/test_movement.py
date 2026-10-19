"""Movement coverage: aircraft follow routes, burn fuel and log hours."""

from typing import Any

from app.config import get_settings
from app.domain import AircraftStatus, MissionStatus, dump_wire
from app.runtime import SimRuntime


def _runtime() -> SimRuntime:
    return SimRuntime(get_settings())


def _airborne(runtime: SimRuntime) -> dict[str, Any]:
    return {
        aircraft_id: airframe
        for aircraft_id, airframe in runtime.store.aircraft.items()
        if airframe.status is AircraftStatus.AIRBORNE
    }


def test_baseline_has_airborne_aircraft_on_routes(runtime: SimRuntime) -> None:
    airborne = _airborne(runtime)
    assert airborne, "seed should start with in-progress sorties in the air"
    for airframe in airborne.values():
        assert airframe.position is not None
        assert airframe.assigned_mission_id is not None


def test_aircraft_move_burn_fuel_and_log_hours(runtime: SimRuntime) -> None:
    before = {
        aircraft_id: dump_wire(airframe) for aircraft_id, airframe in _airborne(runtime).items()
    }
    assert before

    for _ in range(10):
        runtime.engine.tick(1.0)

    for aircraft_id, previous in before.items():
        airframe = runtime.store.aircraft[aircraft_id]
        assert airframe.position is not None
        assert (airframe.position.lat, airframe.position.lng) != (
            previous["position"]["lat"],
            previous["position"]["lng"],
        )
        assert airframe.fuel_pct < previous["fuelPct"]
        assert airframe.flight_hours_to_next_service > previous["flightHoursToNextService"]


def test_waypoints_advance_over_time(runtime: SimRuntime) -> None:
    indices_before = {
        mission.id: mission.current_waypoint_index for mission in runtime.store.missions.values()
    }
    for _ in range(400):
        runtime.engine.tick(5.0)
    advanced = [
        mission.id
        for mission in runtime.store.missions.values()
        if mission.current_waypoint_index != indices_before[mission.id]
    ]
    assert advanced, "no mission advanced its waypoint index after 2000 sim seconds"


def test_mission_completes_and_aircraft_turns_around(runtime: SimRuntime) -> None:
    """The earliest-ending in-progress sortie should complete within 6 h."""
    in_progress = [
        mission
        for mission in runtime.store.missions.values()
        if mission.status is MissionStatus.IN_PROGRESS
    ]
    assert in_progress
    aircraft_ids = {
        aircraft_id for mission in in_progress for aircraft_id in mission.assigned.aircraft_ids
    }

    for _ in range(6 * 3600):
        runtime.engine.tick(1.0)

    completed = [
        mission
        for mission in runtime.store.missions.values()
        if mission.status is MissionStatus.COMPLETED
    ]
    assert completed, "expected at least one mission to complete over 6 sim hours"

    touched = [runtime.store.aircraft[aircraft_id] for aircraft_id in aircraft_ids]
    assert any(
        airframe.status in (AircraftStatus.TURNAROUND, AircraftStatus.SERVICEABLE)
        for airframe in touched
    ), "completed sorties should leave their airframes in turnaround or serviceable"


def test_approved_mission_launches_at_window_start(runtime: SimRuntime) -> None:
    approved = [
        mission
        for mission in runtime.store.missions.values()
        if mission.status is MissionStatus.APPROVED
    ]
    assert len(approved) == 1
    mission = approved[0]
    aircraft_id = mission.assigned.aircraft_ids[0]

    for _ in range(12 * 3600):
        if runtime.store.missions[mission.id].status is MissionStatus.IN_PROGRESS:
            break
        runtime.engine.tick(5.0)

    assert runtime.store.missions[mission.id].status is MissionStatus.IN_PROGRESS
    assert runtime.store.aircraft[aircraft_id].status is AircraftStatus.AIRBORNE
