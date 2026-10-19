"""ASGI middleware: per-request correlation ids."""

import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.logging_setup import request_id_var

REQUEST_ID_HEADER = b"x-request-id"


class RequestIdMiddleware:
    """Attach a request id to every HTTP request, response and log line."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        incoming = headers.get(REQUEST_ID_HEADER, b"").decode("ascii", "ignore").strip()
        request_id = incoming or uuid.uuid4().hex
        token = request_id_var.set(request_id)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                raw = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() != REQUEST_ID_HEADER
                ]
                raw.append((REQUEST_ID_HEADER, request_id.encode("ascii")))
                message["headers"] = raw
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_id_var.reset(token)
