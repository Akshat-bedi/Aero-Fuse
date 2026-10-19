"""Shared test fixtures, including the hard offline guard."""

import json
import socket
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from app.domain import WireSnapshot

_LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "0.0.0.0", "::", None}

REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_FILE = REPO_ROOT / "shared" / "seed" / "world.json"


@pytest.fixture(scope="session")
def seed_raw() -> dict[str, Any]:
    """Raw ``shared/seed/world.json`` contents (authoritative seed)."""
    loaded: dict[str, Any] = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    return loaded


@pytest.fixture(scope="session")
def seed_snapshot(seed_raw: dict[str, Any]) -> WireSnapshot:
    """The seed parsed through the domain models."""
    return WireSnapshot.model_validate(seed_raw)



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
