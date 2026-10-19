"""WebSocket connection manager and the ``/ws`` endpoint.

Backpressure policy: every client owns a bounded deque. When a client falls
behind, the oldest droppable message (tick or heartbeat) is discarded before
anything state-carrying; if the queue is only state messages, the oldest is
dropped anyway rather than blocking. A slow client therefore never stalls the
server or other clients.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections import deque
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

if TYPE_CHECKING:
    from app.runtime import SimRuntime

logger = logging.getLogger("airops.ws")

router = APIRouter()

DROPPABLE_TYPES = frozenset({"POSITION_TICK", "CLOCK_TICK", "HEARTBEAT"})


class _Client:
    """One connected consumer with its own bounded outbox."""

    def __init__(self, websocket: WebSocket) -> None:
        self.websocket = websocket
        self.queue: deque[dict[str, Any]] = deque()
        self.wake = asyncio.Event()
        self.alive = True


class ConnectionManager:
    """Fan-out broadcaster with bounded per-client queues."""

    def __init__(self, max_queue: int = 256) -> None:
        self.max_queue = max_queue
        self._clients: list[_Client] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def client_count(self) -> int:
        return len(self._clients)

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Remember the serving loop so broadcasts are thread-safe."""
        self._loop = loop

    async def connect(self, websocket: WebSocket, initial: dict[str, Any] | None = None) -> _Client:
        """Accept the socket, enqueue the first message, then register the client."""
        await websocket.accept()
        client = _Client(websocket)
        if initial is not None:
            self._enqueue(client, initial)
        self._clients.append(client)
        return client

    def disconnect(self, client: _Client) -> None:
        client.alive = False
        client.wake.set()
        if client in self._clients:
            self._clients.remove(client)

    def broadcast(self, message: dict[str, Any]) -> None:
        """Queue a message for every client; safe from any thread."""
        if self._loop is not None and self._loop.is_running():
            try:
                self._loop.call_soon_threadsafe(self._enqueue_all, message)
                return
            except RuntimeError:  # loop closed between check and call
                pass
        self._enqueue_all(message)

    def _enqueue_all(self, message: dict[str, Any]) -> None:
        for client in list(self._clients):
            self._enqueue(client, message)

    def _enqueue(self, client: _Client, message: dict[str, Any]) -> None:
        if not client.alive:
            return
        queue = client.queue
        if len(queue) >= self.max_queue:
            for index, queued in enumerate(queue):
                if queued.get("type") in DROPPABLE_TYPES:
                    del queue[index]
                    break
            else:
                queue.popleft()
        queue.append(message)
        client.wake.set()

    async def run_writer(self, client: _Client) -> None:
        """Drain one client's outbox until it goes away."""
        try:
            while True:
                await client.wake.wait()
                if not client.alive:
                    break
                client.wake.clear()
                while client.queue:
                    await client.websocket.send_json(client.queue.popleft())
        except (WebSocketDisconnect, RuntimeError):
            pass
        except Exception:
            logger.debug("WebSocket writer stopped unexpectedly", exc_info=True)
        finally:
            self.disconnect(client)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Serve the tactical stream: SNAPSHOT first, then ticks and updates."""
    runtime: SimRuntime = websocket.app.state.runtime
    manager = runtime.ws
    client = await manager.connect(websocket, initial=runtime.snapshot_frame())
    writer = asyncio.create_task(manager.run_writer(client))
    try:
        while True:
            message = await websocket.receive_json()
            if isinstance(message, dict) and message.get("type") == "PING":
                continue
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket reader stopped unexpectedly", exc_info=True)
    finally:
        manager.disconnect(client)
        writer.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await writer
