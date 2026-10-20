"""Operational REST endpoints implemented in B2 and extended in B6a.

Endpoints: snapshot, event injection (with async retasking), sim control,
recommendations, eligible resources, the demo script catalogue/runner and audit
listing. Decisions, scenarios, predictions and fusion status belong to later
stages (B4-B8) and are intentionally absent.
"""

from __future__ import annotations

import csv
import io
from typing import Annotated, Any, Literal

import orjson
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import model_validator

from app.domain import (
    AuditVerification,
    DecisionRequest,
    EligibleResources,
    ModificationsRequest,
    ModificationValidationResult,
    OpsEventRequest,
    Recommendation,
    WireModel,
    dump_wire,
)
from app.retask import eligibility
from app.retask.demos import DEMO_SCRIPTS, DemoBusyError, UnknownDemoError
from app.runtime import SimRuntime
from app.security.deps import (
    SecurityContext,
    enforce_decision,
    enforce_permission,
    enforce_sim_control,
    get_security_context,
    require,
    require_event_injection,
    resolve_operator,
)
from app.security.policy import Identity, Permission
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


def _operator(request: Request, identity: Identity, body_operator: str | None) -> str:
    context: SecurityContext = get_security_context(request)
    return resolve_operator(
        identity,
        body_operator,
        context=context,
        path=request.url.path,
    )


def _csv_cell(value: str) -> str:
    """Neutralise spreadsheet formula injection in exported audit cells."""
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


def _json(
    content: Any,
    *,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> Response:
    """Serialise a wire payload with orjson (settings guarantee ASCII-safe JSON)."""
    return Response(
        content=orjson.dumps(content),
        media_type="application/json",
        status_code=status_code,
        headers=headers,
    )


@router.get("/snapshot")
async def get_snapshot(
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.READ_SNAPSHOT))],
) -> Response:
    """Full canonical state; every collection is an array (wire format)."""
    runtime = _runtime(request)
    return _json(dump_wire(runtime.snapshot(), exclude_none=True))


@router.post("/sim/control", response_model=SimControlResponse)
async def control_simulation(
    body: SimControlRequest,
    request: Request,
    identity: Annotated[Identity, Depends(require(Permission.READ_SNAPSHOT))],
) -> SimControlResponse:
    """Pause/resume/change speed/reset. Reset restores the clean seed and bumps
    ``stateVersion`` so every client resyncs from the re-broadcast snapshot."""
    context: SecurityContext = get_security_context(request)
    enforce_sim_control(context, identity, body.action, path=request.url.path)
    runtime = _runtime(request)
    operator = _operator(request, identity, None)
    result = runtime.control(body.action, body.speed, operator=operator)
    return SimControlResponse.model_validate(result)


@router.post("/events", status_code=201)
async def inject_event(
    body: OpsEventRequest,
    request: Request,
    identity: Annotated[Identity, Depends(require_event_injection())],
) -> Response:
    """Validate, register and factually apply an operator event.

    Returns the full ``OpsEvent`` (id and sim-clock timestamp assigned here).
    Unknown referenced ids produce a 404 problem response; malformed payloads
    are rejected with 422 by the typed models.
    """
    runtime = _runtime(request)
    operator = _operator(request, identity, body.operator)
    try:
        event = runtime.inject_event(body, operator=operator)
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
async def list_recommendations(
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.READ_RECOMMENDATIONS))],
    status: str | None = None,
) -> list[Recommendation]:
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
    recommendation_id: str,
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.READ_RECOMMENDATIONS))],
) -> Recommendation:
    """One recommendation by id (404 when unknown)."""
    recommendation = _runtime(request).store.recommendations.get(recommendation_id)
    if recommendation is None:
        raise HTTPException(status_code=404, detail=f"unknown recommendation: {recommendation_id}")
    return recommendation


@router.post(
    "/recommendations/{recommendation_id}/validate-modification",
    response_model=ModificationValidationResult,
    response_model_exclude_none=True,
)
async def validate_modification(
    recommendation_id: str,
    body: ModificationsRequest,
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.VALIDATE_MODIFICATION))],
) -> ModificationValidationResult:
    """Validate the raw Modify-UI payload without applying anything."""
    runtime = _runtime(request)
    return await runtime.decisions.validate_modification(recommendation_id, body)


@router.post(
    "/recommendations/{recommendation_id}/decision",
    response_model=Recommendation,
    response_model_exclude_none=True,
)
async def decide_recommendation(
    recommendation_id: str,
    body: DecisionRequest,
    request: Request,
    identity: Annotated[Identity, Depends(require(Permission.READ_RECOMMENDATIONS))],
) -> Recommendation:
    """Approve, reject or modify a pending recommendation (human in the loop)."""
    context: SecurityContext = get_security_context(request)
    enforce_decision(context, identity, body.decision, path=request.url.path)
    runtime = _runtime(request)
    operator = _operator(request, identity, body.operator)
    return await runtime.decisions.decide(
        recommendation_id,
        body,
        identity=identity,
        operator=operator,
    )


@router.post(
    "/recommendations/{recommendation_id}/approvals/revoke",
    response_model=Recommendation,
    response_model_exclude_none=True,
)
async def revoke_recommendation_approval(
    recommendation_id: str,
    request: Request,
    identity: Annotated[Identity, Depends(require(Permission.READ_RECOMMENDATIONS))],
) -> Recommendation:
    """Retract the acting commander's own pending approval."""
    context: SecurityContext = get_security_context(request)
    enforce_permission(
        context,
        identity,
        Permission.DECIDE_APPROVE,
        path=request.url.path,
    )
    runtime = _runtime(request)
    operator = _operator(request, identity, None)
    return await runtime.decisions.revoke(
        recommendation_id,
        identity=identity,
        operator=operator,
    )


@router.get(
    "/missions/{mission_id}/eligible-resources",
    response_model=EligibleResources,
    response_model_exclude_none=True,
)
async def get_eligible_resources(
    mission_id: str,
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.READ_ELIGIBLE_RESOURCES))],
) -> EligibleResources:
    """Feasible aircraft/crew for the Modify dropdowns."""
    runtime = _runtime(request)
    mission = runtime.store.missions.get(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail=f"unknown mission: {mission_id}")
    return EligibleResources(
        aircraft=eligibility.eligible_aircraft(runtime.store, mission),
        crew=eligibility.eligible_crew(runtime.store, mission),
    )


@router.get("/audit/verify", response_model=AuditVerification)
async def verify_audit(
    request: Request,
    _identity: Annotated[Identity, Depends(require(Permission.VERIFY_AUDIT))],
) -> AuditVerification:
    """Recompute the SHA-256 chain and report the first broken link."""
    runtime = _runtime(request)
    return runtime.audit.verify()


@router.get("/audit")
async def get_audit(
    request: Request,
    identity: Annotated[Identity, Depends(require(Permission.READ_AUDIT))],
    operator: str | None = None,
    action: str | None = None,
    from_timestamp: str | None = Query(default=None, alias="from"),
    to_timestamp: str | None = Query(default=None, alias="to"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    format: Literal["json", "csv"] = "json",
) -> Response:
    """Paginated audit listing with filters and optional CSV export."""
    context: SecurityContext = get_security_context(request)
    if format == "csv":
        enforce_permission(
            context,
            identity,
            Permission.EXPORT_AUDIT,
            path=request.url.path,
        )
    runtime = _runtime(request)
    entries, total = runtime.audit.query(
        operator=operator,
        action=action,
        from_timestamp=from_timestamp,
        to_timestamp=to_timestamp,
        limit=limit,
        offset=offset,
    )
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow(
            ["id", "timestamp", "operator", "action", "targetId", "details", "prevHash", "hash"]
        )
        for entry in entries:
            details = (
                orjson.dumps(entry.details).decode("utf-8")
                if isinstance(entry.details, dict)
                else entry.details
            )
            writer.writerow(
                [
                    _csv_cell(entry.id),
                    _csv_cell(entry.timestamp),
                    _csv_cell(entry.operator),
                    _csv_cell(entry.action),
                    _csv_cell(entry.target_id),
                    _csv_cell(details),
                    _csv_cell(entry.prev_hash),
                    _csv_cell(entry.hash),
                ]
            )
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={
                "X-Total-Count": str(total),
                "Content-Disposition": 'attachment; filename="audit.csv"',
            },
        )
    payload = [dump_wire(entry, exclude_none=True) for entry in entries]
    return _json(payload, headers={"X-Total-Count": str(total)})


@router.get("/demo-scripts")
async def get_demo_scripts(
    _identity: Annotated[Identity, Depends(require(Permission.READ_DEMO_SCRIPTS))],
) -> list[dict[str, str]]:
    """Catalogue of scripted demo event sequences."""
    return list(DEMO_SCRIPTS)


@router.post("/demo-scripts/{name}/run")
async def run_demo_script(
    name: str,
    request: Request,
    identity: Annotated[Identity, Depends(require(Permission.RUN_DEMO_SCRIPT))],
    reset: bool = False,
) -> dict[str, Any]:
    """Start a demo script in the background (optionally from a clean seed)."""
    runtime = _runtime(request)
    operator = _operator(request, identity, None)
    if reset:
        runtime.control("reset", None, operator=operator)
    try:
        return runtime.demos.start(name, operator=operator)
    except UnknownDemoError as exc:
        raise HTTPException(status_code=404, detail=f"unknown demo script: {name}") from exc
    except DemoBusyError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"demo script already running: {exc}",
        ) from exc


ACTION_LEVEL = "action-level"
"""Marker for routes whose permission depends on the parsed request body."""

PUBLIC_ROUTES: frozenset[tuple[str, str]] = frozenset({("GET", "/api/health")})

ROUTE_PERMISSIONS: dict[tuple[str, str], Permission | str] = {
    ("GET", "/api/snapshot"): Permission.READ_SNAPSHOT,
    ("POST", "/api/sim/control"): ACTION_LEVEL,
    ("POST", "/api/events"): ACTION_LEVEL,
    ("GET", "/api/recommendations"): Permission.READ_RECOMMENDATIONS,
    ("GET", "/api/recommendations/{recommendation_id}"): Permission.READ_RECOMMENDATIONS,
    (
        "POST",
        "/api/recommendations/{recommendation_id}/validate-modification",
    ): Permission.VALIDATE_MODIFICATION,
    ("POST", "/api/recommendations/{recommendation_id}/decision"): ACTION_LEVEL,
    (
        "POST",
        "/api/recommendations/{recommendation_id}/approvals/revoke",
    ): Permission.DECIDE_APPROVE,
    (
        "GET",
        "/api/missions/{mission_id}/eligible-resources",
    ): Permission.READ_ELIGIBLE_RESOURCES,
    ("GET", "/api/audit/verify"): Permission.VERIFY_AUDIT,
    ("GET", "/api/audit"): Permission.READ_AUDIT,
    ("GET", "/api/demo-scripts"): Permission.READ_DEMO_SCRIPTS,
    ("POST", "/api/demo-scripts/{name}/run"): Permission.RUN_DEMO_SCRIPT,
}
