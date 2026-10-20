"""The live-server ``scripts/full_loop.py`` contract.

Runs a real Uvicorn server on a loopback port, drives the script as an operator
would from the command line, then checks the printed evidence and the
standalone verifier against the same SQLite file.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast

import pytest
import uvicorn
from app.config import get_settings
from app.main import create_app

BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "scripts" / "full_loop.py"
VERIFY = BACKEND / "scripts" / "verify_audit.py"


@pytest.fixture()
def live_server(tmp_path: Path) -> Iterator[tuple[str, Path]]:
    """A real Uvicorn server with zero artificial demo/retask delays."""
    database = tmp_path / "live.db"
    settings = get_settings().model_copy(
        update={
            "db_url": f"sqlite:///{database.as_posix()}",
            "retask_min_stage_ms": 0,
            "demo_step_delay_s": 0.0,
        }
    )
    application = create_app(settings=settings)
    server = uvicorn.Server(
        uvicorn.Config(
            application,
            host="127.0.0.1",
            port=0,
            log_level="warning",
            access_log=False,
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        if server.started and server.servers and server.servers[0].sockets:
            break
        time.sleep(0.01)
    else:  # pragma: no cover - startup failure is an environment problem
        raise RuntimeError("live Uvicorn server did not start")
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield f"http://127.0.0.1:{port}/api", database
    finally:
        server.should_exit = True
        thread.join(10.0)
        assert not thread.is_alive()


def _mission(run: dict[str, Any], mission_id: str) -> dict[str, Any]:
    for mission in run["liveState"]["missions"]:
        if mission["id"] == mission_id:
            return cast(dict[str, Any], mission)
    raise AssertionError(f"{mission_id} missing from full-loop output")


def test_full_loop_script_runs_both_demos_and_verifies_audit(
    live_server: tuple[str, Path],
) -> None:
    base_url, database = live_server
    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--base-url",
            base_url,
            "--demo",
            "all",
            "--timeout",
            "20",
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    report = json.loads(completed.stdout)
    assert report["ok"] is True
    assert [run["demo"] for run in report["runs"]] == [
        "sam-route-b",
        "runway-closure-aog",
    ]

    sam = report["runs"][0]
    assert sam["eventCount"] == 1
    assert [decision["status"] for decision in sam["decisions"]] == ["approved"]
    assert sam["recommendations"][0]["status"] == "approved"
    assert _mission(sam, "M-04")["routeMatch"]["optionId"] == "Route C"

    runway = report["runs"][1]
    assert runway["eventCount"] == 2
    statuses = {
        recommendation["id"]: recommendation["status"]
        for recommendation in runway["recommendations"]
    }
    assert statuses == {"REC-0001": "stale", "REC-0002": "approved"}
    assert [decision["id"] for decision in runway["decisions"]] == ["REC-0002"]

    audit = report["audit"]
    assert audit["verify"]["valid"] is True
    assert audit["entries"] >= 8
    assert audit["latest"]["action"] == "DECISION_APPROVED"

    standalone = subprocess.run(
        [sys.executable, str(VERIFY), "--db", str(database)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert standalone.returncode == 0, standalone.stderr
    standalone_body = json.loads(standalone.stdout)
    assert standalone_body["valid"] is True
    assert standalone_body["entries"] == audit["entries"]
