"""B8a audit chain: baseline, appends, filters, CSV, tamper detection."""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from pathlib import Path

from app.audit.hashchain import compute_hash
from app.runtime import SimRuntime
from fastapi.testclient import TestClient

LiveApp = tuple[TestClient, SimRuntime]

THREAT_EVENT = {
    "type": "THREAT_DETECTED",
    "payload": {
        "threatType": "SAM",
        "position": {"lat": 4.9, "lng": 7.6},
        "rangeKm": 85,
        "confidence": 0.9,
    },
}


def _db_path(runtime: SimRuntime) -> Path:
    return Path(runtime.settings.db_url.removeprefix("sqlite:///"))


def test_baseline_chain_is_valid_and_hash_recomputes(app_client: LiveApp) -> None:
    client, _runtime = app_client
    entries = client.get("/api/audit").json()
    assert [entry["id"] for entry in entries] == ["AUD-0001", "AUD-0002", "AUD-0003"]
    assert entries[0]["prevHash"] == "0" * 64
    previous = entries[0]["prevHash"]
    for entry in entries:
        assert entry["prevHash"] == previous
        assert entry["hash"] == compute_hash(
            audit_id=entry["id"],
            timestamp=entry["timestamp"],
            operator=entry["operator"],
            action=entry["action"],
            target_id=entry["targetId"],
            details=entry["details"],
            prev_hash=entry["prevHash"],
        )
        previous = entry["hash"]

    verified = client.get("/api/audit/verify").json()
    assert verified["valid"] is True
    assert verified["brokenLinkIndex"] is None


def test_event_and_simulation_control_append_audit(app_client: LiveApp) -> None:
    client, runtime = app_client
    before = client.get("/api/audit").json()

    assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
    assert runtime.retask.wait_idle(5.0)
    assert client.post("/api/sim/control", json={"action": "pause"}).status_code == 200

    entries = client.get("/api/audit").json()
    assert [entry["id"] for entry in entries] == [
        "AUD-0001",
        "AUD-0002",
        "AUD-0003",
        "AUD-0004",
        "AUD-0005",
        "AUD-0006",
    ]
    actions = [entry["action"] for entry in entries]
    assert "INJECT_EVENT" in actions
    assert "RECOMMENDATION_GENERATED" in actions
    assert "SIM_CONTROL" in actions
    assert len(entries) == len(before) + 3
    assert client.get("/api/audit/verify").json()["valid"] is True


def test_audit_filters_pagination_and_csv(app_client: LiveApp) -> None:
    client, runtime = app_client
    assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
    assert runtime.retask.wait_idle(5.0)

    injected = client.get("/api/audit", params={"action": "INJECT_EVENT"})
    assert injected.status_code == 200
    assert injected.headers["X-Total-Count"] == "1"
    assert [entry["action"] for entry in injected.json()] == ["INJECT_EVENT"]

    page = client.get("/api/audit", params={"limit": 2, "offset": 1})
    assert page.headers["X-Total-Count"] == "5"
    assert [entry["id"] for entry in page.json()] == ["AUD-0002", "AUD-0003"]

    after = client.get(
        "/api/audit", params={"operator": "INTEL_OFFICER_04", "limit": 10}
    ).json()
    assert [entry["id"] for entry in after] == ["AUD-0003"]

    exported = client.get("/api/audit", params={"format": "csv"})
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert exported.text.splitlines()[0] == (
        "id,timestamp,operator,action,targetId,details,prevHash,hash"
    )
    assert "AUD-0001" in exported.text


def test_csv_export_neutralises_formula_cells(app_client: LiveApp) -> None:
    client, runtime = app_client
    runtime.append_audit_sync(
        operator="=2+3",
        action="DECISION_APPROVED",
        target_id="REC-0001",
        details="@SUM(A1:A2)",
        state_version=runtime.store.version,
    )

    exported = client.get("/api/audit", params={"format": "csv"})
    assert ",'=2+3," in exported.text
    assert "'@SUM(A1:A2)" in exported.text


def test_tampering_breaks_verification(app_client: LiveApp) -> None:
    client, runtime = app_client
    path = _db_path(runtime)
    with sqlite3.connect(path) as connection:
        connection.execute(
            "UPDATE audit_entries SET details_json = ? WHERE seq = 2",
            ('"Tampered baseline detail."',),
        )
        connection.commit()

    verified = client.get("/api/audit/verify").json()
    assert verified["valid"] is False
    assert verified["brokenLinkIndex"] == 1
    assert "AUD-0002" in verified["message"]


def test_invalid_details_json_is_reported_not_crashed(app_client: LiveApp) -> None:
    client, runtime = app_client
    with sqlite3.connect(_db_path(runtime)) as connection:
        connection.execute(
            "UPDATE audit_entries SET details_json = 'not-json' WHERE seq = 2"
        )
        connection.commit()

    verified = client.get("/api/audit/verify")
    assert verified.status_code == 200
    body = verified.json()
    assert body["valid"] is False
    assert body["brokenLinkIndex"] == 1
    assert "Details JSON invalid" in body["message"]


def test_standalone_verifier_checks_the_sqlite_file(runtime: SimRuntime) -> None:
    script = Path(__file__).resolve().parents[1] / "scripts" / "verify_audit.py"
    database = _db_path(runtime)
    valid = subprocess.run(
        [sys.executable, str(script), "--db", str(database)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert valid.returncode == 0
    body = json.loads(valid.stdout)
    assert body["valid"] is True
    assert body["entries"] == 3

    with sqlite3.connect(database) as connection:
        connection.execute(
            "UPDATE audit_entries SET action = 'TAMPERED' WHERE seq = 3"
        )
        connection.commit()
    broken = subprocess.run(
        [sys.executable, str(script), "--db", str(database)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert broken.returncode == 1
    assert json.loads(broken.stdout)["brokenLinkIndex"] == 2


def test_restart_reuses_the_existing_chain(runtime: SimRuntime) -> None:
    runtime.append_audit_sync(
        operator="COMMANDER_ALPHA",
        action="DECISION_APPROVED",
        target_id="REC-0001",
        details="Decision persisted before restart.",
        state_version=runtime.store.version,
    )
    assert len(runtime.audit.entries()) == 4
    runtime.audit.close()

    restarted = SimRuntime(runtime.settings)
    try:
        entries = restarted.audit.entries()
        assert [entry.id for entry in entries] == [
            "AUD-0001",
            "AUD-0002",
            "AUD-0003",
            "AUD-0004",
        ]
        assert restarted.audit.verify().valid is True
    finally:
        restarted.audit.close()


def test_reset_retains_the_audit_chain(app_client: LiveApp) -> None:
    client, runtime = app_client
    assert client.post("/api/events", json=THREAT_EVENT).status_code == 201
    assert runtime.retask.wait_idle(5.0)
    count_before = len(client.get("/api/audit").json())

    assert client.post("/api/sim/control", json={"action": "reset"}).status_code == 200
    entries = client.get("/api/audit").json()
    assert len(entries) == count_before + 1
    assert entries[-1]["action"] == "SIM_CONTROL"
    assert client.get("/api/audit/verify").json()["valid"] is True
    assert runtime.store.audit_log == []
