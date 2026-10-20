# API implemented through B8b

Status: **state store, sim clock, movement, weather drift, rule-based retasking,
REST and WebSocket, commander decisions, hash-chained audit, staleness, JWT/RBAC
and two-person approvals** (Stages B2, B6a, B8a and B8b). Everything below is
live code under `backend/app/`; shapes are validated against the Pydantic models
exported in `backend/docs/schemas/`.

Authoritative references: `docs/API_CONTRACT.md`, `frontend/src/types/index.ts`,
`frontend/src/lib/contractValidation.ts`. Retask rules are documented in
`docs/RETASK_RULES.md`; known deviations and stubs are listed at the bottom as
contract-change candidates.

## REST

Base path `/api`. All responses are `application/json`; errors are RFC 7807
problem details and never contain stack traces.

With `AUTH_ENABLED=true`, every route below except `/health` and `/auth/login`
requires `Authorization: Bearer <accessToken>` and the permission mapped in
`app/api/routes.py`. Missing/invalid tokens are `401`; insufficient permission
is `403`. With `AUTH_ENABLED=false`, callers are the demo commander and the
original behaviour is unchanged. Security routes: `POST /auth/login`,
`POST /auth/refresh`, `POST /auth/logout`, `POST /auth/step-up`, `GET /auth/me`,
plus `GET /auth/users` and `PATCH /auth/users/{id}/role` for `sys_admin`.

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/health` | 200 | `{status, version, simTime, solverReady}`; `simTime` is an ISO-8601 UTC string, `solverReady` is `false` until B5 |
| GET | `/snapshot` | 200 | Full `WireSnapshot`: arrays for every collection, `bounds`, `sim {time, speed, paused}`, `stateVersion`, `activeEvents`, and the SQLite `auditLog` (three baseline blocks). Matches `shared/seed/world.json` at t0 except for `auditLog` |
| POST | `/sim/control` | 200 | Body `{action, speed?}` with `action` in `pause|resume|speed|reset` and `speed` in `1|5|20` (required for `speed`). Returns `{simTime, speed, paused}`. `reset` reloads the seed, clears recommendations/alerts/scenarios (none of the latter exist yet), invalidates in-flight retasking, keeps the audit log, bumps `stateVersion`, then broadcasts a fresh `SNAPSHOT` |
| POST | `/events` | 201 | Body `{type, payload, severity?, operator?, description?}`; returns the **full `OpsEvent`** with `id` (`EV-0001`, ...) and sim-clock `timestamp`. Unknown referenced ids → 404, malformed payloads → 422. Retasking runs asynchronously after the response |
| GET | `/recommendations?status=` | 200 | Stored pending/decided recommendations (B6a emits `pending` only), optional status filter |
| GET | `/recommendations/{id}` | 200 | One recommendation; 404 when unknown |
| GET | `/missions/{id}/eligible-resources` | 200 | `{aircraft: [...], crew: [...]}` feasible for the Modify dropdowns; 404 for an unknown mission |
| POST | `/recommendations/{id}/validate-modification` | 200 | Body is the **raw** modifications object (`{aircraftSwap?,crewSwap?}` or the array shape); returns `{conflicts,score,tradeoffs,valid}` and applies nothing |
| POST | `/recommendations/{id}/decision` | 200 | Body `{decision:"approve"\|"reject"\|"modify", reason?, modifications?, operator?}`. Returns the updated `Recommendation`. Reject requires a reason (422). Stale/expired approval returns 409 `https://airops.dss/errors/stale-recommendation`; invalid modification returns 422 with `violations`; repeated identical decisions are idempotent. With auth on, a fresh step-up is required (`428`) and high-impact recommendations stay `pending` until a second commander approves |
| POST | `/recommendations/{id}/approvals/revoke` | 200 | Auth-on only: retract the acting commander's own pending approval; returns the recommendation and audits `APPROVAL_REVOKED` |
| GET | `/audit` | 200 | Chronological hash-chained entries. Filters `operator`, `action`, `from`, `to`; `limit` 1–1000 (default 100), `offset`; `X-Total-Count` header; `format=csv` exports the same page |
| GET | `/audit/verify` | 200 | Recomputes the SHA-256 chain: `{valid, brokenLinkIndex, message}` |
| GET | `/demo-scripts` | 200 | Two catalogued scripts with `name`/`description` |
| POST | `/demo-scripts/{name}/run?reset=` | 200 | Starts a script in the background and returns `{status:"started", eventCount}`; `reset=true` restores the clean seed first. 404 unknown, 409 already running |

### Event effects (factual only)

`POST /events` applies the factual effect, appends the event to `activeEvents`,
bumps `stateVersion` by exactly 1 and broadcasts. Impact analysis and the
recommendation are produced afterwards by the async pipeline; **the live plan is
never changed by retasking**. Only an explicit approve/modify decision applies a
recommendation, and that application commits once through the store.

| Event | Effect |
|---|---|
| `THREAT_DETECTED` | New threat with a **new** id (`THR-05` and up, baseline `THR-01..04` untouched), `status: active`; `confidence` defaults to `0.9`; `EW` normalises to `radar` (Q1) |
| `AIRCRAFT_UNSERVICEABLE` | Aircraft → `unserviceable` (404 if unknown) |
| `BASE_CLOSED` | Base runway → `closed` (`runwayStatus` defaults to `closed`; `durationHours` accepted and ignored until B4) |
| `WEATHER_DEGRADED` | Matching weather entry (by `baseId`/`region`) updated (404 if none) |
| `CREW_UNAVAILABLE` | Crew → `unavailable` (404 if unknown) |
| `NEW_PRIORITY_MISSION` | New `planned` mission (`M-11`, ...): window starts at the event time, default 3 h (`durationHours` overrides), route = launch base → target, no assignment |

## Decisions, staleness and audit

- **Approve** re-validates the recommendation against the current state, applies
  the `Change` list once, marks the recommendation `approved`, bumps
  `stateVersion` once, emits `ENTITY_UPDATE`, `RECOMMENDATION_UPDATED` and then
  `AUDIT_APPENDED` (`DECISION_APPROVED`). A recommendation already `approved`
  returns 200 unchanged; a conflicting decision returns 409. With auth on, the
  first approval records `APPROVAL_RECORDED` on the security audit sink and
  leaves the recommendation `pending` when two approvers are required; the plan
  is applied only by the final distinct commander. The triggering operator
  cannot decide their own event, and every decision requires a fresh step-up.
- **Reject** requires a non-empty reason (`422`), marks the recommendation
  `rejected`, leaves the plan and `stateVersion` untouched, and audits
  `DECISION_REJECTED`.
- **Modify** merges the manual `aircraftSwap`/`crewSwap` into the proposed
  changes, validates them, applies the plan once and audits
  `DECISION_MODIFIED`. Invalid swaps return `422` with RFC 7807
  `application/problem+json` and a `violations` array.
- **Validate-modification** runs the same checks and returns
  `{conflicts, score, tradeoffs, valid}` without changing the store.
- **Staleness:** pending recommendations become `stale` when a committed change
  touches their proposed mission plan, assigned airframe/crew, launch-base
  runway, a tracked threat, or a new threat intersecting the proposed route.
  Position/fuel/clock ticks never stale them. `RECOMMENDATION_STALE` is audited
  and `RECOMMENDATION_UPDATED` is broadcast. Pending recommendations expire
  after `RECO_TTL_MIN` (default 90 sim minutes) and audit
  `RECOMMENDATION_EXPIRED`.
- **Audit** is an SQLite append-only SHA-256 chain; see `docs/AUDIT.md` for the
  exact canonicalisation, baseline blocks and verification command. Reset keeps
  the chain; it never rewrites or deletes entries.

## WebSocket

`/ws`, one JSON envelope per frame:

```json
{ "type": "CLOCK_TICK", "payload": { "simTime": "2026-10-17T12:00:01.000Z", "speed": 1, "paused": false }, "ts": "2026-10-17T12:00:01.000Z", "stateVersion": 1 }
```

`ts` is the sim clock. `stateVersion` semantics:

- `SNAPSHOT`, `ENTITY_UPDATE`, `EVENT_INJECTED` carry the version they produce
  (`+1` per change);
- `CLOCK_TICK`, `POSITION_TICK`, `HEARTBEAT` carry the **current** version
  without bumping it (matches `liveDataService.ts`);
- retask frames carry the current version too; storing a recommendation does
  not bump it.

| Frame | When | Payload |
|---|---|---|
| `SNAPSHOT` | on connect (always first) and after reset | full `WireSnapshot` |
| `CLOCK_TICK` | every wall second (about) | `{simTime, speed, paused}` |
| `POSITION_TICK` | every wall second when aircraft are airborne | array of `{id, position, heading, speed, fuelPct}` |
| `ENTITY_UPDATE` | after an event or a sim status transition | partial `{bases?|aircraft?|crew?|missions?|airspace?|threats?|weather?}` arrays (upserts only) |
| `EVENT_INJECTED` | on `POST /events`, before the matching `ENTITY_UPDATE` | the full `OpsEvent` |
| `IMPACT_ANALYSIS` | after the event effect, before progress | `{eventId, eventType, impactedMissionIds, reasons, mostUrgent, timeToDecisionMin}` |
| `ALERT` | once per analysed event | `OperationalAlert` (`id="<event>-AL"`) |
| `RETASK_PROGRESS` | four analysis stages, then ready | `{isReplanActive, stage, elapsedMs, message}` |
| `RECOMMENDATION_READY` | when the analysis completes | full `Recommendation` (with alternatives) |
| `RECOMMENDATION_UPDATED` | approve/reject/modify, stale or expiry | full updated `Recommendation`; decision frames use the post-commit version |
| `AUDIT_APPENDED` | after every audit append | full `AuditEntry` (the frontend appends it to its audit store) |
| `HEARTBEAT` | every 5 wall seconds | `{}` |

Client frames: `{"type": "PING"}` is accepted and ignored; unknown client
message types are ignored for operational roles, never fatal. With auth on,
authenticate with `Sec-WebSocket-Protocol: bearer.<jwt>` or a first
`{"type":"AUTH","token":"..."}` message before `SNAPSHOT`; query tokens are
rejected. Observer/auditor may only send `PING` (otherwise close `4403`).

Example `POSITION_TICK`:

```json
{ "type": "POSITION_TICK", "payload": [ { "id": "AC-01", "position": { "lat": 5.02, "lng": 5.97 }, "heading": 72.4, "speed": 900.0, "fuelPct": 91.9969 } ], "ts": "2026-10-17T12:00:01.000Z", "stateVersion": 1 }
```

Example `ENTITY_UPDATE` after a SAM injection:

```json
{ "type": "ENTITY_UPDATE", "payload": { "threats": [ { "id": "THR-05", "type": "SAM", "position": { "lat": 4.9, "lng": 7.6 }, "rangeKm": 85, "confidence": 0.9, "lastSeen": "2026-10-17T12:00:05.000Z", "status": "active" } ] }, "ts": "2026-10-17T12:00:05.000Z", "stateVersion": 2 }
```

### Backpressure

Each client has a bounded queue (default 256, `WS_QUEUE_SIZE`). When a client
falls behind, the oldest droppable frame (`POSITION_TICK`/`CLOCK_TICK`/
`HEARTBEAT`) is discarded before any state-carrying frame; a slow client never
stalls the server or other clients.

## Simulation behaviour

- **Clock**: starts at the seed time, speeds `1|5|20`; one wall-clock second per
  tick advances sim time by `speed` sim seconds. Paused ticks are no-ops.
- **Movement**: `approved` missions launch when their window opens (aircraft
  `airborne`, crew `on-mission`); aircraft fly the mission route at type cruise
  speed (900/850/520/700/260 km/h, i.e. ~486/459/281/378/140 kts on the wire —
  seed speeds are knots), burning fuel (11/10/6/8/9 %/h) and logging flight
  hours; at window end missions complete and airframes enter a 45 min
  `turnaround` before returning to `serviceable`. `planned` missions never
  auto-launch (no planning until B6a).
- **Weather**: deterministic per-base sinusoids (visibility ±12 %, wind ±15 %)
  around the seed baseline. Drift never escalates severity on its own
  (`nominal` ↔ `caution`); operator-set `severe` is preserved until reset.
- **Baseline invariant**: the clean seed stays conflict-free (no double booking,
  ≥ 45 min turnaround, ≤ 12 h projected crew duty, nothing at-risk) for at least
  6 sim hours at 20× — enforced by `tests/test_sim_runtime_baseline.py`.

## Contract-change candidates / gaps

1. **Ticks carry the current `stateVersion`** without bumping it; only
   `SNAPSHOT`/`ENTITY_UPDATE`/`EVENT_INJECTED` bump. Matches the frontend
   runtime; the contract prose does not say one way or the other.
2. **Reset is communicated as a fresh `SNAPSHOT`** (with a bumped version),
   because `ENTITY_UPDATE` is upsert-only and cannot delete injected threats.
3. **Crew `dutyHoursLast24h` is not incremented by the sim** (deferred to B4):
   the frontend's conflict check adds sortie duration to this field, so growing
   it every tick would break the "baseline stays clean" invariant.
4. **Weather drift is not broadcast via `ENTITY_UPDATE`** (the frontend ignores
   weather there); drift appears in snapshots only. `WEATHER_DEGRADED` events do
   emit their weather entry.
5. `GET /snapshot` matches `shared/seed/world.json` at t0 **except** for
   `auditLog`, which carries the three SQLite baseline blocks (test
   `test_snapshot_matches_seed_except_for_the_audit_genesis`). Entity order
   follows seed order and is not otherwise guaranteed.
6. `NEW_PRIORITY_MISSION` defaults (3 h window, no quals/weapons, empty
   assignment, `M-nn` ids) are backend assumptions until the optimiser exists;
   B6a assigns resources in the recommendation only.
7. `AUD-0003` baseline details use plain ASCII (`4.80N 7.50E`) while the
   frontend mock contains a literal U+FFFD; ids/actions/operators/targets and
   timestamps match. Real SHA-256 hashes replace the mock's placeholder chain.
8. `POST /sim/control` `reset` keeps the audit log but clears recommendations,
   alerts and scenarios; the contract mentions only "clears recommendations,
   alerts and scenarios".
9. `BASE_CLOSED` and `WEATHER_DEGRADED` event effects are factual state changes;
   their durations are accepted but not independently restored/persisted until
   B4/B5.
10. `RetaskProgress` frames are padded by `RETASK_MIN_STAGE_MS` (default 600 ms)
    so the UI animation is visible; tests set it to 0.
11. The optional `AUTO_REEVALUATE` policy is not enabled in B8a: stale
    recommendations remain visible for re-injection or a fresh event-driven
    analysis. `supersedesId` is not emitted yet (contract-change candidate).
12. Alternative ids (for example `REC-0001-ALT1`) are display-only. The frontend
    has no decision path for them; only the primary id can be approved, rejected
    or modified.
13. Auth-on adds `/api/auth/*`, `Authorization` headers, WebSocket AUTH,
    `428` step-up responses and optional `approvalsRequired`/`approvals` fields.
    These are contract-change candidates tracked in issue #13; the auth-off wire
    shape is unchanged.

## How to run and verify

```powershell
cd backend
python tasks.py install          # once
python tasks.py run              # uvicorn on :8000 with reload
python tasks.py check            # ruff + mypy (strict) + pytest
python scripts/ws_listen.py --duration 30   # print live WS frames
python scripts/demo_dump.py      # both demo scripts, full recommendation artefacts
python scripts/full_loop.py --demo all      # live reset -> demo -> approve -> audit
python scripts/verify_audit.py   # independent stdlib-only chain verification
```

## Measured performance (dev laptop, single uvicorn worker)

| Metric | Value |
|---|---|
| `GET /snapshot` over HTTP, 60 samples | median 4.4 ms, p95 6.6 ms (target < 200 ms) |
| `GET /health` over HTTP, 60 samples | median 2.4 ms, p95 3.9 ms |
| `engine.tick` (24 aircraft, 10 missions), 2000 samples | median 0.13 ms, p95 0.27 ms |
| `runtime.broadcast_tick` with no clients, 2000 samples | median 0.21 ms, p95 0.42 ms |
| B6a `analyse_impact` (threat demo), 50 samples | median 0.12 ms, p95 0.21 ms (target < 300 ms) |
| B6a `RuleBasedEngine.propose` (threat demo), 50 samples | median 15.8 ms, p95 20.1 ms (target < 5 s) |

At the 1 Hz tick rate the sim loops cost well under 0.1 % of one core.
