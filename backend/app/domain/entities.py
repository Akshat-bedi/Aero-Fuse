"""Canonical entity models (API_CONTRACT.md section 6).

Field optionality mirrors ``frontend/src/types/index.ts`` combined with the
runtime validators in ``frontend/src/lib/contractValidation.ts``. Parsing every
seed entity is enforced by ``tests/test_seed_parity.py``.
"""

from datetime import datetime
from typing import Literal, Self, cast

from pydantic import AliasChoices, Field, model_validator

from app.domain.base import IsoTimestamp, WireModel
from app.domain.enums import (
    AircraftStatus,
    AircraftType,
    AirspaceType,
    CrewStatus,
    MissionStatus,
    MissionType,
    Priority,
    RunwayStatus,
    Severity,
    ThreatStatus,
    ThreatType,
)

LAT_MIN, LAT_MAX = 0.0, 10.0
LNG_MIN, LNG_MAX = 0.0, 12.0

_Ring = list[list[float]]
_PolygonCoordinates = list[_Ring]
_MultiPolygonCoordinates = list[list[_Ring]]


class LatLng(WireModel):
    """Point inside the fictional Republic of Veridia map bounds."""

    lat: float = Field(ge=LAT_MIN, le=LAT_MAX)
    lng: float = Field(ge=LNG_MIN, le=LNG_MAX)


class MapBounds(WireModel):
    """Bounding box of the tactical map (lat 0-10, lng 0-12)."""

    min_lat: float = Field(ge=LAT_MIN, le=LAT_MAX)
    max_lat: float = Field(ge=LAT_MIN, le=LAT_MAX)
    min_lng: float = Field(ge=LNG_MIN, le=LNG_MAX)
    max_lng: float = Field(ge=LNG_MIN, le=LNG_MAX)

    @model_validator(mode="after")
    def _check_ordering(self) -> Self:
        if self.min_lat > self.max_lat or self.min_lng > self.max_lng:
            raise ValueError("bounds must satisfy minLat <= maxLat and minLng <= maxLng")
        return self


class RouteOption(WireModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    waypoints: list[LatLng]
    distance_km: float | None = Field(default=None, ge=0)
    risk_score: float | None = Field(default=None, ge=0, le=100)


class WeatherForecastItem(WireModel):
    time: IsoTimestamp
    severity: Severity
    visibility_km: float | None = Field(default=None, ge=0)
    wind_kts: float | None = Field(default=None, ge=0)


class WeatherState(WireModel):
    base_id: str | None = None
    region: str | None = None
    visibility_km: float = Field(ge=0)
    cloud_base_ft: float = Field(ge=0)
    wind_kts: float = Field(ge=0)
    severity: Severity
    forecast: list[WeatherForecastItem] = Field(default_factory=list)


class Base(WireModel):
    id: str = Field(pattern=r"^BASE-")
    name: str = Field(min_length=1)
    code: str | None = None
    location: LatLng
    runway_status: RunwayStatus
    weather: WeatherState
    fuel_stock_pct: float = Field(ge=0, le=100)
    shelter_capacity: int = Field(ge=0)


class WeaponLoad(WireModel):
    weapon_type: str = Field(min_length=1)
    quantity: int = Field(ge=0)
    station: int | None = None


class Aircraft(WireModel):
    id: str = Field(pattern=r"^AC-")
    tail_number: str = Field(min_length=1)
    callsign: str | None = None
    type: AircraftType
    base_id: str
    status: AircraftStatus
    fuel_pct: float = Field(ge=0, le=100)
    flight_hours_to_next_service: float = Field(ge=0)
    weapon_load: list[WeaponLoad] = Field(default_factory=list)
    position: LatLng | None = None
    heading: float | None = Field(default=None, ge=0, le=360)
    speed: float | None = Field(default=None, ge=0)
    assigned_mission_id: str | None = None


class WeaponStock(WireModel):
    base_id: str
    weapon_type: str = Field(min_length=1)
    quantity: int = Field(ge=0)


class Crew(WireModel):
    id: str = Field(pattern=r"^CR-")
    callsign: str = Field(min_length=1)
    role: str = Field(min_length=1)
    qualifications: list[str] = Field(default_factory=list)
    base_id: str
    fatigue_index: float = Field(
        ge=0,
        le=100,
        validation_alias=AliasChoices("fatigueIndex", "fatigueScore"),
        serialization_alias="fatigueIndex",
    )
    duty_hours_last24h: float = Field(
        ge=0,
        le=24,
        validation_alias=AliasChoices("dutyHoursLast24h", "dutyHours24h"),
        serialization_alias="dutyHoursLast24h",
    )
    status: CrewStatus
    rest_hours_remaining: float | None = Field(default=None, ge=0)


class MissionTarget(LatLng):
    name: str = Field(min_length=1)


class RequiredWeaponItem(WireModel):
    weapon_type: str = Field(min_length=1)
    quantity: int = Field(ge=0)


class MissionAssigned(WireModel):
    aircraft_ids: list[str] = Field(default_factory=list)
    crew_ids: list[str] = Field(default_factory=list)


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _check_ring(ring: _Ring) -> None:
    if len(ring) < 4:
        raise ValueError("polygon rings need at least 4 positions")
    if ring[0] != ring[-1]:
        raise ValueError("polygon rings must be closed (first position equals last)")
    for point in ring:
        if len(point) != 2:
            raise ValueError("polygon positions must be [lng, lat] pairs")
        lng, lat = point
        if not (LNG_MIN <= lng <= LNG_MAX) or not (LAT_MIN <= lat <= LAT_MAX):
            raise ValueError(f"polygon position {point!r} outside map bounds")


class AirspacePolygon(WireModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: _PolygonCoordinates | _MultiPolygonCoordinates

    @model_validator(mode="after")
    def _check_geometry(self) -> Self:
        if self.type == "Polygon":
            for ring in cast("_PolygonCoordinates", self.coordinates):
                _check_ring(ring)
        else:
            for polygon in cast("_MultiPolygonCoordinates", self.coordinates):
                for ring in polygon:
                    _check_ring(ring)
        return self


class Airspace(WireModel):
    id: str = Field(pattern=r"^AS-")
    name: str = Field(min_length=1)
    polygon: AirspacePolygon
    type: AirspaceType
    active_from: IsoTimestamp
    active_to: IsoTimestamp
    floor_ft: float = Field(ge=0)
    ceiling_ft: float = Field(ge=0)

    @model_validator(mode="after")
    def _check_extent(self) -> Self:
        if self.ceiling_ft < self.floor_ft:
            raise ValueError("ceilingFt must be greater than or equal to floorFt")
        if _parse_timestamp(self.active_to) <= _parse_timestamp(self.active_from):
            raise ValueError("activeTo must be after activeFrom")
        return self


class Threat(WireModel):
    id: str = Field(pattern=r"^THR-")
    type: ThreatType
    position: LatLng
    range_km: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    last_seen: IsoTimestamp
    status: ThreatStatus


class Mission(WireModel):
    id: str = Field(pattern=r"^M-")
    name: str = Field(min_length=1)
    type: MissionType
    priority: Priority
    status: MissionStatus
    launch_base_id: str
    target: MissionTarget
    route: list[LatLng]
    route_options: list[RouteOption] | None = None
    window_start: IsoTimestamp
    window_end: IsoTimestamp
    required_aircraft_type: AircraftType
    required_crew_quals: list[str] = Field(default_factory=list)
    required_weapons: list[RequiredWeaponItem] = Field(default_factory=list)
    assigned: MissionAssigned = Field(default_factory=MissionAssigned)
    current_waypoint_index: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _check_window(self) -> Self:
        if _parse_timestamp(self.window_end) <= _parse_timestamp(self.window_start):
            raise ValueError("windowEnd must be after windowStart")
        return self
