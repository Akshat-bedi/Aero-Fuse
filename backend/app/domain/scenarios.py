"""What-if scenario models (API_CONTRACT.md section 6.14)."""

from typing import Literal

from pydantic import ConfigDict, Field

from app.domain.base import IsoTimestamp, WireModel
from app.domain.decision import Recommendation
from app.domain.enums import AircraftType, Severity
from app.domain.events import OpsEventRequest

ThreatLevel = Literal["low", "medium", "high", "critical"]


class ScenarioAircraftLoss(WireModel):
    type: AircraftType | None = None
    base_id: str | None = None
    count: int = Field(ge=0)


class ScenarioBaseOutage(WireModel):
    base_id: str = Field(min_length=1)
    hours: float = Field(ge=0)


class ScenarioParams(WireModel):
    name: str | None = None
    description: str | None = None
    aircraft_loss: list[ScenarioAircraftLoss] | None = None
    base_outage: ScenarioBaseOutage | None = None
    crew_availability_reduction_pct: float | None = Field(default=None, ge=0, le=100)
    weather_severity: Severity | None = None
    surge_missions: int | None = Field(default=None, ge=0, le=8)
    threat_level: ThreatLevel | float | None = None
    horizon_hours: float | None = Field(default=None, ge=0)
    injected_events: list[OpsEventRequest] | None = None
    duration_minutes: float | None = Field(default=None, ge=0)


class ScenarioKpis(WireModel):
    """Scenario KPI block; extra keys are tolerated for forward compatibility."""

    model_config = ConfigDict(extra="allow")

    missions_fulfilled_pct: float
    p1_coverage_pct: float
    avg_delay_min: float
    aircraft_utilisation_pct: float
    crew_fatigue_mean: float
    crew_fatigue_max: float
    fuel_consumption_pct: float
    weapons_consumption_pct: float


class ScenarioUnmetMission(WireModel):
    mission_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class ScenarioFailurePoint(WireModel):
    time: str = Field(min_length=1)
    cause: str = Field(min_length=1)
    description: str = Field(min_length=1)


class ScenarioUtilisationSeries(WireModel):
    time: list[str] = Field(default_factory=list)
    baseline: list[float] = Field(default_factory=list)
    scenario: list[float] = Field(default_factory=list)


class ScenarioResult(WireModel):
    id: str = Field(pattern=r"^SCEN-")
    scenario_id: str | None = None
    name: str = Field(min_length=1)
    created_at: IsoTimestamp
    baseline_kpis: ScenarioKpis
    scenario_kpis: ScenarioKpis
    series: ScenarioUtilisationSeries
    first_failure: ScenarioFailurePoint | None = None
    unmet_missions: list[ScenarioUnmetMission] = Field(default_factory=list)
    capped: bool | None = None
    params: ScenarioParams | None = None
    generated_recommendations: list[Recommendation] | None = None
    impacted_mission_ids: list[str] | None = None
    success_probability: float | None = Field(default=None, ge=0, le=1)
