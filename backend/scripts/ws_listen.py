"""Live WebSocket listener for manual verification.

Connects to a running backend, prints each message type, a payload preview and
a per-type count every ``--summary-every`` messages. Sends ``PING`` in reply
to ``HEARTBEAT`` like the frontend does.

Usage:
    python scripts/ws_listen.py                     # ws://localhost:8000/ws
    python scripts/ws_listen.py --url ws://... --duration 30
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
from collections import Counter

import websockets

PREVIEW_CHARS = 140


def preview(payload: object) -> str:
    """Compact one-line preview of a frame payload."""
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    count = len(payload) if isinstance(payload, list) else ""
    suffix = f" ({count} items)" if count != "" else ""
    if len(text) > PREVIEW_CHARS:
        text = text[:PREVIEW_CHARS] + "..."
    return f"{text}{suffix}"


async def listen(url: str, duration: float, summary_every: int) -> None:
    counts: Counter[str] = Counter()
    async with websockets.connect(url) as socket:
        print(f"[ws-listen] connected to {url}")
        try:
            async with asyncio.timeout(duration):
                while True:
                    raw = await socket.recv()
                    try:
                        message = json.loads(raw)
                    except json.JSONDecodeError:
                        counts["<non-json>"] += 1
                        continue
                    message_type = str(message.get("type", "<missing>"))
                    counts[message_type] += 1
                    version = message.get("stateVersion")
                    version_text = f" v{version}" if version is not None else ""
                    print(
                        f"{message_type:<20} #{counts[message_type]:<5}{version_text:<6} "
                        f"{preview(message.get('payload'))}"
                    )
                    if message_type == "HEARTBEAT":
                        await socket.send(json.dumps({"type": "PING"}))
                    if summary_every and sum(counts.values()) % summary_every == 0:
                        print(f"[ws-listen] summary: {dict(counts)}")
        except TimeoutError:
            pass
    print(f"[ws-listen] final counts: {dict(counts)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Listen to the AirOps DSS WebSocket stream.")
    parser.add_argument("--url", default="ws://localhost:8000/ws")
    parser.add_argument("--duration", type=float, default=15.0, help="seconds to listen")
    parser.add_argument("--summary-every", type=int, default=50)
    args = parser.parse_args()
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(listen(args.url, args.duration, args.summary_every))


if __name__ == "__main__":
    main()
