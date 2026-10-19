"""Telemetry models: predictions, alerts, impact analysis and retask progress."""

from pydantic import Field

from app.domain.base import IsoTimestamp, WireModel
from app.domain.enums import AlertSeverity, AlertType, EventType, RetaskStage


class Prediction(WireModel):
    entity_type: str = Field(min_length=1)
    entity_id: str = Field(min_length=1)
    metric: str = Field(min_length=1)
    value: float
    confidence: float = Field(ge=0, le=1)
    horizon_minutes: float = Field(ge=0)
    created_at: IsoTimestamp
    message: str = Field(min_length=1)


class OperationalAlert(WireModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    message: str = Field(min_length=1)
    severity: AlertSeverity
    type: AlertType
    timestamp: IsoTimestamp
    acknowledged: bool = False
    entity_id: str | None = None
    location: str | None = None
    details: str | None = None
    category: str | None = None


class ImpactAnalysis(WireModel):
    """Payload of the ``IMPACT_ANALYSIS`` WebSocket message.

    ``eventId``/``eventType`` are part of the frontend type but not the
    contract's payload sketch; both are emitted, both are optional on parse.
    """

    event_id: str | None = None
    event_type: EventType | None = None
    impacted_mission_ids: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    time_to_decision_min: float = Field(ge=0)


class RetaskProgress(WireModel):
    """Payload of the ``RETASK_PROGRESS`` WebSocket message."""

    is_replan_active: bool
    stage: RetaskStage | None = None
    elapsed_ms: float = Field(ge=0)
    message: str = ""
