"""Canonical in-memory state store (single writer, versioned, copy-on-write).

The store is the backend's only source of truth for the live plan. It is
loaded from the seed (``stateVersion`` starts at the seed's version), keyed by
entity id and guarded by one re-entrant lock (single-writer pattern).

``stateVersion`` rules (see B2 notes and ``frontend/src/services/liveDataService.ts``):

- any change broadcast as ``ENTITY_UPDATE``/``EVENT_INJECTED`` bumps the
  version by exactly 1 and the message carries the new version;
- tick deltas (positions, fuel, flight hours) never bump and are broadcast via
  ``POSITION_TICK`` instead;
- reset restores the seed, keeps the audit log and bumps once so clients
  resync with a fresh ``SNAPSHOT``.

``clone(sim)`` deep-copies the whole state for what-if scenarios (B7) so
experiments never touch the live plan.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Literal

from app.domain import (
    Aircraft,
    AircraftStatus,
    AircraftUnserviceablePayload,
    Airspace,
    AuditEntry,
    Base,
    BaseClosedPayload,
    Crew,
    CrewStatus,
    CrewUnavailablePayload,
    LatLng,
    MapBounds,
    Mission,
    MissionAssigned,
    MissionStatus,
    MissionTarget,
    NewPriorityMissionPayload,
    OpsEvent,
    Prediction,
    Recommendation,
    SimState,
    Threat,
    ThreatDetectedPayload,
    WeaponStock,
    WeatherDegradedPayload,
    WeatherState,
    WireSnapshot,
    dump_wire,
    parse_timestamp,
    to_iso_z,
)
from app.state.seed import load_seed

DEFAULT_THREAT_CONFIDENCE = 0.9
DEFAULT_NEW_MISSION_HOURS = 3.0

ChangeKind = Literal["entities", "event", "reset"]


@dataclass(frozen=True)
class StateChange:
    """Notification emitted after a version-bumping mutation."""

    version: int
    kind: ChangeKind
    changed: dict[str, list[str]] = field(default_factory=dict)
    event: OpsEvent | None = None


@dataclass(frozen=True)
class AircraftTickUpdate:
    """Per-tick aircraft deltas (never bump ``stateVersion``)."""

    aircraft_id: str
    position: LatLng
    heading: float
    speed: float
    fuel_pct: float
    flight_hours_to_next_service: float


class UnknownEntityError(LookupError):
    """Referenced entity does not exist (maps to a 404 problem response)."""

    def __init__(self, entity_type: str, entity_id: str) -> None:
        super().__init__(f"unknown {entity_type}: {entity_id}")
        self.entity_type = entity_type
        self.entity_id = entity_id


class StateStore:
    """Versioned canonical state with entity-diff notifications."""

    def __init__(self, snapshot: WireSnapshot) -> None:
        self._lock = threading.RLock()
        self._listeners: list[Callable[[StateChange], None]] = []
        self.bases: dict[str, Base] = {}
        self.aircraft: dict[str, Aircraft] = {}
        self.crew: dict[str, Crew] = {}
        self.missions: dict[str, Mission] = {}
        self.airspace: dict[str, Airspace] = {}
        self.threats: dict[str, Threat] = {}
        self.weather: dict[str, WeatherState] = {}
        self.weapon_stocks: list[WeaponStock] = []
        self.recommendations: dict[str, Recommendation] = {}
        self.predictions: list[Prediction] = []
        self.active_events: list[OpsEvent] = []
        self.audit_log: list[AuditEntry] = []
        self.bounds: MapBounds | None = None
        self.version = 0
        self._load(snapshot)

    @classmethod
    def from_seed(cls, path: str | None = None) -> StateStore:
        """Build the store from the authoritative seed file."""
        return cls(load_seed(path))

    # ------------------------------------------------------------------ load

    def _load(self, snapshot: WireSnapshot) -> None:
        self.bases = {item.id: item for item in snapshot.bases}
        self.aircraft = {item.id: item for item in snapshot.aircraft}
        self.crew = {item.id: item for item in snapshot.crew}
        self.missions = {item.id: item for item in snapshot.missions}
        self.airspace = {item.id: item for item in snapshot.airspace}
        self.threats = {item.id: item for item in snapshot.threats}
        self.weather = {
            _weather_key(item, index): item for index, item in enumerate(snapshot.weather)
        }
        self.weapon_stocks = list(snapshot.weapon_stocks)
        self.recommendations = {item.id: item for item in snapshot.recommendations}
        self.predictions = list(snapshot.predictions)
        self.active_events = list(snapshot.active_events)
        self.audit_log = list(snapshot.audit_log)
        self.bounds = snapshot.bounds
        self.version = snapshot.state_version

    def reset(self, snapshot: WireSnapshot) -> StateChange:
        """Restore the seed, keep the audit log, bump once so clients resync."""
        with self._lock:
            audit = list(self.audit_log)
            previous_version = self.version
            self._load(snapshot)
            self.audit_log = audit
            self.version = max(previous_version, snapshot.state_version) + 1
            change = StateChange(version=self.version, kind="reset")
            self._notify(change)
            return change

    def clone(self, sim: SimState) -> StateStore:
        """Deep copy of the full state for scenario experiments (copy-on-write)."""
        with self._lock:
            snapshot = self.wire_snapshot(sim).model_copy(deep=True)
            clone = StateStore(snapshot)
            return clone

    def copy(self) -> StateStore:
        """Deep copy of the canonical state for pure plan evaluation.

        The embedded ``sim`` block of the copy is irrelevant: retask code never
        reads it. Subscribers and locks are not shared with the copy.
        """
        with self._lock:
            template = SimState(time="1970-01-01T00:00:00.000Z", speed=1, paused=True)
            snapshot = self.wire_snapshot(template).model_copy(deep=True)
            return StateStore(snapshot)

    # -------------------------------------------------------------- read side

    def wire_snapshot(self, sim: SimState) -> WireSnapshot:
        """Build the wire snapshot; entity order follows the seed/insertion order."""
        with self._lock:
            return WireSnapshot(
                state_version=self.version,
                sim=sim,
                bases=list(self.bases.values()),
                aircraft=list(self.aircraft.values()),
                crew=list(self.crew.values()),
                missions=list(self.missions.values()),
                airspace=list(self.airspace.values()),
                threats=list(self.threats.values()),
                weather=list(self.weather.values()),
                weapon_stocks=list(self.weapon_stocks),
                recommendations=list(self.recommendations.values()),
                predictions=list(self.predictions),
                active_events=list(self.active_events),
                audit_log=list(self.audit_log),
                bounds=self.bounds,
            )

    def entities_wire(self, changed: dict[str, list[str]]) -> dict[str, list[dict[str, Any]]]:
        """Wire payload for an ``ENTITY_UPDATE`` from a changed-ids diff."""
        with self._lock:
            payload: dict[str, list[dict[str, Any]]] = {}
            for kind, ids in changed.items():
                if kind == "bases":
                    items = [dump_wire(self.bases[i]) for i in ids if i in self.bases]
                elif kind == "aircraft":
                    items = [dump_wire(self.aircraft[i]) for i in ids if i in self.aircraft]
                elif kind == "crew":
                    items = [dump_wire(self.crew[i]) for i in ids if i in self.crew]
                elif kind == "missions":
                    items = [dump_wire(self.missions[i]) for i in ids if i in self.missions]
                elif kind == "airspace":
                    items = [dump_wire(self.airspace[i]) for i in ids if i in self.airspace]
                elif kind == "threats":
                    items = [dump_wire(self.threats[i]) for i in ids if i in self.threats]
                elif kind == "weather":
                    items = [dump_wire(self.weather[i]) for i in ids if i in self.weather]
                else:
                    items = []
                if items:
                    payload[kind] = items
            return payload

    def next_event_id(self) -> str:
        """Next free ``EV-nnnn`` id (continues after any events already recorded)."""
        with self._lock:
            known = {event.id: event for event in self.active_events}
            return _next_id("EV-", known, width=4)

    def next_recommendation_id(self) -> str:
        """Next free ``REC-nnnn`` id (alternative ids share the primary prefix)."""
        with self._lock:
            return _next_id("REC-", self.recommendations, width=4)

    # ------------------------------------------------------------- write side

    def subscribe(self, listener: Callable[[StateChange], None]) -> Callable[[], None]:
        """Register a change listener; returns an unsubscribe callable."""
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def commit_entities(self, changed: dict[str, list[str]]) -> StateChange | None:
        """Bump the version once for a batch of entity changes (ENTITY_UPDATE)."""
        with self._lock:
            if not any(changed.values()):
                return None
            return self._commit(changed, kind="entities")

    def apply_aircraft_tick(self, updates: Iterable[AircraftTickUpdate]) -> None:
        """Apply tick deltas without bumping the version (POSITION_TICK)."""
        with self._lock:
            for update in updates:
                aircraft = self.aircraft.get(update.aircraft_id)
                if aircraft is None:
                    continue
                aircraft.position = update.position
                aircraft.heading = update.heading
                aircraft.speed = update.speed
                aircraft.fuel_pct = update.fuel_pct
                aircraft.flight_hours_to_next_service = update.flight_hours_to_next_service

    def apply_event(self, event: OpsEvent) -> StateChange:
        """Apply an event's factual effect and bump the version exactly once.

        No recommendation, impact analysis or risk marking happens here — that
        is B6a/B6b. Raises ``UnknownEntityError`` when a referenced entity is
        missing (caller maps it to a 404 problem response).
        """
        with self._lock:
            payload = event.payload
            changed: dict[str, list[str]] = {}

            if isinstance(payload, ThreatDetectedPayload):
                threat_id = _next_id("THR-", self.threats, width=2)
                self.threats[threat_id] = Threat(
                    id=threat_id,
                    type=payload.threat_type,
                    position=payload.position,
                    range_km=payload.range_km,
                    confidence=(
                        payload.confidence
                        if payload.confidence is not None
                        else DEFAULT_THREAT_CONFIDENCE
                    ),
                    last_seen=event.timestamp,
                    status=payload.status,
                )
                changed["threats"] = [threat_id]

            elif isinstance(payload, AircraftUnserviceablePayload):
                aircraft = self._require(self.aircraft, payload.aircraft_id, "aircraft")
                aircraft.status = AircraftStatus.UNSERVICEABLE
                changed["aircraft"] = [payload.aircraft_id]

            elif isinstance(payload, BaseClosedPayload):
                base = self._require(self.bases, payload.base_id, "base")
                base.runway_status = payload.runway_status
                changed["bases"] = [payload.base_id]

            elif isinstance(payload, WeatherDegradedPayload):
                weather = self._find_weather(payload.base_id, payload.region)
                if weather is None:
                    raise UnknownEntityError(
                        "weather",
                        payload.base_id or payload.region or "<unspecified>",
                    )
                weather.severity = payload.severity
                if payload.visibility_km is not None:
                    weather.visibility_km = payload.visibility_km
                if payload.wind_kts is not None:
                    weather.wind_kts = payload.wind_kts
                changed["weather"] = [_weather_key(weather, 0)]

            elif isinstance(payload, CrewUnavailablePayload):
                member = self._require(self.crew, payload.crew_id, "crew")
                member.status = CrewStatus.UNAVAILABLE
                changed["crew"] = [payload.crew_id]

            elif isinstance(payload, NewPriorityMissionPayload):
                base = self._require(self.bases, payload.launch_base_id, "base")
                duration_hours = (
                    payload.duration_hours
                    if payload.duration_hours is not None
                    else DEFAULT_NEW_MISSION_HOURS
                )
                start = parse_timestamp(event.timestamp)
                mission_id = _next_id("M-", self.missions, width=2)
                target = MissionTarget(
                    lat=payload.target_coordinates.lat,
                    lng=payload.target_coordinates.lng,
                    name=f"{payload.name} Target",
                )
                self.missions[mission_id] = Mission(
                    id=mission_id,
                    name=payload.name,
                    type=payload.type,
                    priority=payload.priority,
                    status=MissionStatus.PLANNED,
                    launch_base_id=payload.launch_base_id,
                    target=target,
                    route=[base.location, LatLng(lat=target.lat, lng=target.lng)],
                    window_start=event.timestamp,
                    window_end=to_iso_z(start + timedelta(hours=duration_hours)),
                    required_aircraft_type=payload.required_aircraft_type,
                    required_crew_quals=[],
                    required_weapons=[],
                    assigned=MissionAssigned(),
                )
                changed["missions"] = [mission_id]

            self.active_events.append(event)
            return self._commit(changed, kind="event", event=event)

    # ------------------------------------------------------------- internals

    @staticmethod
    def _require(collection: dict[str, Any], entity_id: str, entity_type: str) -> Any:
        try:
            return collection[entity_id]
        except KeyError as exc:
            raise UnknownEntityError(entity_type, entity_id) from exc

    def _find_weather(self, base_id: str | None, region: str | None) -> WeatherState | None:
        if base_id is not None and base_id in self.weather:
            return self.weather[base_id]
        for weather in self.weather.values():
            if base_id is not None and weather.base_id == base_id:
                return weather
            if region is not None and weather.region == region:
                return weather
        return None

    def _commit(
        self,
        changed: dict[str, list[str]],
        *,
        kind: ChangeKind,
        event: OpsEvent | None = None,
    ) -> StateChange:
        self.version += 1
        change = StateChange(version=self.version, kind=kind, changed=changed, event=event)
        self._notify(change)
        return change

    def _notify(self, change: StateChange) -> None:
        for listener in list(self._listeners):
            listener(change)


def _weather_key(weather: WeatherState, index: int) -> str:
    if weather.base_id:
        return weather.base_id
    if weather.region:
        return weather.region
    return f"W-{index:02d}"


def _next_id(prefix: str, collection: dict[str, Any], *, width: int) -> str:
    highest = 0
    for entity_id in collection:
        if not entity_id.startswith(prefix):
            continue
        suffix = entity_id[len(prefix) :]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return f"{prefix}{highest + 1:0{width}d}"
