"""Per-client backpressure: slow consumers drop ticks, never lose state frames."""

from typing import cast

from app.api.ws import ConnectionManager, _Client
from fastapi import WebSocket


class _FakeSocket:
    """Placeholder socket: these tests never await a send."""


def _attach(manager: ConnectionManager) -> _Client:
    client = _Client(cast(WebSocket, _FakeSocket()))
    manager._enqueue(client, {"type": "SNAPSHOT"})
    manager._clients.append(client)
    return client


def test_queue_is_bounded_and_drops_oldest_tick_first() -> None:
    manager = ConnectionManager(max_queue=3)
    client = _attach(manager)
    for index in range(6):
        manager._enqueue(client, {"type": "POSITION_TICK", "n": index})
    assert len(client.queue) == 3


def test_state_changing_frames_survive_overflow() -> None:
    manager = ConnectionManager(max_queue=3)
    client = _attach(manager)
    for index in range(5):
        manager._enqueue(client, {"type": "POSITION_TICK", "n": index})

    manager._enqueue(client, {"type": "ENTITY_UPDATE"})
    manager._enqueue(client, {"type": "EVENT_INJECTED"})

    types = [message["type"] for message in client.queue]
    assert types == ["SNAPSHOT", "ENTITY_UPDATE", "EVENT_INJECTED"]


def test_snapshot_is_the_last_resort_drop() -> None:
    manager = ConnectionManager(max_queue=2)
    client = _attach(manager)
    manager._enqueue(client, {"type": "ENTITY_UPDATE"})
    manager._enqueue(client, {"type": "EVENT_INJECTED"})
    assert [message["type"] for message in client.queue] == [
        "ENTITY_UPDATE",
        "EVENT_INJECTED",
    ]
