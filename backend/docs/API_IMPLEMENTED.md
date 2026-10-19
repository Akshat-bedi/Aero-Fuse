# API implemented in B2

Status: **state store, sim clock, movement, weather drift, REST and WebSocket**
(Stage B2). Everything below is live code under `backend/app/`; shapes are
validated against the Pydantic models exported in `backend/docs/schemas/`.

Authoritative references: `docs/API_CONTRACT.md`, `frontend/src/types/index.ts`,
`frontend/src/lib/contractValidation.ts`. Known deviations and stubs are listed
at the bottom as contract-change candidates.

## REST

Base path `/api`. All responses are `application/json`; errors are RFC 7807
problem details and never contain stack traces.

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/health` | 200 | `{status, version, simTime, solverReady}`; `simTime` is an ISO-8601 UTC string, `solverReady` is `false` until B5 |
| GET | `/snapshot` | 200 | Full `WireSnapshot`: arrays for every collection, `bounds`, `sim {time, speed, paused}`, `stateVersion`, `activeEvents`; byte-identical to `shared/seed/world.json` at t0 |
| POST | `/sim/control` | 200 | Body `{action, speed?}` with `action` in `pause|resume|speed|reset` and `speed` in `1|5|20` (required for `speed`). Returns `{simTime, speed, paused}`. `reset` reloads the seed, clears pending recommendations/alerts/scenarios (none exist yet), keeps the audit log, bumps `stateVersion`, then broadcasts a fresh `SNAPSHOT` |
| POST | `/events` | 201 | Body `{type, payload, severity?, operator?, description?}`; returns the **full `OpsEvent`** with `id` (`EV-0001`, ...) and sim-clock `timestamp`. Unknown referenced ids → 404, malformed payloads → 422 |
| GET | `/audit` | 200 | `[]` until B8 (hash chain) |
| GET | `/demo-scripts` | 200 | `[]` until B6a |

### Event effects (factual only)

`POST /events` applies the factual effect, appends the event to `activeEvents`,
bumps `stateVersion` by exactly 1 and broadcasts. No recommendation, impact
analysis or risk marking happens here (B6a/B6b).

| Event | Effect |
|---|---|
| `THREAT_DETECTED` | New threat with a **new** id (`THR-05` and up, baseline `THR-01..04` untouched), `status: active`; `confidence` defaults to `0.9`; `EW` normalises to `radar` (Q1) |
| `AIRCRAFT_UNSERVICEABLE` | Aircraft → `unserviceable` (404 if unknown) |
| `BASE_CLOSED` | Base runway → `closed` (`runwayStatus` defaults to `closed`; `durationHours` accepted and ignored until B4) |
| `WEATHER_DEGRADED` | Matching weather entry (by `baseId`/`region`) updated (404 if none) |
| `CREW_UNAVAILABLE` | Crew → `unavailable` (404 if unknown) |
| `NEW_PRIORITY_MISSION` | New `planned` mission (`M-11`, ...): window starts at the event time, default 3 h (`durationHours` overrides), route = launch base → target, no assignment |

## WebSocket

`/ws`, one JSON envelope per frame:

```json
{ "type": "CLOCK_TICK", "payload": { "simTime": "2026-10-17T12:00:01.000Z", "speed": 1, "paused": false }, "ts": "2026-10-17T12:00:01.000Z", "stateVersion": 1 }
```

`ts` is the sim clock. `stateVersion` semantics:

- `SNAPSHOT`, `ENTITY_UPDATE`, `EVENT_INJECTED` carry the version they produce
  (`+1` per change);
- `CLOCK_TICK`, `POSITION_TICK`, `HEARTBEAT` carry the **current** version
  without bumping it (matches `liveDataService.ts`).

| Frame | When | Payload |
|---|---|---|
| `SNAPSHOT` | on connect (always first) and after reset | full `WireSnapshot` |
| `CLOCK_TICK` | every wall second (about) | `{simTime, speed, paused}` |
| `POSITION_TICK` | every wall second when aircraft are airborne | array of `{id, position, heading, speed, fuelPct}` |
| `ENTITY_UPDATE` | after an event or a sim status transition | partial `{bases?|aircraft?|crew?|missions?|airspace?|threats?|weather?}` arrays (upserts only) |
| `EVENT_INJECTED` | on `POST /events`, before the matching `ENTITY_UPDATE` | the full `OpsEvent` |
| `HEARTBEAT` | every 5 wall seconds | `{}` |

Client frames: `{"type": "PING"}` is accepted and ignored; unknown client
message types are ignored, never fatal.

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
5. `GET /audit` and `GET /demo-scripts` are **stubs** (`[]`) until B8/B6a;
   `GET /snapshot.recommendations` is always `[]` until B6a.
6. `NEW_PRIORITY_MISSION` defaults (3 h window, no quals/weapons, empty
   assignment, `M-nn` ids) are backend assumptions until the optimiser exists.
7. `GET /snapshot` equals `shared/seed/world.json` at t0 (test
   `test_snapshot_matches_seed_exactly_at_t0`); entity order follows seed order
   and is not otherwise guaranteed.
8. `POST /sim/control` `reset` keeps the audit log but clears recommendations,
   alerts and scenarios; the contract mentions only "clears recommendations,
   alerts and scenarios".

## How to run and verify

```powershell
cd backend
python tasks.py install          # once
python tasks.py run              # uvicorn on :8000 with reload
python tasks.py check            # ruff + mypy (strict) + pytest
python scripts/ws_listen.py --duration 30   # print live WS frames
```

## Measured performance (B2, dev laptop, single uvicorn worker)

| Metric | Value |
|---|---|
| `GET /snapshot` over HTTP, 60 samples | median 4.4 ms, p95 6.6 ms (target < 200 ms) |
| `GET /health` over HTTP, 60 samples | median 2.4 ms, p95 3.9 ms |
| `engine.tick` (24 aircraft, 10 missions), 2000 samples | median 0.13 ms, p95 0.27 ms |
| `runtime.broadcast_tick` with no clients, 2000 samples | median 0.21 ms, p95 0.42 ms |

At the 1 Hz tick rate the sim loops cost well under 0.1 % of one core.
