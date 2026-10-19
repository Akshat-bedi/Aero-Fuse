"""Health endpoint (``GET /api/health``)."""

from fastapi import APIRouter

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
async def get_health() -> HealthResponse:
    """Report process health.

    ``simTime`` is ``null`` until the simulation clock lands in B2;
    ``solverReady`` flips to ``true`` when the CP-SAT optimiser lands in B5.
    """
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        sim_time=None,
        solver_ready=False,
    )
