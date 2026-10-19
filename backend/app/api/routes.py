"""Operational REST endpoints implemented in B2 and extended in B6a.

Endpoints: snapshot, event injection (with async retasking), sim control,
recommendations, eligible resources, the demo script catalogue/runner and audit
listing. Decisions, scenarios, predictions and fusion status belong to later
stages (B4-B8) and are intentionally absent.
"""

from __future__ import annotations

from typing import Any, Literal

import orjson
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import model_validator

from app.domain import (
    AuditEntry,
    EligibleResources,
    OpsEventRequest,
    Recommendation,
    WireModel,
    dump_wire,
)
from app.retask import eligibility
from app.retask.demos import DEMO_SCRIPTS, DemoBusyError, UnknownDemoError
from app.runtime import SimRuntime
from app.state.store import UnknownEntityError

router = APIRouter(tags=["ops"])


class SimControlRequest(WireModel):
    """Body of ``POST /api/sim/control``."""

    action: Literal["pause", "resume", "speed", "reset"]
    speed: Literal[1, 5, 20] | None = None

    @model_validator(mode="after")
    def _speed_required_for_speed_action(self) -> SimControlRequest:
        if self.action == "speed" and self.speed is None:
            raise ValueError("speed is required when action is 'speed'")
        return self


class SimControlResponse(WireModel):
    """Result of a sim-control action (mirrors the seed's ``sim`` object)."""

    sim_time: str
    speed: float
    paused: bool


def _runtime(request: Request) -> SimRuntime:
    runtime: SimRuntime = request.app.state.runtime
    return runtime


def _json(content: Any, *, status_code: int = 200) -> Response:
    """Serialise a wire payload with orjson (settings guarantee ASCII-safe JSON)."""
    return Response(
        content=orjson.dumps(content),
        media_type="application/json",
        status_code=status_code,
    )


@router.get("/snapshot")
async def get_snapshot(request: Request) -> Response:
    """Full canonical state; every collection is an array (wire format)."""
    runtime = _runtime(request)
    return _json(dump_wire(runtime.snapshot(), exclude_none=True))


@router.post("/sim/control", response_model=SimControlResponse)
async def control_simulation(body: SimControlRequest, request: Request) -> SimControlResponse:
    """Pause/resume/change speed/reset. Reset restores the clean seed and bumps
    ``stateVersion`` so every client resyncs from the re-broadcast snapshot."""
    runtime = _runtime(request)
    result = runtime.control(body.action, body.speed)
    return SimControlResponse.model_validate(result)


@router.post("/events", status_code=201)
async def inject_event(body: OpsEventRequest, request: Request) -> Response:
    """Validate, register and factually apply an operator event.

    Returns the full ``OpsEvent`` (id and sim-clock timestamp assigned here).
    Unknown referenced ids produce a 404 problem response; malformed payloads
    are rejected with 422 by the typed models.
    """
    runtime = _runtime(request)
    try:
        event = runtime.inject_event(body)
    except UnknownEntityError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"unknown {exc.entity_type}: {exc.entity_id}",
        ) from exc
    runtime.schedule_retask(event)
    return _json(dump_wire(event, exclude_none=True), status_code=201)


@router.get(
    "/recommendations",
    response_model=list[Recommendation],
    response_model_exclude_none=True,
)
async def list_recommendations(request: Request, status: str | None = None) -> list[Recommendation]:
    """Pending/decided recommendations, optionally filtered by status."""
    runtime = _runtime(request)
    recommendations = list(runtime.store.recommendations.values())
    if status is not None:
        recommendations = [
            recommendation
            for recommendation in recommendations
            if recommendation.status.value == status
        ]
    return recommendations


@router.get(
    "/recommendations/{recommendation_id}",
    response_model=Recommendation,
    response_model_exclude_none=True,
)
async def get_recommendation(
    recommendation_id: str, request: Request
) -> Recommendation:
    """One recommendation by id (404 when unknown)."""
    recommendation = _runtime(request).store.recommendations.get(recommendation_id)
    if recommendation is None:
        raise HTTPException(status_code=404, detail=f"unknown recommendation: {recommendation_id}")
    return recommendation


@router.get(
    "/missions/{mission_id}/eligible-resources",
    response_model=EligibleResources,
    response_model_exclude_none=True,
)
async def get_eligible_resources(mission_id: str, request: Request) -> EligibleResources:
    """Feasible aircraft/crew for the Modify dropdowns."""
    runtime = _runtime(request)
    mission = runtime.store.missions.get(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail=f"unknown mission: {mission_id}")
    return EligibleResources(
        aircraft=eligibility.eligible_aircraft(runtime.store, mission),
        crew=eligibility.eligible_crew(runtime.store, mission),
    )


@router.get("/audit", response_model=list[AuditEntry])
async def get_audit(request: Request) -> list[AuditEntry]:
    """Audit listing. The hash chain lands in B8; the baseline is empty."""
    runtime = _runtime(request)
    return list(runtime.store.audit_log)


@router.get("/demo-scripts")
async def get_demo_scripts() -> list[dict[str, str]]:
    """Catalogue of scripted demo event sequences."""
    return list(DEMO_SCRIPTS)


@router.post("/demo-scripts/{name}/run")
async def run_demo_script(
    name: str, request: Request, reset: bool = False
) -> dict[str, Any]:
    """Start a demo script in the background (optionally from a clean seed)."""
    runtime = _runtime(request)
    if reset:
        runtime.control("reset", None)
    try:
        return runtime.demos.start(name)
    except UnknownDemoError as exc:
        raise HTTPException(status_code=404, detail=f"unknown demo script: {name}") from exc
    except DemoBusyError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"demo script already running: {exc}",
        ) from exc
