"""WebSocket authentication and read-only client-message enforcement."""

from __future__ import annotations

from typing import cast

import pytest
from app.security.audit_events import InMemoryAuditSink
from app.security.auth import LoginRequest
from app.security.deps import SecurityContext, build_security_context
from app.security.policy import Role
from app.security.settings import SecuritySettings
from app.security.users import DEMO_PASSWORD
from app.security.ws_auth import (
    authenticate_websocket,
    client_message_permitted,
    enforce_client_message,
)
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient


def _token(context: SecurityContext, username: str = "commander") -> str:
    session = context.auth.login(LoginRequest(username=username, password=DEMO_PASSWORD))
    return session.pair.access_token


def _ws_app(context: SecurityContext) -> FastAPI:
    app = FastAPI()

    @app.websocket("/ws")
    async def endpoint(websocket: WebSocket) -> None:
        identity = await authenticate_websocket(websocket, context)
        if identity is None:
            return
        await websocket.send_json({"type": "AUTH_OK", "role": identity.role.value})
        while True:
            try:
                message = await websocket.receive_json()
            except WebSocketDisconnect:
                return
            message_type = str(message.get("type", ""))
            if not await enforce_client_message(websocket, context, identity, message_type):
                return
            await websocket.send_json({"type": "ECHO", "messageType": message_type})

    return app


@pytest.fixture
def ws_client(auth_context: SecurityContext) -> TestClient:
    return TestClient(_ws_app(auth_context))


def test_demo_mode_authenticates_without_a_token() -> None:
    context = build_security_context(SecuritySettings(auth_enabled=False))
    client = TestClient(_ws_app(context))
    with client.websocket_connect("/ws") as socket:
        assert socket.receive_json() == {"type": "AUTH_OK", "role": "commander"}


<<<<<<< HEAD
def test_query_parameter_token_is_rejected(
    ws_client: TestClient, auth_context: SecurityContext
) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        ws_client.websocket_connect(f"/ws?token={_token(auth_context)}") as socket,
    ):
        socket.send_json({"type": "PING"})
        socket.receive_json()
    assert caught.value.code == 4401
=======
def test_query_parameter_token(ws_client: TestClient, auth_context: SecurityContext) -> None:
    with ws_client.websocket_connect(f"/ws?token={_token(auth_context)}") as socket:
        assert socket.receive_json()["role"] == "commander"
>>>>>>> origin/main


def test_first_message_token(ws_client: TestClient, auth_context: SecurityContext) -> None:
    with ws_client.websocket_connect("/ws") as socket:
        socket.send_json({"type": "AUTH", "token": _token(auth_context, "ops_planner")})
        assert socket.receive_json()["role"] == "ops_planner"


def test_first_message_token_in_payload(
    ws_client: TestClient, auth_context: SecurityContext
) -> None:
    with ws_client.websocket_connect("/ws") as socket:
        socket.send_json({"type": "AUTH", "payload": {"token": _token(auth_context)}})
        assert socket.receive_json()["role"] == "commander"


def test_subprotocol_token(ws_client: TestClient, auth_context: SecurityContext) -> None:
    token = _token(auth_context)
    with ws_client.websocket_connect(
        "/ws", subprotocols=[f"bearer.{token}"]
    ) as socket:
        assert socket.receive_json()["role"] == "commander"
        assert socket.accepted_subprotocol == f"bearer.{token}"


def test_invalid_query_token_is_rejected(ws_client: TestClient) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        ws_client.websocket_connect("/ws?token=garbage") as socket,
    ):
<<<<<<< HEAD
        socket.send_json({"type": "PING"})
=======
>>>>>>> origin/main
        socket.receive_json()
    assert caught.value.code == 4401


def test_first_message_other_than_auth_is_rejected(
    ws_client: TestClient,
) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as caught,
        ws_client.websocket_connect("/ws") as socket,
    ):
        socket.send_json({"type": "PING"})
        socket.receive_json()
    assert caught.value.code == 4401


def test_observer_may_only_ping(ws_client: TestClient, auth_context: SecurityContext) -> None:
    token = _token(auth_context, "observer")
<<<<<<< HEAD
    with ws_client.websocket_connect(
        "/ws", subprotocols=[f"bearer.{token}"]
    ) as socket:
=======
    with ws_client.websocket_connect(f"/ws?token={token}") as socket:
>>>>>>> origin/main
        socket.receive_json()
        socket.send_json({"type": "PING"})
        assert socket.receive_json()["type"] == "ECHO"
        socket.send_json({"type": "COMMAND"})
        with pytest.raises(WebSocketDisconnect) as caught:
            socket.receive_json()
    assert caught.value.code == 4403


@pytest.mark.parametrize("role", ["observer", "auditor"])
def test_read_only_roles_are_restricted(role: str, auth_context: SecurityContext) -> None:
    identity = auth_context.auth.login(
        LoginRequest(username=role, password=DEMO_PASSWORD)
    )
    authenticated = auth_context.tokens.authenticate_access(identity.pair.access_token)
    assert client_message_permitted(authenticated.identity, "PING") is True
    assert client_message_permitted(authenticated.identity, "COMMAND") is False


def test_operational_roles_may_send_other_messages(
    ws_client: TestClient, auth_context: SecurityContext
) -> None:
    token = _token(auth_context, "ops_planner")
<<<<<<< HEAD
    with ws_client.websocket_connect(
        "/ws", subprotocols=[f"bearer.{token}"]
    ) as socket:
=======
    with ws_client.websocket_connect(f"/ws?token={token}") as socket:
>>>>>>> origin/main
        socket.receive_json()
        socket.send_json({"type": "COMMAND"})
        assert socket.receive_json()["type"] == "ECHO"


async def test_enforce_client_message_audits_denial(auth_context: SecurityContext) -> None:
    class FakeWebSocket:
        def __init__(self) -> None:
            self.closed: tuple[int, str] | None = None

        async def close(self, code: int, reason: str) -> None:
            self.closed = (code, reason)

    session = auth_context.auth.login(
        LoginRequest(username="observer", password=DEMO_PASSWORD)
    )
    identity = auth_context.tokens.authenticate_access(session.pair.access_token).identity
    socket = FakeWebSocket()
    allowed = await enforce_client_message(
        socket,  # type: ignore[arg-type]
        auth_context,
        identity,
        "COMMAND",
    )
    assert allowed is False
    assert socket.closed == (4403, "Read-only role may only send PING")
    assert cast(InMemoryAuditSink, auth_context.audit).events[-1].action.value == "ACCESS_DENIED"


def test_role_enum_has_read_only_members() -> None:
    assert {Role.OBSERVER, Role.AUDITOR}.issubset(set(Role))
