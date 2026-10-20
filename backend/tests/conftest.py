"""Shared test fixtures, including the hard offline guard."""

import json
import socket
from collections.abc import Iterator
from pathlib import Path
from typing import Any, cast

import pytest
from app.config import Settings, get_settings
from app.domain import WireSnapshot
from app.main import create_app
from app.runtime import SimRuntime
from fastapi import FastAPI
from fastapi.testclient import TestClient

_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "::", None}

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "shared" / "seed" / "world.json"


def test_settings() -> Settings:
    """Environment settings with retask/demo delays removed for fast tests."""
    return get_settings().model_copy(
        update={"retask_min_stage_ms": 0, "demo_step_delay_s": 0.0}
    )


@pytest.fixture(scope="session")
def seed_raw() -> dict[str, Any]:
    """Raw ``shared/seed/world.json`` contents (authoritative seed)."""
    loaded: dict[str, Any] = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    return loaded


@pytest.fixture(scope="session")
def seed_snapshot(seed_raw: dict[str, Any]) -> WireSnapshot:
    """The seed parsed through the domain models."""
    return WireSnapshot.model_validate(seed_raw)


@pytest.fixture(autouse=True)
def isolated_audit_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Give every test its own SQLite audit database."""
    monkeypatch.setenv("DB_URL", f"sqlite:///{(tmp_path / 'audit.db').as_posix()}")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def runtime() -> Iterator[SimRuntime]:
    """A SimRuntime without the wall-clock loops (deterministic fast-forward)."""
    rt = SimRuntime(test_settings())
    yield rt
    rt.audit.close()


@pytest.fixture()
def app_client() -> Iterator[tuple[TestClient, SimRuntime]]:
    """A TestClient whose lifespan builds a runtime with the sim loop stopped."""
    application: FastAPI = create_app(autostart_sim=False, settings=test_settings())
    with TestClient(application) as client:
        yield client, cast(SimRuntime, application.state.runtime)


def _host_of(address: Any) -> Any:
    if isinstance(address, tuple) and address:
        return address[0]
    return None


def _is_local(host: Any) -> bool:
    if host in _LOCAL_HOSTS:
        return True
    return isinstance(host, str) and host.startswith("127.")


@pytest.fixture(autouse=True)
def offline_guard(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Fail any test that opens a non-loopback network socket."""
    real_connect = socket.socket.connect
    real_connect_ex = socket.socket.connect_ex

    def guarded_connect(self: socket.socket, address: Any) -> None:
        if not _is_local(_host_of(address)):
            raise RuntimeError(f"Network access blocked in tests: {address!r}")
        real_connect(self, address)

    def guarded_connect_ex(self: socket.socket, address: Any) -> int:
        if not _is_local(_host_of(address)):
            raise RuntimeError(f"Network access blocked in tests: {address!r}")
        return real_connect_ex(self, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)
    yield
