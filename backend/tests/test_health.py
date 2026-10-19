"""Contract tests for ``GET /api/health`` and baseline HTTP behaviour (B0/B2)."""

from app.config import get_settings
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_matches_contract() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    settings = get_settings()
    assert response.json() == {
        "status": "ok",
        "version": settings.app_version,
        "simTime": settings.sim_start_time,
        "solverReady": False,
    }


def test_health_sim_time_is_iso_utc() -> None:
    sim_time = client.get("/api/health").json()["simTime"]
    assert isinstance(sim_time, str)
    assert sim_time.endswith("Z")


def test_request_id_header_is_echoed() -> None:
    response = client.get("/api/health", headers={"X-Request-ID": "test-123"})
    assert response.headers["x-request-id"] == "test-123"


def test_request_id_header_is_generated() -> None:
    response = client.get("/api/health")
    assert response.headers.get("x-request-id")


def test_cors_allows_frontend_origin() -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_allows_loopback_frontend_origin() -> None:
    response = client.get("/api/health", headers={"Origin": "http://127.0.0.1:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"


def test_unknown_route_returns_rfc7807_problem() -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == 404
    assert set(body) >= {"type", "title", "status", "detail"}
