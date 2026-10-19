"""Operational REST endpoints implemented in B2.

Endpoints: snapshot, event injection, sim control, audit listing and the demo
script catalogue. Recommendations, scenarios, predictions and fusion status
belong to later stages (B4-B8) and are intentionally absent.
"""

from __future__ import annotations

from typing import Any, Literal

import orjson
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import model_validator

from app.domain import AuditEntry, OpsEventRequest, WireModel, dump_wire
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
    return _json(dump_wire(event, exclude_none=True), status_code=201)


@router.get("/audit", response_model=list[AuditEntry])
async def get_audit(request: Request) -> list[AuditEntry]:
    """Audit listing. The hash chain lands in B8; the baseline is empty."""
    runtime = _runtime(request)
    return list(runtime.store.audit_log)


@router.get("/demo-scripts")
async def get_demo_scripts() -> list[dict[str, str]]:
    """Scripted event sequences land in B6a; the catalogue is empty until then."""
    return []
