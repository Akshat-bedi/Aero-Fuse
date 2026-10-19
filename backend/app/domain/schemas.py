"""Export JSON Schemas for the wire domain models.

Usage:
    python -m app.domain.schemas [output_dir]

Defaults to ``backend/docs/schemas``. Schemas are generated from the same
Pydantic models the API validates with, so they cannot drift from the code.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pydantic import BaseModel

from app.domain.audit import AuditEntry
from app.domain.decision import (
    AircraftSwapModification,
    AssignmentModification,
    Change,
    CrewSwapModification,
    DecisionRequest,
    EligibleResources,
    ModificationsRequest,
    ModificationValidationResult,
    Recommendation,
    Tradeoff,
)
from app.domain.entities import (
    Aircraft,
    Airspace,
    AirspacePolygon,
    Base,
    Crew,
    LatLng,
    MapBounds,
    Mission,
    MissionAssigned,
    MissionTarget,
    RequiredWeaponItem,
    RouteOption,
    Threat,
    WeaponLoad,
    WeaponStock,
    WeatherForecastItem,
    WeatherState,
)
from app.domain.events import (
    AircraftUnserviceablePayload,
    BaseClosedPayload,
    CrewUnavailablePayload,
    NewPriorityMissionPayload,
    OpsEvent,
    OpsEventRequest,
    ThreatDetectedPayload,
    WeatherDegradedPayload,
)
from app.domain.scenarios import (
    ScenarioAircraftLoss,
    ScenarioBaseOutage,
    ScenarioFailurePoint,
    ScenarioKpis,
    ScenarioParams,
    ScenarioResult,
    ScenarioUnmetMission,
    ScenarioUtilisationSeries,
)
from app.domain.snapshot import SimState, WireSnapshot
from app.domain.telemetry import (
    ClockTickPayload,
    ImpactAnalysis,
    OperationalAlert,
    PositionTickItem,
    Prediction,
    RetaskProgress,
)

SCHEMA_MODELS: dict[str, type[BaseModel]] = {
    # Entities
    "lat_lng": LatLng,
    "map_bounds": MapBounds,
    "base": Base,
    "aircraft": Aircraft,
    "weapon_load": WeaponLoad,
    "weapon_stock": WeaponStock,
    "crew": Crew,
    "route_option": RouteOption,
    "mission_target": MissionTarget,
    "required_weapon_item": RequiredWeaponItem,
    "mission_assigned": MissionAssigned,
    "mission": Mission,
    "airspace_polygon": AirspacePolygon,
    "airspace": Airspace,
    "threat": Threat,
    "weather_forecast_item": WeatherForecastItem,
    "weather_state": WeatherState,
    # Events
    "ops_event": OpsEvent,
    "ops_event_request": OpsEventRequest,
    "threat_detected_payload": ThreatDetectedPayload,
    "aircraft_unserviceable_payload": AircraftUnserviceablePayload,
    "base_closed_payload": BaseClosedPayload,
    "weather_degraded_payload": WeatherDegradedPayload,
    "new_priority_mission_payload": NewPriorityMissionPayload,
    "crew_unavailable_payload": CrewUnavailablePayload,
    # Decision support
    "change": Change,
    "tradeoff": Tradeoff,
    "recommendation": Recommendation,
    "aircraft_swap_modification": AircraftSwapModification,
    "crew_swap_modification": CrewSwapModification,
    "assignment_modification": AssignmentModification,
    "modifications_request": ModificationsRequest,
    "decision_request": DecisionRequest,
    "modification_validation_result": ModificationValidationResult,
    "eligible_resources": EligibleResources,
    # Telemetry
    "prediction": Prediction,
    "operational_alert": OperationalAlert,
    "impact_analysis": ImpactAnalysis,
    "retask_progress": RetaskProgress,
    "clock_tick_payload": ClockTickPayload,
    "position_tick_item": PositionTickItem,
    # Audit
    "audit_entry": AuditEntry,
    # Scenarios
    "scenario_aircraft_loss": ScenarioAircraftLoss,
    "scenario_base_outage": ScenarioBaseOutage,
    "scenario_params": ScenarioParams,
    "scenario_kpis": ScenarioKpis,
    "scenario_unmet_mission": ScenarioUnmetMission,
    "scenario_failure_point": ScenarioFailurePoint,
    "scenario_utilisation_series": ScenarioUtilisationSeries,
    "scenario_result": ScenarioResult,
    # Snapshot
    "sim_state": SimState,
    "wire_snapshot": WireSnapshot,
}


def default_output_dir() -> Path:
    """``backend/docs/schemas`` relative to this file."""
    return Path(__file__).resolve().parents[2] / "docs" / "schemas"


def export_schemas(output_dir: Path | None = None) -> list[Path]:
    """Write one JSON Schema file per model; returns the written paths."""
    destination = output_dir if output_dir is not None else default_output_dir()
    destination.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, model in SCHEMA_MODELS.items():
        schema = model.model_json_schema(by_alias=True)
        path = destination / f"{name}.schema.json"
        path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        written.append(path)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export JSON Schemas for the AirOps DSS wire domain models."
    )
    parser.add_argument(
        "output_dir",
        nargs="?",
        type=Path,
        default=None,
        help="Target directory (default: backend/docs/schemas).",
    )
    args = parser.parse_args()
    written = export_schemas(args.output_dir)
    print(f"Exported {len(written)} schemas to {written[0].parent}")


if __name__ == "__main__":
    main()
