"""Operational event models with typed payloads (API_CONTRACT.md section 6.9).

Verified injector shapes (frontend, live mode):

- ``ScenarioControlPanel`` sends ``{threatType, position, rangeKm, confidence}``
  for ``THREAT_DETECTED`` and full payloads for the other five types.
- ``DebugDataPage`` omits ``confidence`` on ``THREAT_DETECTED`` and omits
  ``runwayStatus``/``durationHours`` on ``BASE_CLOSED``; those fields
  therefore default (closure implies ``closed``).
- ``NEW_PRIORITY_MISSION`` is flat (name, type, priority, launchBaseId,
  targetCoordinates, requiredAircraftType), not wrapped in ``mission`` as the
  older contract draft suggested.
"""

from typing import Annotated, Any

from pydantic import AliasChoices, BeforeValidator, Field, model_validator

from app.domain.base import IsoTimestamp, WireModel
from app.domain.entities import LatLng
from app.domain.enums import (
    AircraftType,
    AlertSeverity,
    EventType,
    MissionType,
    Priority,
    RunwayStatus,
    Severity,
    ThreatStatus,
    ThreatType,
)

_THREAT_TYPE_BY_ALIAS: dict[str, ThreatType] = {
    "sam": ThreatType.SAM,
    "fighter": ThreatType.FIGHTER,
    "radar": ThreatType.RADAR,
    "aaa": ThreatType.AAA,
    # Q1: the frontend injector offers EW; the backend treats it as a radar emitter.
    "ew": ThreatType.RADAR,
}


def normalize_threat_type(value: Any) -> ThreatType:
    """Map wire threat-type spellings onto the canonical enum (EW -> radar)."""
    if isinstance(value, ThreatType):
        return value
    if isinstance(value, str):
        canonical = _THREAT_TYPE_BY_ALIAS.get(value.strip().lower())
        if canonical is not None:
            return canonical
    raise ValueError(f"unknown threat type: {value!r} (expected SAM, Fighter, Radar, EW or AAA)")


NormalizedThreatType = Annotated[ThreatType, BeforeValidator(normalize_threat_type)]


class ThreatDetectedPayload(WireModel):
    threat_type: NormalizedThreatType = Field(
        validation_alias=AliasChoices("threatType", "type"),
        serialization_alias="threatType",
    )
    position: LatLng
    range_km: float = Field(ge=0)
    confidence: float | None = Field(default=None, ge=0, le=1)
    status: ThreatStatus = ThreatStatus.ACTIVE


class AircraftUnserviceablePayload(WireModel):
    aircraft_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    etr_hours: float | None = Field(default=None, ge=0)


class BaseClosedPayload(WireModel):
    base_id: str = Field(min_length=1)
    runway_status: RunwayStatus = RunwayStatus.CLOSED
    duration_hours: float | None = Field(default=None, ge=0)


class WeatherDegradedPayload(WireModel):
    base_id: str | None = None
    region: str | None = None
    severity: Severity
    visibility_km: float | None = Field(default=None, ge=0)
    wind_kts: float | None = Field(default=None, ge=0)
    duration_hours: float | None = Field(default=None, ge=0)


class NewPriorityMissionPayload(WireModel):
    """Flat shape the injector UI sends (not wrapped in ``mission``)."""

    name: str = Field(min_length=1)
    type: MissionType
    priority: Priority
    launch_base_id: str = Field(min_length=1)
    target_coordinates: LatLng
    required_aircraft_type: AircraftType
    duration_hours: float | None = Field(default=None, gt=0)


class CrewUnavailablePayload(WireModel):
    crew_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)


EventPayload = (
    ThreatDetectedPayload
    | AircraftUnserviceablePayload
    | BaseClosedPayload
    | WeatherDegradedPayload
    | NewPriorityMissionPayload
    | CrewUnavailablePayload
)

_EVENT_PAYLOAD_BY_TYPE: dict[EventType, type[WireModel]] = {
    EventType.THREAT_DETECTED: ThreatDetectedPayload,
    EventType.AIRCRAFT_UNSERVICEABLE: AircraftUnserviceablePayload,
    EventType.BASE_CLOSED: BaseClosedPayload,
    EventType.WEATHER_DEGRADED: WeatherDegradedPayload,
    EventType.NEW_PRIORITY_MISSION: NewPriorityMissionPayload,
    EventType.CREW_UNAVAILABLE: CrewUnavailablePayload,
}


def parse_event_payload(event_type: str, payload: dict[str, Any]) -> WireModel:
    """Validate a raw payload against the model for ``event_type``.

    Raises ``KeyError`` for unknown event types and ``ValidationError`` for
    payloads that do not match the contracted shape.
    """
    try:
        event = EventType(event_type.strip().upper())
    except ValueError as exc:
        raise KeyError(f"unknown event type: {event_type!r}") from exc
    return _EVENT_PAYLOAD_BY_TYPE[event].model_validate(payload)


def _coerce_typed_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    raw_type = data.get("type")
    raw_payload = data.get("payload")
    if not isinstance(raw_payload, dict) or not isinstance(raw_type, str):
        return data
    try:
        payload_cls = _EVENT_PAYLOAD_BY_TYPE[EventType(raw_type.strip().upper())]
    except ValueError:
        return data
    coerced = dict(data)
    coerced["payload"] = payload_cls.model_validate(raw_payload)
    return coerced


class _OpsEventBase(WireModel):
    type: EventType
    payload: EventPayload
    severity: AlertSeverity | None = None
    operator: str | None = None
    description: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _bind_payload_model(cls, data: Any) -> Any:
        return _coerce_typed_payload(data)


class OpsEvent(_OpsEventBase):
    """Registered contingency event (id and timestamp assigned by the backend)."""

    id: str = Field(pattern=r"^EV-")
    timestamp: IsoTimestamp


class OpsEventRequest(_OpsEventBase):
    """Request body for ``POST /api/events`` (id and timestamp filled server-side)."""
