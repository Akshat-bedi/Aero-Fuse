"""Decision-support models: recommendations, changes, trade-offs, decisions."""

from typing import Annotated, Any, Literal

from pydantic import AliasChoices, Field, model_validator

from app.domain.base import IsoTimestamp, WireModel
from app.domain.entities import Aircraft, Crew
from app.domain.enums import ChangeKind, RecommendationStatus, TradeoffDirection

Score100 = Annotated[float, Field(ge=0, le=100)]


class Change(WireModel):
    mission_id: str = Field(min_length=1)
    kind: ChangeKind
    before: Any = None
    after: Any = None
    note: str | None = None
    # Backward-compatibility fields carried by older mock payloads.
    type: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    from_value: Any = None
    to_value: Any = None
    description: str | None = None


class Tradeoff(WireModel):
    label: str = Field(min_length=1)
    delta: float
    unit: str = Field(min_length=1)
    direction: TradeoffDirection


class Recommendation(WireModel):
    id: str = Field(pattern=r"^REC-")
    trigger_event_id: str = Field(min_length=1)
    summary: str = Field(min_length=1)
    score: Score100
    changes: list[Change] = Field(default_factory=list)
    impacted_mission_ids: list[str] = Field(default_factory=list)
    tradeoffs: list[Tradeoff] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
    constraints_satisfied: list[str] = Field(default_factory=list)
    constraints_relaxed: list[str] = Field(default_factory=list)
    alternatives: list["Recommendation"] | None = None
    criteria_scores: dict[str, Score100] | None = None
    status: RecommendationStatus
    created_at: IsoTimestamp = Field(
        validation_alias=AliasChoices("createdAt", "timestamp"),
        serialization_alias="createdAt",
    )
    state_version: int = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    data_freshness_sec: float = Field(ge=0)
    modifications: dict[str, Any] | None = None


Recommendation.model_rebuild()


class AircraftSwapModification(WireModel):
    mission_id: str = Field(min_length=1)
    new_aircraft_id: str = Field(min_length=1)


class CrewSwapModification(WireModel):
    mission_id: str = Field(min_length=1)
    new_crew_id: str = Field(min_length=1)


class AssignmentModification(WireModel):
    """Contract-intent array entry: ``{missionId, aircraftIds?, crewIds?}``."""

    mission_id: str = Field(min_length=1)
    aircraft_ids: list[str] | None = None
    crew_ids: list[str] | None = None


class ModificationsRequest(WireModel):
    """Manual commander edits.

    The Modify UI (``RecommendationCard``) sends ``{aircraftSwap, crewSwap}``
    objects keyed by mission. The older contract intent was an array of
    ``{missionId, aircraftIds?, crewIds?}`` entries; that shape is accepted and
    preserved under ``assignments`` so nothing is lost.
    """

    aircraft_swap: AircraftSwapModification | None = None
    crew_swap: CrewSwapModification | None = None
    assignments: list[AssignmentModification] | None = None

    @model_validator(mode="before")
    @classmethod
    def _wrap_array_shape(cls, data: Any) -> Any:
        if isinstance(data, list):
            return {"assignments": data}
        return data


class DecisionRequest(WireModel):
    """Body for ``POST /api/recommendations/{id}/decision``.

    The frontend normalises past-tense verbs (``approved``/``rejected``/
    ``modified``) to ``approve``/``reject``/``modify`` before posting.
    """

    decision: Literal["approve", "reject", "modify"]
    reason: str | None = None
    modifications: ModificationsRequest | None = None
    operator: str = "demo-commander"

    @model_validator(mode="before")
    @classmethod
    def _wrap_modifications_array(cls, data: Any) -> Any:
        if isinstance(data, dict) and isinstance(data.get("modifications"), list):
            coerced = dict(data)
            coerced["modifications"] = {"assignments": data["modifications"]}
            return coerced
        return data


class ModificationValidationResult(WireModel):
    """Response for ``POST /api/recommendations/{id}/validate-modification``."""

    conflicts: list[str] = Field(default_factory=list)
    score: Score100
    tradeoffs: list[Tradeoff] = Field(default_factory=list)
    valid: bool | None = None


class EligibleResources(WireModel):
    """Response for ``GET /api/missions/{id}/eligible-resources``."""

    aircraft: list[Aircraft] = Field(default_factory=list)
    crew: list[Crew] = Field(default_factory=list)
