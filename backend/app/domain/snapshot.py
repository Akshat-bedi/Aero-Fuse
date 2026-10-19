"""Wire snapshot models: the complete canonical state over REST and WebSocket."""

from pydantic import Field

from app.domain.audit import AuditEntry
from app.domain.base import IsoTimestamp, WireModel
from app.domain.decision import Recommendation
from app.domain.entities import (
    Aircraft,
    Airspace,
    Base,
    Crew,
    MapBounds,
    Mission,
    Threat,
    WeaponStock,
    WeatherState,
)
from app.domain.events import OpsEvent
from app.domain.telemetry import Prediction


class SimState(WireModel):
    time: IsoTimestamp
    speed: float = Field(ge=0)
    paused: bool


class WireSnapshot(WireModel):
    """Complete canonical state.

    Entity collections are arrays on the wire; the frontend normalises them
    into dictionaries. ``bounds`` is emitted (world.json includes it) even
    though the frontend type omits it.
    """

    state_version: int = Field(ge=0)
    sim: SimState
    bases: list[Base] = Field(default_factory=list)
    aircraft: list[Aircraft] = Field(default_factory=list)
    crew: list[Crew] = Field(default_factory=list)
    missions: list[Mission] = Field(default_factory=list)
    airspace: list[Airspace] = Field(default_factory=list)
    threats: list[Threat] = Field(default_factory=list)
    weather: list[WeatherState] = Field(default_factory=list)
    weapon_stocks: list[WeaponStock] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    predictions: list[Prediction] = Field(default_factory=list)
    active_events: list[OpsEvent] = Field(default_factory=list)
    audit_log: list[AuditEntry] = Field(default_factory=list)
    bounds: MapBounds | None = None
