"""Health endpoint (``GET /api/health``)."""

from fastapi import APIRouter, Request

from app.config import get_settings
from app.domain.base import WireModel

router = APIRouter(tags=["health"])


class HealthResponse(WireModel):
    """Liveness and readiness payload expected by the frontend."""

    status: str
    version: str
    sim_time: str | None = None
    solver_ready: bool


@router.get("/health")
async def get_health(request: Request) -> HealthResponse:
    """Report process health with the current sim time.

    ``simTime`` is an ISO-8601 UTC string from the sim clock. If no runtime is
    attached (unit tests without lifespan) it falls back to the configured
    start time, keeping the contract's four keys. ``solverReady`` flips to
    ``true`` when the CP-SAT optimiser lands in B5.
    """
    settings = get_settings()
    runtime = getattr(request.app.state, "runtime", None)
    sim_time: str = runtime.clock.now() if runtime is not None else settings.sim_start_time
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        sim_time=sim_time,
        solver_ready=False,
    )
