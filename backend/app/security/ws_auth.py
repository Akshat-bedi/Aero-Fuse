"""WebSocket authentication and client-message authorization.

The browser cannot set an ``Authorization`` header on a WebSocket handshake, so
a token may be supplied as:

<<<<<<< HEAD
=======
- ``?token=<jwt>`` query parameter (simple, but can appear in logs), or
>>>>>>> origin/main
- the ``Sec-WebSocket-Protocol: bearer.<jwt>`` header, or
- a first message ``{"type": "AUTH", "token": "<jwt>"}`` (or the token under
  ``payload.token``); the server accepts, reads that message, then either
  continues or closes with 4401.

<<<<<<< HEAD
Query-string tokens are deliberately rejected when authentication is enabled so
a JWT can never leak into access logs or browser history.

=======
>>>>>>> origin/main
No ``SNAPSHOT`` is sent before authentication. Read-only roles (observer,
auditor) may only send ``PING``; any other client message closes with 4403.
"""

from __future__ import annotations

from fastapi import WebSocket

from app.security.audit_events import SecurityAuditAction, make_event
from app.security.deps import SecurityContext
from app.security.policy import Identity, Role
from app.security.tokens import TokenRejected

WS_READ_ONLY_ROLES: frozenset[Role] = frozenset({Role.OBSERVER, Role.AUDITOR})

_UNAUTHORIZED_CODE = 4401
_FORBIDDEN_CODE = 4403


<<<<<<< HEAD
=======
def _token_from_query(websocket: WebSocket) -> str | None:
    token = websocket.query_params.get("token")
    return token.strip() if token and token.strip() else None


>>>>>>> origin/main
def _token_from_subprotocol(websocket: WebSocket) -> tuple[str, str] | None:
    header = websocket.headers.get("sec-websocket-protocol")
    if not header:
        return None
    for raw in header.split(","):
        protocol = raw.strip()
        lowered = protocol.casefold()
        if lowered.startswith("bearer."):
            token = protocol[len("bearer.") :].strip()
            if token:
                return protocol, token
        if lowered.startswith("bearer "):
            token = protocol[len("bearer ") :].strip()
            if token:
                return protocol, token
    return None


async def _reject(websocket: WebSocket) -> None:
    await websocket.close(code=_UNAUTHORIZED_CODE, reason="Authentication required")


async def authenticate_websocket(
    websocket: WebSocket,
    context: SecurityContext,
) -> Identity | None:
    """Authenticate a websocket, or close it and return ``None``.

    This function owns the handshake: it accepts the socket on success (and in
    demo mode), so the caller must **not** call ``accept`` again. No application
    message is sent before the identity is established.
    """
    if not context.auth_enabled:
        identity = context.demo_identity
        websocket.state.identity = identity
        await websocket.accept()
        return identity

<<<<<<< HEAD
    token: str | None = None
    subprotocol: str | None = None
    from_subprotocol = _token_from_subprotocol(websocket)
    if from_subprotocol is not None:
        subprotocol, token = from_subprotocol
=======
    token = _token_from_query(websocket)
    subprotocol: str | None = None
    if token is None:
        from_subprotocol = _token_from_subprotocol(websocket)
        if from_subprotocol is not None:
            subprotocol, token = from_subprotocol
>>>>>>> origin/main

    if token is not None:
        try:
            identity = context.tokens.authenticate_access(token).identity
        except TokenRejected:
            await _reject(websocket)
            return None
        websocket.state.identity = identity
        if subprotocol is not None:
            await websocket.accept(subprotocol=subprotocol)
        else:
            await websocket.accept()
        return identity

    await websocket.accept()
    try:
        message = await websocket.receive_json()
    except Exception:
        await _reject(websocket)
        return None

    if not isinstance(message, dict) or str(message.get("type", "")).upper() != "AUTH":
        await _reject(websocket)
        return None
    payload = message.get("payload")
    candidate = message.get("token")
    if candidate is None and isinstance(payload, dict):
        candidate = payload.get("token")
    if not isinstance(candidate, str) or not candidate.strip():
        await _reject(websocket)
        return None

    try:
        identity = context.tokens.authenticate_access(candidate.strip()).identity
    except TokenRejected:
        await _reject(websocket)
        return None
    websocket.state.identity = identity
    return identity


def client_message_permitted(identity: Identity, message_type: str) -> bool:
    """Read-only roles may only send ``PING`` over the socket."""
    if identity.role in WS_READ_ONLY_ROLES:
        return message_type.upper() == "PING"
    return True


async def enforce_client_message(
    websocket: WebSocket,
    context: SecurityContext,
    identity: Identity,
    message_type: str,
) -> bool:
    """Close the socket with 4403 when a read-only role sends anything but PING."""
    if client_message_permitted(identity, message_type):
        return True
    context.audit.record(
        make_event(
            SecurityAuditAction.ACCESS_DENIED,
            operator=identity.username,
            target_id=identity.username,
            timestamp=context.clock(),
            details={
                "role": identity.role.value,
                "messageType": message_type,
                "transport": "websocket",
            },
        )
    )
    await websocket.close(
        code=_FORBIDDEN_CODE,
        reason="Read-only role may only send PING",
    )
    return False
