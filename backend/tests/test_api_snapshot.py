"""REST coverage: snapshot parity with the seed and tick version semantics."""

import json
from pathlib import Path

from app.domain import WireSnapshot
from app.runtime import SimRuntime
from fastapi.testclient import TestClient

SEED_FILE = Path(__file__).resolve().parents[2] / "shared" / "seed" / "world.json"


def test_snapshot_matches_seed_except_for_the_audit_genesis(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = app_client
    response = client.get("/api/snapshot")
    assert response.status_code == 200
    payload = response.json()
    WireSnapshot.model_validate(payload)

    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    assert payload["auditLog"] != []
    assert [entry["id"] for entry in payload["auditLog"]] == [
        "AUD-0001",
        "AUD-0002",
        "AUD-0003",
    ]
    payload_without_audit = {key: value for key, value in payload.items() if key != "auditLog"}
    seed_without_audit = {key: value for key, value in seed.items() if key != "auditLog"}
    assert payload_without_audit == seed_without_audit


def test_health_reports_live_sim_time(app_client: tuple[TestClient, SimRuntime]) -> None:
    client, runtime = app_client
    body = client.get("/api/health").json()
    assert set(body) == {"status", "version", "simTime", "solverReady"}
    assert body["status"] == "ok"
    assert body["simTime"] == runtime.clock.now()
    assert body["solverReady"] is False


def test_ticks_do_not_bump_state_version(app_client: tuple[TestClient, SimRuntime]) -> None:
    _client, runtime = app_client
    version_before = runtime.store.version
    for _ in range(5):
        runtime.engine.tick(1.0)
    assert runtime.store.version == version_before


def test_audit_baseline_and_demo_scripts_are_catalogued(
    app_client: tuple[TestClient, SimRuntime],
) -> None:
    client, _runtime = app_client
    audit = client.get("/api/audit").json()
    assert [entry["id"] for entry in audit] == ["AUD-0001", "AUD-0002", "AUD-0003"]
    assert audit[0]["prevHash"] == "0" * 64
    scripts = client.get("/api/demo-scripts").json()
    assert [script["name"] for script in scripts] == [
        "sam-route-b",
        "runway-closure-aog",
    ]
