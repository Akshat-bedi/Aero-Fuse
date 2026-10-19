"""Aircraft movement and mission lifecycle transitions.

Deterministic from the seed: no randomness, pure arithmetic on the mission
route. Every sim step:

1. launches ``approved`` missions whose window has opened (aircraft go
   ``airborne``, crew go ``on-mission``);
2. moves airborne aircraft along ``mission.route`` toward
   ``currentWaypointIndex`` at the type cruise speed;
3. completes ``in-progress`` missions whose window has closed (aircraft enter
   ``turnaround`` for 45 minutes, then return to ``serviceable``);
4. burns fuel at a per-type rate and logs flight hours.

Crew duty/fatigue accrual is intentionally NOT mutated here (deferred to the
B4 predictive stage): the frontend's 12 h duty check adds sortie duration to
``dutyHoursLast24h``, so growing that counter in the tick would break the
"baseline stays conflict-free" invariant. Documented in API_IMPLEMENTED.md.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

from app.domain import (
    Aircraft,
    AircraftStatus,
    AircraftType,
    CrewStatus,
    LatLng,
    Mission,
    MissionStatus,
    parse_timestamp,
)
from app.sim.clock import SimClock
from app.state.store import AircraftTickUpdate, StateStore

DEG_KM = 111.0
TURNAROUND_MINUTES = 45.0
KTS_TO_KMH = 1.852

# Wire convention: aircraft speed is knots (seed: Fighter 420, Transport 310).
# These cruise speeds are the km/h source of truth used for movement maths.
CRUISE_SPEED_KMH: dict[AircraftType, float] = {
    AircraftType.FIGHTER_A: 900.0,
    AircraftType.STRIKE_B: 850.0,
    AircraftType.TRANSPORT_C: 520.0,
    AircraftType.RECON_D: 700.0,
    AircraftType.HELICOPTER_E: 260.0,
}

CRUISE_SPEED_KTS: dict[AircraftType, float] = {
    aircraft_type: round(kmh / KTS_TO_KMH) for aircraft_type, kmh in CRUISE_SPEED_KMH.items()
}
DEFAULT_CRUISE_KTS = round(600.0 / KTS_TO_KMH)

FUEL_BURN_PCT_PER_HOUR: dict[AircraftType, float] = {
    AircraftType.FIGHTER_A: 11.0,
    AircraftType.STRIKE_B: 10.0,
    AircraftType.TRANSPORT_C: 6.0,
    AircraftType.RECON_D: 8.0,
    AircraftType.HELICOPTER_E: 9.0,
}


@dataclass(frozen=True)
class PositionUpdate:
    """Airborne aircraft state broadcast via ``POSITION_TICK``."""

    aircraft_id: str
    position: LatLng
    heading: float
    speed: float
    fuel_pct: float


class MovementSim:
    """Deterministic movement + lifecycle engine for the live plan."""

    def __init__(self, store: StateStore, clock: SimClock) -> None:
        self.store = store
        self.clock = clock
        self._turnaround_remaining_min: dict[str, float] = {}

    def reset(self) -> None:
        self._turnaround_remaining_min.clear()

    def step(self, dt_seconds: float) -> list[PositionUpdate]:
        """Advance the world by ``dt_seconds`` of sim time."""
        if dt_seconds <= 0:
            return self.airborne_updates()

        changed: dict[str, list[str]] = {}
        now = parse_timestamp(self.clock.now())

        launched = self._launch_due_missions(now)
        changed = _merge(
            changed, missions=launched.missions, aircraft=launched.aircraft, crew=launched.crew
        )

        self._move_airborne(dt_seconds)

        completed = self._complete_due_missions(now)
        changed = _merge(
            changed, missions=completed.missions, aircraft=completed.aircraft, crew=completed.crew
        )

        serviced = self._advance_turnarounds(dt_seconds)
        changed = _merge(changed, aircraft=serviced)

        if any(changed.values()):
            self.store.commit_entities(changed)

        return self.airborne_updates()

    def airborne_updates(self) -> list[PositionUpdate]:
        updates: list[PositionUpdate] = []
        for airframe in self.store.aircraft.values():
            if airframe.status is not AircraftStatus.AIRBORNE or airframe.position is None:
                continue
            updates.append(
                PositionUpdate(
                    aircraft_id=airframe.id,
                    position=airframe.position,
                    heading=airframe.heading or 0.0,
                    speed=airframe.speed or 0.0,
                    fuel_pct=airframe.fuel_pct,
                )
            )
        return updates

    # ------------------------------------------------------------- behaviour

    def _launch_due_missions(self, now: datetime) -> _Changed:
        result = _Changed()
        for mission in self.store.missions.values():
            if mission.status is not MissionStatus.APPROVED:
                continue
            if parse_timestamp(mission.window_start) > now:
                continue
            mission.status = MissionStatus.IN_PROGRESS
            result.missions.append(mission.id)
            if mission.current_waypoint_index is None:
                mission.current_waypoint_index = 0
            base = self.store.bases.get(mission.launch_base_id)
            for aircraft_id in mission.assigned.aircraft_ids:
                airframe = self.store.aircraft.get(aircraft_id)
                if airframe is None or airframe.status is not AircraftStatus.SERVICEABLE:
                    continue
                if base is not None:
                    airframe.position = LatLng(lat=base.location.lat, lng=base.location.lng)
                airframe.status = AircraftStatus.AIRBORNE
                airframe.speed = CRUISE_SPEED_KTS.get(airframe.type, DEFAULT_CRUISE_KTS)
                self._face_next_waypoint(airframe, mission)
                result.aircraft.append(aircraft_id)
            for crew_id in mission.assigned.crew_ids:
                member = self.store.crew.get(crew_id)
                if member is None or member.status is not CrewStatus.AVAILABLE:
                    continue
                member.status = CrewStatus.ON_MISSION
                result.crew.append(crew_id)
        return result

    def _move_airborne(self, dt_seconds: float) -> None:
        updates: list[AircraftTickUpdate] = []
        for airframe in self.store.aircraft.values():
            if airframe.status is not AircraftStatus.AIRBORNE:
                continue
            mission = (
                self.store.missions.get(airframe.assigned_mission_id)
                if airframe.assigned_mission_id
                else None
            )
            if (
                mission is None
                or not mission.route
                or mission.status is not MissionStatus.IN_PROGRESS
            ):
                continue
            position = airframe.position or LatLng(lat=0.0, lng=0.0)
            speed_kts = airframe.speed or CRUISE_SPEED_KTS.get(airframe.type, DEFAULT_CRUISE_KTS)
            ground_kmh = speed_kts * KTS_TO_KMH
            step_deg = ground_kmh * dt_seconds / 3600.0 / DEG_KM

            index = mission.current_waypoint_index or 0
            target = mission.route[index % len(mission.route)]
            d_lat = target.lat - position.lat
            d_lng = target.lng - position.lng
            distance = math.hypot(d_lat, d_lng)

            if distance <= step_deg:
                mission.current_waypoint_index = (index + 1) % len(mission.route)
                new_position = LatLng(lat=target.lat, lng=target.lng)
            else:
                new_position = LatLng(
                    lat=position.lat + d_lat / distance * step_deg,
                    lng=position.lng + d_lng / distance * step_deg,
                )
                airframe.heading = _heading_deg(d_lng, d_lat)

            burn = FUEL_BURN_PCT_PER_HOUR.get(airframe.type, 8.0) * dt_seconds / 3600.0
            updates.append(
                AircraftTickUpdate(
                    aircraft_id=airframe.id,
                    position=new_position,
                    heading=airframe.heading or 0.0,
                    speed=speed_kts,
                    fuel_pct=max(0.0, round(airframe.fuel_pct - burn, 4)),
                    flight_hours_to_next_service=round(
                        airframe.flight_hours_to_next_service + dt_seconds / 3600.0, 4
                    ),
                )
            )
        self.store.apply_aircraft_tick(updates)

    def _complete_due_missions(self, now: datetime) -> _Changed:
        result = _Changed()
        for mission in self.store.missions.values():
            if mission.status is not MissionStatus.IN_PROGRESS:
                continue
            if parse_timestamp(mission.window_end) > now:
                continue
            mission.status = MissionStatus.COMPLETED
            result.missions.append(mission.id)
            base = self.store.bases.get(mission.launch_base_id)
            for aircraft_id in mission.assigned.aircraft_ids:
                airframe = self.store.aircraft.get(aircraft_id)
                if airframe is None or airframe.status is not AircraftStatus.AIRBORNE:
                    continue
                airframe.status = AircraftStatus.TURNAROUND
                airframe.speed = 0.0
                if base is not None:
                    airframe.position = LatLng(lat=base.location.lat, lng=base.location.lng)
                self._turnaround_remaining_min[aircraft_id] = TURNAROUND_MINUTES
                result.aircraft.append(aircraft_id)
            for crew_id in mission.assigned.crew_ids:
                member = self.store.crew.get(crew_id)
                if member is None or member.status is not CrewStatus.ON_MISSION:
                    continue
                member.status = CrewStatus.AVAILABLE
                result.crew.append(crew_id)
        return result

    def _advance_turnarounds(self, dt_seconds: float) -> list[str]:
        serviced: list[str] = []
        for aircraft_id in list(self._turnaround_remaining_min):
            remaining = self._turnaround_remaining_min[aircraft_id] - dt_seconds / 60.0
            if remaining > 0:
                self._turnaround_remaining_min[aircraft_id] = remaining
                continue
            del self._turnaround_remaining_min[aircraft_id]
            airframe = self.store.aircraft.get(aircraft_id)
            if airframe is not None and airframe.status is AircraftStatus.TURNAROUND:
                airframe.status = AircraftStatus.SERVICEABLE
                serviced.append(aircraft_id)
        return serviced

    def _face_next_waypoint(self, airframe: Aircraft, mission: Mission) -> None:
        if not mission.route:
            return
        index = mission.current_waypoint_index or 0
        target = mission.route[index % len(mission.route)]
        position = airframe.position
        if position is None:
            return
        airframe.heading = _heading_deg(target.lng - position.lng, target.lat - position.lat)


class _Changed:
    """Mutable per-step change accumulator (bumped once per store commit)."""

    def __init__(self) -> None:
        self.missions: list[str] = []
        self.aircraft: list[str] = []
        self.crew: list[str] = []


def _merge(changed: dict[str, list[str]], **additions: list[str]) -> dict[str, list[str]]:
    for key, ids in additions.items():
        if ids:
            changed.setdefault(key, []).extend(ids)
    return changed


def _heading_deg(d_lng: float, d_lat: float) -> float:
    if d_lng == 0.0 and d_lat == 0.0:
        return 0.0
    return round(math.degrees(math.atan2(d_lng, d_lat)) % 360.0, 1)
