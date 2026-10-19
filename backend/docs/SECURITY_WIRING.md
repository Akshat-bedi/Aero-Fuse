# Security Wiring (B8)

> The security package is intentionally **not** mounted in `app/main.py`.
> This file is the checklist for the B8 integration PR and for the frontend
> changes that must accompany it. Do not treat the routes as live until this
> wiring is done.

See [`SECURITY.md`](SECURITY.md) for roles, tokens, approvals and limitations.

## 1. Mount the package

In the B8 app factory (or a dedicated initialiser):

```python
from app.security.deps import (
    build_security_context,
    create_auth_router,
    install_security_context,
)

security = build_security_context()  # reads AUTH_ENABLED / JWT_SECRET
install_security_context(app, security)
app.include_router(create_auth_router(security), prefix="/api")
```

`build_security_context()` fails fast when `AUTH_ENABLED=true` with a missing,
short or default `JWT_SECRET`. Do not catch that error to "keep the demo
running"; make the operator fix the environment.

The resulting routes are:

| Method | Path | Body / auth | Response |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | `{username, password}` | `TokenResponse` |
| POST | `/api/auth/refresh` | `{refreshToken}` | `TokenResponse` |
| POST | `/api/auth/logout` | `Authorization: Bearer ...` | `{ok: bool}` |
| POST | `/api/auth/step-up` | `{pin}` + bearer | `{ok, stepUpExpiresInSec}` |
| GET | `/api/auth/me` | bearer (or demo mode) | `UserView` |
| GET | `/api/auth/users` | `MANAGE_USERS` | `UserView[]` |
| PATCH | `/api/auth/users/{userId}/role` | `{role}` + `MANAGE_USERS` | `UserView` |

These paths and response shapes are **not** in `docs/API_CONTRACT.md` yet;
raise a `contract-change` issue before the frontend depends on them.

## 2. Protect existing routes

Use `Depends(require(Permission.X))` on every non-public route. Suggested map:

| Route | Permission |
| :--- | :--- |
| `GET /api/health` | public (liveness; no state) |
| `GET /api/snapshot` | `READ_SNAPSHOT` |
| `POST /api/events` | `require_event_injection()` (see below) |
| `GET /api/recommendations` | `READ_RECOMMENDATIONS` |
| `GET /api/recommendations/{id}` | `READ_RECOMMENDATIONS` |
| `POST /api/recommendations/{id}/validate-modification` | `VALIDATE_MODIFICATION` |
| `POST /api/recommendations/{id}/decision` | `enforce_decision(...)` (see below) |
| `GET /api/missions/{id}/eligible-resources` | `READ_ELIGIBLE_RESOURCES` |
| `GET /api/predictions` | `READ_PREDICTIONS` |
| `POST /api/scenarios/run` | `RUN_SCENARIO` |
| `GET /api/scenarios`, `GET /api/scenarios/{id}` | `READ_SCENARIOS` |
| `GET /api/audit` | `READ_AUDIT` |
| `GET /api/audit/verify` | `VERIFY_AUDIT` |
| `POST /api/sim/control` | `enforce_sim_control(...)` |
| `GET /api/demo-scripts` | `READ_DEMO_SCRIPTS` |
| `POST /api/demo-scripts/{name}/run` | `RUN_DEMO_SCRIPT` |
| `GET /api/fusion/status`, `GET /api/routes/risk` | `READ_SNAPSHOT` (backend extras) |

The dependency returns the `Identity`; keep it for operator resolution and
audit. Missing/invalid tokens become `401` with `WWW-Authenticate: Bearer`;
insufficient permission becomes `403` and records `ACCESS_DENIED`.

## 3. Event injection is per event type

`INJECT_EVENT` alone is not enough. Either use the body-reading dependency:

```python
@app.post("/api/events", status_code=201)
def inject_event(
    body: OpsEventRequest,
    identity: Identity = Depends(require_event_injection()),
):
    operator = resolve_operator(
        identity,
        body.operator,
        context=security,
        path="/api/events",
    )
    ...
```

or parse the body first and call:

```python
enforce_event_injection(security, identity, body.type, path="/api/events")
```

An intel officer may only raise `THREAT_DETECTED`; a maintenance officer only
`AIRCRAFT_UNSERVICEABLE` and `BASE_CLOSED`; planners and commanders may raise
any event. Everyone else is denied.

## 4. Decisions and sim control are action-level

One route handles approve/reject/modify, so check the body:

```python
enforce_decision(security, identity, body.decision, path=request.url.path)
```

One route handles pause/resume/speed/reset:

```python
enforce_sim_control(security, identity, body.action, path=request.url.path)
```

Both raise `403` (and audit `ACCESS_DENIED`) or `422` for an unknown action.
Only a commander can reach a decision permission; planners cannot reset the
simulation.

Approval outcomes map to statuses with the same request body:

```python
outcome = evaluate_approval(...)  # or evaluate_rejection / revoke_approval
error = approval_denial_exception(outcome)
if error is not None:
    raise error
if outcome.apply_plan:
    apply_plan(...)
```

| `ApprovalOutcome.denial` | Status |
| :--- | :--- |
| `NOT_COMMANDER` | `403` |
| `STEP_UP_REQUIRED` | `428` + RFC 7807 body |
| `SEPARATION_OF_DUTIES` | `403` |
| `ALREADY_DECIDED` | `409` |
| `REASON_REQUIRED` | `422` |
| `NOTHING_TO_REVOKE` | `409` |

A step-up denial raises `StepUpRequiredError`; `install_security_context`
registers the handler that renders
`{"type": "https://airops.dss/errors/step-up-required", "title": "Precondition Required", "status": 428, "detail": "...", "instance": "..."}`.
Clients may branch on the `428` status or the body `type`. An accepted duplicate
approval returns `None` and must not re-apply the plan.

## 5. Operator resolution

Replace every `body.operator` trust point with:

```python
operator = resolve_operator(identity, body.operator, context=security, path=request.url.path)
```

- `AUTH_ENABLED=true`: returns the token username. A differing body value is
  audited as `SPOOF_ATTEMPT` and ignored.
- `AUTH_ENABLED=false`: honours the body value for demos, falling back to
  `demo_default_operator` (`demo-commander`).

Apply this to event injection, decisions, approvals, scenario runs, sim control,
demo scripts and audit entries. Do not write a body operator directly into the
audit chain.

## 6. Approval state

When a recommendation is created, classify it and attach the state in memory
(or on the recommendation record if B8 adds the optional fields):

```python
assessment = classify_high_impact(
    recommendation,
    {mission.id: mission.priority for mission in state.missions},
    settings=security.settings,
)
approval = initial_state(
    required_approvals(
        high_impact=assessment.high_impact,
        approver_is_modifier=False,
        settings=security.settings,
    )
)
```

On a decision:

```python
if decision == "approve":
    outcome = evaluate_approval(
        approval_state,
        identity,
        now=security.clock(),
        high_impact=assessment.high_impact,
        trigger_operator=trigger_event.operator,
        modifier_operator=modification_author,
        settings=security.settings,
        require_step_up=security.auth_enabled,
    )
elif decision == "reject":
    outcome = evaluate_rejection(
        approval_state,
        identity,
        now=security.clock(),
        trigger_operator=trigger_event.operator,
        settings=security.settings,
        reason=body.reason,
        require_step_up=security.auth_enabled,
    )
```

- Apply the plan only when `outcome.apply_plan` is true.
- Map `outcome.next_recommendation_status` onto the existing
  `pending`/`approved`/`rejected` status. Do **not** invent a new status.
- Keep the state pending after the first commander on a two-person approval and
  expose `approvalsRequired` + `approvals` from `approval_fields(outcome.state)`.
- Rejections require a reason and end the recommendation.
- `revoke_approval` removes the acting commander's approval and returns to
  pending.
- Record approval and revocation events through the audit sink.

The `approvalsRequired` / `approvals` fields are optional contract additions;
the current frontend validator tolerates them only after the shared model and
contract are updated.

## 7. Audit sink

Implement an adapter from `AuditSink.record(SecurityAuditEvent)` to the
hash-chained `AuditEntry` store. The adapter owns `AUD-*` IDs, canonical JSON and
the previous hash; the security package owns the action and sanitised details.
Map `operator` to the resolved identity and never include passwords, PINs,
password hashes or tokens in `details`.

Suggested action names in the existing audit chain (contract-change candidate):
`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOGIN_LOCKED`, `LOGOUT`,
`TOKEN_REFRESHED`, `ACCESS_DENIED`, `STEP_UP_SUCCESS`, `STEP_UP_FAILURE`,
`APPROVAL_RECORDED`, `APPROVAL_REVOKED`, `ROLE_CHANGED`, `SPOOF_ATTEMPT`.

## 8. WebSocket

Call `authenticate_websocket` before sending `SNAPSHOT`:

```python
from app.security.ws_auth import authenticate_websocket, enforce_client_message

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    identity = await authenticate_websocket(websocket, security)
    if identity is None:
        return
    # authenticate_websocket already accepted the socket.
    await send_snapshot(websocket)
    while True:
        message = await websocket.receive_json()
        if not await enforce_client_message(websocket, security, identity, message.get("type", "")):
            return
        ...
```

The frontend must supply the token by one of:

1. `Sec-WebSocket-Protocol: bearer.<jwt>` (preferred), or
2. a first message `{"type": "AUTH", "token": "<jwt>"}` (preferred where the
   subprotocol is awkward for the client); the server accepts, authenticates,
   then starts the stream.

A `?token=<jwt>` query parameter still works for tooling and tests but is not
part of the frontend contract (tokens can leak into logs).

Observer and auditor may only send `PING`; any other client message closes with
4403. No snapshot is sent before authentication.

## 9. Settings

`SecuritySettings` reads the same `AUTH_ENABLED` and `JWT_SECRET` names as
`app/config.py`. When `AUTH_ENABLED=true`:

- `JWT_SECRET` must be supplied from the environment,
- the built-in `dev-only-change-me` value is rejected,
- the secret must be at least 32 characters.

B8 should make `app/config.py` delegate to `SecuritySettings` (or remove its
duplicate auth fields) so there is one source of truth. A test in
`tests/security/test_settings.py` fails if the class defaults diverge.

## 10. Frontend changes required

The frontend currently has no auth flow. These are the exact touch points:

1. **`frontend/src/services/apiClient.ts`**
   - Send `Authorization: Bearer <accessToken>` on every `/api` request.
   - On `401`, attempt one refresh through `/api/auth/refresh`, then retry once;
     if refresh fails, clear the session and show the login screen.
   - On `403`, show a permission message; do not retry.
   - Add the login/refresh/logout/step-up calls.
2. **Login screen**
   - Username/password form against `POST /api/auth/login`.
   - Store the access token in memory and refresh token in the safest available
     storage; support logout.
   - Explain that the demo accounts are fictional.
3. **Token on WebSocket**
   - `frontend/src/services/wsClient.ts` must use the `bearer.<jwt>` subprotocol
     or send the `AUTH` first message before expecting `SNAPSHOT` (not the query
     string).
   - Reconnect with backoff must re-authenticate; a 4401 close must not loop.
4. **Step-up dialog**
   - When a decision returns `428` (body `type`
     `https://airops.dss/errors/step-up-required`), ask for the demo PIN and call
     `POST /api/auth/step-up`, then retry the decision once.
   - A wrong PIN from `/auth/step-up` is a `401`; keep the dialog open.
   - Record `428` + the body `type` as the stable step-up signal in
     `docs/API_CONTRACT.md`.
5. **Two-person approvals**
   - Display `approvalsRequired` and the `approvals` list.
   - After the first commander approval, show "awaiting second approver" rather
     than treating the plan as applied.
   - Support approval revocation.
6. **Operator identity**
   - Remove hardcoded `COL. J. MERCER` from `TopBar.tsx`,
     `useKeyboardShortcuts.ts`, `liveDataService.ts`, and any other operator
     default.
   - Populate the operator from `/api/auth/me` (username/display name/role).
   - Stop sending a client-selected operator once auth is enabled; the server
     ignores it (and audits a spoof attempt if it differs).
7. **Role-aware UI**
   - Read the role from `/api/auth/me` and hide/disable actions the role cannot
     perform. Server-side `403` remains the enforcement point; this is only UX.
8. **Audit page**
   - Show the new security actions and the resolved operator. The stale
     `DECISION_APPROVE`/`EVENT_INJECTED` filter values still need fixing in the
     frontend (see `CONTEXT.md` section 0.1 item 8).

## 11. Contract-change candidates

Raise `contract-change` issues for:

- auth endpoints and `TokenResponse` / `UserView` shapes;
- `401` / `403` / `409` / `422` / `423` / `428` error semantics and
  `WWW-Authenticate` / `Retry-After` headers;
- WebSocket `AUTH` first message, query token and subprotocol;
- optional `Recommendation.approvalsRequired` and `Recommendation.approvals`;
- step-up-required error code (`428`) and RFC 7807 body `type`
  (`https://airops.dss/errors/step-up-required`);
- security audit action strings;
- `/api/auth/users` role-management endpoint.

Do not change the existing `RecommendationStatus` enum.

## 12. Verification

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/security -q
.\.venv\Scripts\python.exe -m ruff check app/security tests/security
.\.venv\Scripts\python.exe -m mypy app/security tests/security
.\.venv\Scripts\python.exe -m app.security.matrix --check
```

After wiring, add integration tests that exercise the real routes end to end:
login -> inject event -> recommendation -> approve (two-person) -> audit chain
verification, plus a WebSocket handshake with a token and a `401` on the same
route without one.
