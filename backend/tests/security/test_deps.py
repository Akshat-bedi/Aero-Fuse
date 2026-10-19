"""FastAPI adapters: identity resolution, operator spoofing, dependencies and routes."""

from __future__ import annotations

from collections.abc import Iterator
from typing import cast

import pytest
from app.security.audit_events import InMemoryAuditSink, SecurityAuditEvent
from app.security.auth import LoginRequest
from app.security.deps import (
    SecurityContext,
    Unauthenticated,
    create_auth_router,
    enforce_decision,
    enforce_sim_control,
    install_security_context,
    require,
    require_event_injection,
    resolve_identity,
    resolve_operator,
)
from app.security.policy import Identity, Permission, Role
from app.security.users import DEMO_PASSWORD
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient


def _token(context: SecurityContext, username: str = "commander") -> str:
    session = context.auth.login(LoginRequest(username=username, password=DEMO_PASSWORD))
    return session.pair.access_token


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _events(context: SecurityContext) -> tuple[SecurityAuditEvent, ...]:
    return cast(InMemoryAuditSink, context.audit).events


def _build_app(context: SecurityContext) -> FastAPI:
    app = FastAPI()
    install_security_context(app, context)
    app.include_router(create_auth_router(context), prefix="/api")

    @app.get("/snapshot")
    def snapshot(identity: Identity = Depends(require(Permission.READ_SNAPSHOT))) -> dict[str, str]:
        return {"user": identity.username}

    @app.post("/events")
    def events(identity: Identity = Depends(require(Permission.INJECT_EVENT))) -> dict[str, str]:
        return {"user": identity.username}

    @app.post("/events-strict")
    def events_strict(
        identity: Identity = Depends(require_event_injection()),
    ) -> dict[str, str]:
        return {"user": identity.username, "type": identity.role.value}

    @app.post("/decide")
    def decide(identity: Identity = Depends(require(Permission.DECIDE_APPROVE))) -> dict[str, str]:
        return {"user": identity.username}

    @app.get("/audit")
    def audit(identity: Identity = Depends(require(Permission.READ_AUDIT))) -> dict[str, str]:
        return {"user": identity.username}

    @app.get("/users")
    def users(identity: Identity = Depends(require(Permission.MANAGE_USERS))) -> dict[str, str]:
        return {"user": identity.username}

    return app


@pytest.fixture
def auth_app(auth_context: SecurityContext) -> Iterator[TestClient]:
    with TestClient(_build_app(auth_context)) as client:
        yield client


@pytest.fixture
def demo_app(demo_context: SecurityContext) -> Iterator[TestClient]:
    with TestClient(_build_app(demo_context)) as client:
        yield client


def test_demo_mode_identity_is_the_demo_commander(demo_context: SecurityContext) -> None:
    identity = resolve_identity(demo_context, None)
    assert identity.role is Role.COMMANDER
    assert identity.username == "demo-commander"


def test_auth_mode_requires_bearer_token(auth_context: SecurityContext) -> None:
    with pytest.raises(Unauthenticated):
        resolve_identity(auth_context, None)
    with pytest.raises(Unauthenticated):
        resolve_identity(auth_context, "Basic abc")
    assert resolve_identity(
        auth_context, f"Bearer {_token(auth_context)}"
    ).role is Role.COMMANDER


def test_resolve_operator_demo_uses_body_or_default(demo_context: SecurityContext) -> None:
    identity = demo_context.demo_identity
    assert (
        resolve_operator(identity, "COL. J. MERCER", context=demo_context, path="/events")
        == "COL. J. MERCER"
    )
    assert resolve_operator(
        identity, None, context=demo_context, path="/events"
    ) == "demo-commander"
    assert resolve_operator(
        identity, "  ", context=demo_context, path="/events"
    ) == "demo-commander"


def test_resolve_operator_auth_ignores_body_and_audits_spoof(
    auth_context: SecurityContext,
) -> None:
    token = _token(auth_context)
    identity = auth_context.tokens.authenticate_access(token).identity
    operator = resolve_operator(
        identity,
        "COL. EVIL",
        context=auth_context,
        path="/api/events",
    )
    assert operator == "commander"
    spoof = _events(auth_context)[-1]
    assert spoof.action.value == "SPOOF_ATTEMPT"
    assert spoof.details["providedOperator"] == "COL. EVIL"
    assert spoof.details["path"] == "/api/events"


def test_resolve_operator_accepts_username_or_display_name(
    auth_context: SecurityContext,
) -> None:
    token = _token(auth_context)
    identity = auth_context.tokens.authenticate_access(token).identity
    before = len(_events(auth_context))
    assert (
        resolve_operator(identity, "commander", context=auth_context, path="/x")
        == "commander"
    )
    assert (
        resolve_operator(identity, identity.display_name, context=auth_context, path="/x")
        == "commander"
    )
    assert len(_events(auth_context)) == before


def test_require_rejects_missing_and_invalid_tokens(auth_app: TestClient) -> None:
    assert auth_app.get("/snapshot").status_code == 401
    assert auth_app.get("/snapshot", headers={"Authorization": "Bearer nope"}).status_code == 401


@pytest.mark.parametrize(
    ("endpoint", "role", "expected"),
    [
        ("/snapshot", "observer", 200),
        ("/snapshot", "auditor", 200),
        ("/decide", "observer", 403),
        ("/decide", "ops_planner", 403),
        ("/decide", "commander", 200),
        ("/events", "intel_officer", 200),
        ("/events", "observer", 403),
        ("/events", "sys_admin", 403),
        ("/audit", "auditor", 200),
        ("/audit", "commander", 403),
        ("/users", "sys_admin", 200),
        ("/users", "commander", 403),
    ],
)
def test_permission_matrix_over_http(
    auth_app: TestClient,
    auth_context: SecurityContext,
    endpoint: str,
    role: str,
    expected: int,
) -> None:
    token = _token(auth_context, role)
    if endpoint in {"/snapshot", "/audit", "/users"}:
        response = auth_app.get(endpoint, headers=_auth_header(token))
    else:
        response = auth_app.post(endpoint, headers=_auth_header(token), json={})
    assert response.status_code == expected


def test_access_denied_is_audited(auth_app: TestClient, auth_context: SecurityContext) -> None:
    token = _token(auth_context, "observer")
    response = auth_app.post("/decide", headers=_auth_header(token), json={})
    assert response.status_code == 403
    event = _events(auth_context)[-1]
    assert event.action.value == "ACCESS_DENIED"
    assert event.details["permission"] == "decide_approve"


def test_event_type_rule_over_http(auth_app: TestClient, auth_context: SecurityContext) -> None:
    intel = _auth_header(_token(auth_context, "intel_officer"))
    allowed = auth_app.post(
        "/events-strict",
        headers=intel,
        json={"type": "THREAT_DETECTED"},
    )
    assert allowed.status_code == 200
    denied = auth_app.post(
        "/events-strict",
        headers=intel,
        json={"type": "AIRCRAFT_UNSERVICEABLE"},
    )
    assert denied.status_code == 403

    planner = _auth_header(_token(auth_context, "ops_planner"))
    assert (
        auth_app.post(
            "/events-strict",
            headers=planner,
            json={"type": "AIRCRAFT_UNSERVICEABLE"},
        ).status_code
        == 200
    )


def test_event_type_rule_rejects_unknown_type(
    auth_app: TestClient, auth_context: SecurityContext
) -> None:
    token = _auth_header(_token(auth_context, "ops_planner"))
    response = auth_app.post("/events-strict", headers=token, json={"type": "NOT_AN_EVENT"})
    assert response.status_code == 422


def test_auth_router_login_me_refresh_logout(auth_app: TestClient) -> None:
    login = auth_app.post(
        "/api/auth/login",
        json={"username": "commander", "password": DEMO_PASSWORD},
    )
    assert login.status_code == 200
    body = login.json()
    assert set(body) == {"accessToken", "refreshToken", "expiresIn", "tokenType", "user"}
    assert body["user"]["role"] == "commander"
    access = body["accessToken"]

    me = auth_app.get("/api/auth/me", headers=_auth_header(access))
    assert me.status_code == 200
    assert me.json()["username"] == "commander"

    refreshed = auth_app.post(
        "/api/auth/refresh",
        json={"refreshToken": body["refreshToken"]},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refreshToken"] != body["refreshToken"]

    stale = auth_app.post("/api/auth/refresh", json={"refreshToken": body["refreshToken"]})
    assert stale.status_code == 401

    logout = auth_app.post("/api/auth/logout", headers=_auth_header(access))
    assert logout.status_code == 200
    assert logout.json() == {"ok": True}
    assert auth_app.get("/api/auth/me", headers=_auth_header(access)).status_code == 401


def test_auth_router_login_lockout(auth_app: TestClient) -> None:
    for _ in range(3):
        response = auth_app.post(
            "/api/auth/login",
            json={"username": "commander", "password": "wrong"},
        )
    assert response.status_code == 423
    assert response.headers["retry-after"] == "60"
    assert response.json()["detail"] == "Account temporarily locked."


def test_auth_router_step_up(auth_app: TestClient) -> None:
    token = _token_from_router(auth_app, "commander")
    wrong = auth_app.post(
        "/api/auth/step-up",
        headers=_auth_header(token),
        json={"pin": "0000"},
    )
    assert wrong.status_code == 401
    right = auth_app.post(
        "/api/auth/step-up",
        headers=_auth_header(token),
        json={"pin": "4821"},
    )
    assert right.status_code == 200
    assert right.json()["ok"] is True
    assert "stepUpExpiresInSec" in right.json()


def test_auth_router_user_management(auth_app: TestClient, auth_context: SecurityContext) -> None:
    admin = _auth_header(_token(auth_context, "sys_admin"))
    users = auth_app.get("/api/auth/users", headers=admin)
    assert users.status_code == 200
    observer = next(user for user in users.json() if user["username"] == "observer")
    changed = auth_app.patch(
        f"/api/auth/users/{observer['id']}/role",
        headers=admin,
        json={"role": "ops_planner"},
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == "ops_planner"

    escalation = auth_app.patch(
        f"/api/auth/users/{observer['id']}/role",
        headers=admin,
        json={"role": "commander"},
    )
    assert escalation.status_code == 403

    commander = _auth_header(_token(auth_context, "commander"))
    assert auth_app.get("/api/auth/users", headers=commander).status_code == 403


def test_unconfigured_app_returns_500() -> None:
    app = FastAPI()

    @app.get("/snapshot")
    def snapshot(_: Identity = Depends(require(Permission.READ_SNAPSHOT))) -> dict[str, str]:
        return {}

    with TestClient(app) as client:
        assert client.get("/snapshot").status_code == 500


def test_demo_app_allows_reads_without_a_token(demo_app: TestClient) -> None:
    assert demo_app.get("/snapshot").status_code == 200
    assert demo_app.post("/decide", json={}).status_code == 200


def test_decision_permissions_are_action_level(auth_context: SecurityContext) -> None:
    observer = auth_context.tokens.authenticate_access(
        _token(auth_context, "observer")
    ).identity
    commander = auth_context.tokens.authenticate_access(
        _token(auth_context, "commander")
    ).identity

    for decision in ("approve", "reject", "modify"):
        with pytest.raises(HTTPException) as caught:
            enforce_decision(
                auth_context,
                observer,
                decision,
                path="/api/recommendations/REC-1/decision",
            )
        assert caught.value.status_code == 403
        enforce_decision(
            auth_context,
            commander,
            decision,
            path="/api/recommendations/REC-1/decision",
        )

    with pytest.raises(HTTPException) as unknown:
        enforce_decision(auth_context, commander, "archive", path="/x")
    assert unknown.value.status_code == 422


def test_sim_control_permissions_are_action_level(auth_context: SecurityContext) -> None:
    planner = auth_context.tokens.authenticate_access(
        _token(auth_context, "ops_planner")
    ).identity
    commander = auth_context.tokens.authenticate_access(
        _token(auth_context, "commander")
    ).identity

    for action in ("pause", "resume", "speed"):
        enforce_sim_control(auth_context, planner, action, path="/api/sim/control")

    with pytest.raises(HTTPException) as reset:
        enforce_sim_control(auth_context, planner, "reset", path="/api/sim/control")
    assert reset.value.status_code == 403
    enforce_sim_control(auth_context, commander, "reset", path="/api/sim/control")

    with pytest.raises(HTTPException) as unknown:
        enforce_sim_control(auth_context, commander, "explode", path="/x")
    assert unknown.value.status_code == 422


def _token_from_router(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": DEMO_PASSWORD},
    )
    assert response.status_code == 200
    token: str = response.json()["accessToken"]
    return token
