# AirOps DSS - Security Package

> Fictional simulation only. This package demonstrates human-in-the-loop
> access control, session handling and approval safeguards for the AirOps DSS
> demo. It is not a real military authorisation system and must not be used to
> protect real operations.

The package lives in `backend/app/security/` with tests in
`backend/tests/security/`. It is wired into `app/main.py` (B8b): REST and
WebSocket routes enforce permissions, decisions use the approval state machine,
and security events append to the hash-chained audit log. With
`AUTH_ENABLED=false` the original demo behaviour is unchanged. See
[`SECURITY_WIRING.md`](SECURITY_WIRING.md) for the wiring details and frontend
changes.

## What is implemented

| Area | Module | Behaviour |
| :--- | :--- | :--- |
| Roles and permissions | `policy.py` | Seven roles, declarative permission table, per-event-type injection, pure `is_allowed`. |
| Generated matrix | `matrix.py` | `ACCESS_MATRIX.md` rendered from the table; drift test + `--check`. |
| Settings | `settings.py` | `AUTH_ENABLED` / `JWT_SECRET` parity with `app/config.py`; secret hardening. |
| Demo users | `users.py` | 8 seeded fictional accounts, stdlib `scrypt`, lockout with timed unlock. |
| Tokens and sessions | `tokens.py` | HS256 access/refresh JWTs, refresh rotation, absolute session limit, revocation. |
| Authentication | `auth.py` | Login, refresh, logout, step-up, role change; generic failure messages. |
| FastAPI adapters | `deps.py` | `SecurityContext`, `require(permission)`, `resolve_operator`, `/auth/*` router. |
| WebSocket auth | `ws_auth.py` | Subprotocol/first-message token; query tokens rejected in secure mode; read-only `PING`; 4401/4403 closes. |
| Approvals | `approvals.py` | High-impact classification, separation of duties, two-person approval, revocation. |
| Audit events | `audit_events.py` | Sanitised security events through a small `AuditSink` protocol. |

## Roles and permissions

Roles are declared in `Role`; the full matrix is generated in
[`ACCESS_MATRIX.md`](ACCESS_MATRIX.md). Summary:

- `observer` - read-only.
- `intel_officer` - read + `THREAT_DETECTED` only.
- `maintenance_officer` - read + `AIRCRAFT_UNSERVICEABLE` only.
- `ops_planner` - read, any event, scenarios, demo scripts, sim speed/pause/resume, modification validation.
- `commander` - planner capabilities plus `SIM_RESET` and approve/reject/modify.
- `auditor` - read + read/export/verify audit. No operational permission.
- `sys_admin` - read + user management. No operational permission.

Only a commander can approve, reject or modify a recommendation. A non-commander
cannot gain a decision permission even if an `Identity` carries an extra
permission grant. `sys_admin` and `auditor` are explicitly denied every
operational permission.

Event injection is additionally restricted by `EventType` through
`EVENT_TYPE_GRANTS` and `is_allowed(..., AccessContext(event_type=...))`.
`POST /events` style handlers must use `enforce_event_injection` or
`Depends(require_event_injection())`; checking only `INJECT_EVENT` is not enough.

## Authentication modes

### Demo mode (`AUTH_ENABLED=false`, default)

- No bearer token is required.
- Every caller resolves to the demo commander (`demo_default_operator`, default
  `demo-commander`).
- Event/decision bodies may carry an `operator` string for display; the
  configured demo fallback is used when it is absent.
- Login/token routes still work but are not required.

### Auth enabled (`AUTH_ENABLED=true`)

- Every protected route requires `Authorization: Bearer <access token>`.
- The operator is the token's username. A body `operator` is ignored; if it
  differs from both the token username and display name, a `SPOOF_ATTEMPT`
  audit event is recorded.
- Missing, malformed, expired, revoked or stale tokens produce a generic `401`
  with `WWW-Authenticate: Bearer`.
- Weak secrets are refused at startup. `JWT_SECRET` must come from the
  environment, must not be the built-in demo default, and must be at least
  32 characters. The package reads the same env names as `app/config.py`; a
  test fails if their defaults diverge.

### HTTP status semantics

| Status | Meaning |
| :--- | :--- |
| `401` | Missing, malformed, expired or revoked credentials; wrong step-up PIN. |
| `403` | Authenticated but the role/event type/action is not permitted. |
| `409` | The recommendation was already decided, or there is no approval to revoke. |
| `422` | Malformed body, unknown decision/sim action, or a missing rejection reason. |
| `423` | Account temporarily locked (`Retry-After` seconds). |
| `428` | Step-up PIN required for this decision. RFC 7807 body `type` is `https://airops.dss/errors/step-up-required`. |

Decision handlers map `ApprovalOutcome` denials with
`approval_denial_exception` from `deps.py`; it returns `None` for an accepted
attempt and never applies the plan by itself. Step-up denials use
`StepUpRequiredError`; `install_security_context` registers the handler that
renders the RFC 7807 body (`type`, `title`, `status`, `detail`, `instance`), so
clients can branch on the `428` status or the body `type`.

Example:

```powershell
$env:AUTH_ENABLED = "true"
$env:JWT_SECRET = "<at least 32 random characters>"
```

Never commit a real secret or a populated `.env`.

## Demo accounts

All seeded accounts use the fictional password `veridia-demo` and step-up PIN
`4821`. These are demo-only credentials; change or remove them before any real
deployment.

| Username | Role | Display name |
| :--- | :--- | :--- |
| `observer` | observer | FLT LT R. OKAFOR |
| `intel_officer` | intel_officer | SQN LDR A. VOSS |
| `maintenance_officer` | maintenance_officer | FLT LT M. CHEN |
| `ops_planner` | ops_planner | WG CDR P. NAIR |
| `commander` | commander | COL. J. MERCER |
| `commander_2` | commander | COL. S. ADEYEMI |
| `auditor` | auditor | MR. K. IBRAHIM |
| `sys_admin` | sys_admin | MS. L. DUBOIS |

The second commander exists so the demo can complete a two-person approval.

## Tokens and sessions

- Algorithm: HS256 only (PyJWT, already a project dependency).
- Issuer/audience: `airops-dss` / `airops-dss-api`.
- Access token TTL: 15 minutes by default.
- Refresh token TTL: 8 hours by default.
- Absolute session limit: 12 hours by default; access/refresh expiry is capped
  by it.
- Refresh rotation: the old refresh token stops working after a successful
  refresh; reuse is rejected.
- Logout revokes the session; role changes revoke all sessions for the user and
  bump the token version, making old tokens stale.
- Token validation uses the injected clock, not the machine wall clock, so the
  simulation remains deterministic.
- Failed logins lock the account for 5 minutes after 5 failures by default. The
  lockout response is `423` with `Retry-After`.

The user store and sessions are in memory and reset on restart. That is
intentional for the demo; B8 can replace the store with a persistent directory.

## Step-up

Approve, reject and modify decisions can require a fresh step-up. The default
window is 5 minutes. `POST /api/auth/step-up` verifies the user's demo PIN and
marks the current server-side session; existing access tokens then report the
new `step_up_at` on their next validation.

Step-up checks live in `approvals.evaluate_approval` /
`evaluate_rejection`; the API layer should call them with
`require_step_up=context.auth_enabled` so demo mode does not block on a PIN.

## Approval rules

High impact (two distinct commanders when `two_person_required=true`):

- a `cancel` or `delay` change on a P1 mission;
- a relaxed fatigue/duty/crew-rest margin;
- at least `high_impact_mission_threshold` (default 3) impacted missions;
- a no-feasible-plan result.

A commander who authored a modification can never be the sole approver, even
for a normal recommendation. Separation of duties also prevents the commander
who injected the triggering event from approving or rejecting it. A rejection
by any eligible commander ends the recommendation; a commander's own approval
can be revoked, returning the recommendation to pending.

The existing wire `RecommendationStatus` (`pending`, `approved`, `rejected`,
`modified`, `stale`, `expired`) is **not** changed. Optional
`approvalsRequired` and `approvals` fields are exposed by
`approval_fields`; adding them to the shared model is a contract-change
candidate.

## Audit events

`SecurityAuditEvent` carries `action`, `operator`, `target_id`, `timestamp` and
non-secret `details`. Actions:

`LOGIN_SUCCESS`, `LOGIN_FAILURE`, `LOCKOUT`, `LOGOUT`,
`TOKEN_REFRESHED`, `ACCESS_DENIED`, `STEP_UP_SUCCESS`, `STEP_UP_FAILURE`,
`APPROVAL_RECORDED`, `APPROVAL_REVOKED`, `ROLE_CHANGED`, `SPOOF_ATTEMPT`.

`audit_events.py` provides an `AuditSink` protocol, `InMemoryAuditSink` (tests),
`NullAuditSink` (explicit no-op) and constructors. `app/audit/security_sink.py`
adapts the sink to the hash-chained `AuditEntry` store during app startup.
Passwords, PINs, password hashes and tokens are never placed in event details.

## WebSocket

`authenticate_websocket` owns the handshake and accepts the socket on success.
Do **not** call `accept` again afterward. The frontend contract uses:

- `Sec-WebSocket-Protocol: bearer.<jwt>` (preferred); or
- a first message `{"type": "AUTH", "token": "<jwt>"}` (or the token under
  `payload.token`). The server accepts, reads that message, then continues or
  closes with `4401`.

A `?token=<jwt>` query parameter is **rejected** when authentication is enabled,
so tokens cannot leak into access logs or browser history. Access-log messages
also have their query string stripped defensively.

No `SNAPSHOT` is sent before the identity is established. Observer and auditor
may only send `PING`; other client messages close with `4403`.

## Limitations / assumptions

- In-memory user, session and revocation state; no database persistence.
- No MFA, hardware token, IP binding or device binding. The PIN is a demo
  step-up factor only.
- No general rate limiter beyond account lockout; add one at the edge.
- HS256 with one shared secret; rotate the secret and restart sessions to
  invalidate all tokens.
- Query-string WebSocket tokens are rejected in secure mode; use the
  first-message or subprotocol form and TLS in any deployed environment.
- `Settings` inherits `SecuritySettings`, so auth configuration has one source
  of truth. The demo users and sessions are still process-local.
- Roles model a fictional demo; no classification levels, compartments or
  need-to-know handling are implemented.

## Tests and checks

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/security -q
.\.venv\Scripts\python.exe -m ruff check app/security tests/security
.\.venv\Scripts\python.exe -m mypy app/security tests/security
.\.venv\Scripts\python.exe -m app.security.matrix --check
```

The suite covers every role/permission pair, per-event injection, matrix drift,
settings/env parity, secret hardening, scrypt hashing, lockout/unlock, token
expiry and refresh rotation, revocation and role changes, step-up, operator
spoofing, two-person approval, HTTP dependencies/routes and WebSocket auth.

