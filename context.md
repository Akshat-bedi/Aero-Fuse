# AirOps DSS: Project Context (v2)

> Shared brief for **SIH 26250: Air Power – Dynamic Air Operations & Resource Optimisation**.
> v2 reflects what is **actually built** on the frontend (Stages 0–9 plus a military visual theme are done) and what the backend must provide to plug into it.
> Read this fully before writing code. Everything here uses **fictional, simulated data only**.
> Repo: `https://github.com/Akshat-bedi/Aero-Fuse` (monorepo: `frontend/`, `backend/`, `shared/seed/`, `docs/`).

---

## 0. What changed since v1 (read this first)

1. **The frontend now exists and is the source of truth for the data contract.** Authoritative sources, in this order:
   1. `docs/API_CONTRACT.md` (sections 6.1–6.14: entities, enums, endpoints, WebSocket messages, JSON examples)
   2. `frontend/src/types/index.ts` (TypeScript types)
   3. `frontend/src/lib/contractValidation.ts` (runtime validators; the most precise spec of every shape)
   4. `frontend/scripts/fake-backend.mjs` (a working reference server that streams contract-shaped messages)
   If this file and those disagree, **they win**. Tell the frontend dev, who updates the contract in the same PR.
2. **The seed layout is fixed by the frontend mock** (section 10 and `shared/seed/world.json`). The backend seed must reproduce the same IDs, types and mission setup. v1 said `AC-07` is a Fighter-A; **in the built frontend, `AC-07` is a Strike-B (`VR-S07`, assigned to `M-04`)**. The frontend layout wins.
3. **Map bounds are `lat 0–10, lng 0–12`** (fictional "Republic of Veridia"), map centre `lat 5.0, lng 6.0`.
4. **New requirements discovered during frontend work** (all in section 13): `routeOptions` per mission, `alternatives` with per-criterion scores, staleness handling, `RETASK_PROGRESS` staging, scenario result shape, demo-script and reset endpoints, alerts, audit action names, and the 45-minute turnaround and 12-hour duty limits used by the frontend conflict checker.
5. **Clean baseline rule:** the default dataset starts with zero conflicts, zero at-risk missions and zero pending recommendations (an "all green" day). Demos begin from there.
6. **Build strategy changed to "thin vertical slice first":** get the frontend talking to a live backend early with rule-based retasking, then upgrade the engine to CP-SAT (see `ROADMAP.md`).

### 0.1 Known contradictions (open, with chosen defaults)

The Phase 1 audit found places where the prose, `docs/API_CONTRACT.md` and the built frontend disagree. The frontend code and `shared/seed/world.json` are authoritative for now; fix the losing side in the owning PR and open a `contract-change` issue where the contract itself must change.

| # | Contradiction | Chosen default until settled |
|---|---|---|
| 2 | Demo 1 prose says the recommendation "makes one aircraft swap" (for example `AC-07` → `AC-11`); the mock engine emits a reroute-only recommendation. | Follow the runtime mock (reroute only) for the B6a rule-based slice; revisit with the CP-SAT engine in B5. |
| 3 | `M-04`'s name: prose says "Central Precision Strike", `world.json` says "Central Precision Strike Sortie". | Seed wins: "Central Precision Strike Sortie". |
| 4 | `M-04` Route C geometry: use the seed values (`distanceKm` 395, `riskScore` 10) and its 9-waypoint dogleg, not prose approximations. | Seed wins; keep the geometry identical in the backend. |
| 8 | `AuditLogPage.tsx` filter options are `DECISION_APPROVE`/`DECISION_REJECT`/`DECISION_MODIFY`/`EVENT_INJECTED`, but the runtime writes `DECISION_APPROVED`/`DECISION_REJECTED`/`DECISION_MODIFIED`/`INJECT_EVENT`. The exact-match filters therefore miss; the aggregate filters (`DECISIONS_ONLY`, `EVENTS_ONLY`) still work. | Backend emits the runtime strings (section 13 item 10); frontend dev fixes the dropdown values. |
| 9 | `world.json` has an empty `auditLog`, while v2 describes baseline entries `AUD-0001..0003`. | Seed parity ignores audit contents; the backend creates genesis + baseline entries with real SHA-256 in B8. |
| 14 | `frontend/scripts/fake-backend.mjs` still carries v1-shaped data in places. | Use it as a flow/message reference only; `contractValidation.ts` and `world.json` win for payloads. |
| 17 | Alternatives: prose says "return 2 alternatives"; some newer recommendations have fewer. | Return up to 2 alternatives when available; the UI tolerates 0–2. |
| 18 | `WireSnapshot` prose omits `bounds`; `world.json` includes `bounds {minLat,maxLat,minLng,maxLng}`. | Include `bounds` in snapshots; the frontend accepts it. |
| 19 | `GET /health.simTime`: B0 has no clock yet. | Return `null` in B0, then the ISO-8601 sim-time string from B2; `solverReady:false` until B5. |

## 1. Summary and vision

AirOps DSS is a decision-support system for a national Air Force Operations Centre. It fuses data from separate systems (maintenance, crew roster, armament, airspace, weather, intelligence, operations) into one live picture, **optimises** the allocation of aircraft + crew + weapons to missions, **predicts** problems (serviceability, fatigue, fuel, weather), and **dynamically retasks** within seconds when something changes (new threat, aircraft unserviceable, runway closed). It only **recommends**. A human commander approves, modifies or rejects. Every recommendation is explainable and every decision is audited in a tamper-evident log.

**What judges should see (the demo):** a clean "all green" day on a tactical map → inject a SAM threat on Route B → affected missions turn red with a decision countdown → the system "fuses, checks constraints, optimises, ranks" in a few seconds → a ranked recommendation with score, trade-offs, constraints satisfied/relaxed and plain-language reasons → before/after preview on the map and timeline → commander approves → plan updates everywhere → hash-chained audit entry → what-if scenario on a cloned state that never touches the live plan.

**Pitch points:** human-in-the-loop, explainable, offline/air-gapped capable, tamper-evident audit, simulation-safe what-if, multi-source fusion, fictional data only.

## 2. Official problem statement

| Field | Value |
|---|---|
| ID | 26250 |
| Title | Air Power – Dynamic Air Operations & Resource Optimisation |
| Organisation | Ministry of Defence (MoD), Defence Services Staff College |
| Category / Theme | Software / Transportation & Logistics |

**Problem:** Complexity in planning and dynamically retasking air operations in a contested and rapidly changing environment. Information on aircraft availability, crew status, weapon loads, airspace, weather, threats and mission priorities is generated across multiple systems but is not available through a common, real-time decision-support framework, leading to longer planning timelines and sub-optimal allocation of scarce airpower resources.

**Technology opportunity:** AI-enabled decision support, multi-source data fusion, predictive analytics, optimisation algorithms.

## 3. Goals and non-goals

**Goals:** (1) one live fused operational picture via API; (2) an optimiser assigning resources to missions under real constraints; (3) retasking with ranked, explained alternatives in under 5 s; (4) predictive insights; (5) what-if simulation that never touches the live plan; (6) hash-chained audit log; (7) fully offline operation.

**Non-goals:** no autonomous execution; no real military data, bases, order of battle or real equipment designations (use generic names like `Fighter-A`, `GENERIC-AAM-M`); no weapons-employment or targeting logic (resource planning and scheduling only); no UI (frontend teammate).

## 4. Core principles

1. **Human in the loop.** Never change the live plan without an explicit `approve` or `modify` decision.
2. **Explainability.** Score, constraints satisfied, constraints relaxed, trade-offs and plain-language reasons generated from real solver artefacts.
3. **Fictional data only.**
4. **Offline-first.** No outbound network calls, CDNs or model downloads at runtime.
5. **Deterministic.** Seeded randomness; same seed + same event = same recommendation.
6. **Contract stability.** The frontend is built against `docs/API_CONTRACT.md`. Breaking changes need agreement and a `contract-change` issue.
7. **Fail safe.** Infeasible or timed-out optimisation returns a clearly labelled best-effort or "no feasible plan" result, never a silently wrong plan.
8. **Never silently wrong data.** Stale or degraded data is flagged (the frontend shows a STALE banner when no message arrives for 15 s).

## 5. Team, repo and workflow

| Person | Owns |
|---|---|
| Frontend dev | `frontend/` (React + Vite + TS). Done through Stage 9. |
| **Backend dev** | `backend/` (FastAPI). Data model, fusion, optimiser, retasking, predictions, API, audit. |

- Branch per stage: `backend/stage-N-name`. Conventional commits (`feat(scope): ...`). Tag after merge: `be-stage-N-done`. The frontend uses `fe-stage-N-done`.
- Never commit to `main` directly; PR with one approval from the other developer. Never commit `.env`, `*.db`, `node_modules/`, `dist/`, `__pycache__/`.
- Contract changes: GitHub issue labelled `contract-change`, agree, update `docs/API_CONTRACT.md` in the same PR, notify the other person before merging.
- Do not edit files under `frontend/` without telling the frontend dev.

## 6. Current status (as of this version)

**Frontend (done and merged to `main`, tags `fe-stage-0-done` … `fe-stage-9-done`; note: `fe-stage-2-done` was never created):**
- Stage 0 scaffold; Stage 1 design system and shell; Stage 2 types, mock engine and contract; Stage 3 COP map (offline GeoJSON, MapLibre); Stage 4 resource views and predictions; Stage 5 mission board, Gantt timeline and pure conflict detection; Stage 6 event injection, impact analysis, retask progress, before/after and demo scripts; Stage 7 recommendation card with approve/modify/reject and audit log; Stage 8 what-if scenarios; Stage 9 alerts, live data service, stale-data handling, guided demo mode, keyboard shortcuts, error boundaries and an offline check.
- A military C2 visual theme (flat, dense, NATO-style symbology) was applied across the app.
- The frontend runs fully on a mock engine (`VITE_DATA_SOURCE=mock`) and switches to this backend with `VITE_DATA_SOURCE=live`, `VITE_API_BASE_URL=http://localhost:8000/api`, `VITE_WS_URL=ws://localhost:8000/ws`. The frontend origin is `http://localhost:5173` (CORS must allow it).
- The frontend's `LiveDataService` already handles all 13 WebSocket message types, a stale-data detector, version-gap handling and reconnect with backoff.

**Backend:** see `ROADMAP.md` for the stage checklist and the integration plan.

## 7. Architecture

```
 Simulated source systems (adapters, different schemas/units/latency)
 ┌────────────┬──────────┬──────────┬─────────┬────────┬─────────┬──────────┐
 │Maintenance │ Roster   │ Armament │ Airspace│ Met    │ Intel   │ Ops/Tasks│
 └─────┬──────┴────┬─────┴────┬─────┴────┬────┴───┬────┴────┬────┴────┬─────┘
       ▼           ▼          ▼          ▼        ▼         ▼         ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │ FUSION LAYER: normalise → validate → reconcile → freshness/confidence │
 └──────────────────────────────┬────────────────────────────────────────┘
                                ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │ CANONICAL STATE STORE (versioned, in-memory + SQLite persistence)     │
 └───┬─────────────┬───────────────┬─────────────────┬───────────────────┘
     ▼             ▼               ▼                 ▼
 Simulation     Geo/Route      Predictive        Optimiser
 clock+movement risk engine    analytics         (OR-Tools CP-SAT)
     └─────────────┴───────┬───────┴─────────────────┘
                           ▼
              RETASKING ENGINE (event → impact → optimise → rank → explain)
                           ▼
        Recommendation lifecycle + AUDIT LOG (hash-chained) + RBAC
                           ▼
          FastAPI: REST + WebSocket  ──►  React frontend
          (COP, board, timeline, recommendations, scenarios, alerts)
```

## 8. Backend stack and structure

Python 3.11+, FastAPI + Uvicorn (native WebSockets), Pydantic v2 (camelCase aliases on the wire), OR-Tools CP-SAT, Shapely, scikit-learn/numpy/pandas, SQLAlchemy 2 + SQLite (audit, decisions, scenarios; live state in memory), pydantic-settings, pytest + pytest-asyncio + hypothesis, ruff, mypy, Docker (runs with no internet).

```
backend/
  app/{main.py, config.py}
    api/ (routers + ws.py)   domain/ (pydantic models)   fusion/   state/   sim/   geo/
    optimiser/   retask/   predict/   scenarios/   audit/   security/
  tests/   docs/   pyproject.toml   Dockerfile   docker-compose.yml   .env.example
shared/seed/world.json     # exported seed, must match the frontend mock
docs/API_CONTRACT.md       # canonical contract (frontend-maintained)
```

## 9. Conventions

- **JSON:** camelCase on the wire; snake_case in Python (`alias_generator=to_camel`, `populate_by_name=True`).
- **Time:** ISO 8601 UTC strings. The frontend formats Zulu (`1420Z`) only for display. The sim clock is the single time source; never call `datetime.now()` in domain logic.
- **IDs:** `BASE-A`, `AC-07`, `CR-12`, `M-04`, `THR-02`, `AS-03`, `EV-0015`, `REC-0007`, `AUD-0042`, `SCEN-0003`.
- **Units:** km, kts, ft, percentages 0–100, confidence 0–1, fatigue 0–100, durations in minutes unless named otherwise.
- **Coordinates:** `{lat, lng}`; GeoJSON polygons use `[lng, lat]` order.
- **Errors:** RFC 7807 style `{type, title, status, detail}`; no stack traces.
- **Versioning:** monotonically increasing `stateVersion`; snapshots and recommendations record the version they came from. The frontend ignores older versions and requests a fresh snapshot if it sees a gap.

## 10. The fictional world and seed layout (fixed by the frontend mock)

**Republic of Veridia**, bounds `lat 0.0–10.0, lng 0.0–12.0`.

| Entity | IDs | Notes |
|---|---|---|
| Bases (4) | `BASE-A` Sector Alpha Fighter Base; `BASE-B` North Bastion Strike Base; `BASE-C` Charlie Logistics Hub; `BASE-D` Delta Eastern Forward Strip (recon / CSAR) | each has `code`, runway status, fuel stock %, shelter capacity, weather |
| Aircraft (24) | `AC-01..08` Fighter-A; `AC-09..14` Strike-B; `AC-15..18` Transport-C; `AC-19..21` Recon-D; `AC-22..24` Helicopter-E | tail numbers are `VR-<letter><nn>` where the letter is the type (F/S/T/R/H) and `nn` matches the aircraft ID suffix: `VR-F01..F06`, `VR-S07`, `VR-F08`, `VR-S09..S14`, `VR-T15..T18`, `VR-R19..R21`, `VR-H22..H24`. Note `AC-07` is `VR-S07` (Strike-B), not `VR-F07`. About 70% serviceable. |
| Crew (30) | `CR-01..10` fighter pilots; `CR-11..18` strike WSOs; `CR-19..24` recon operators; `CR-25..30` transport captains | callsigns such as VIPER, MAVERICK, BOLT, DAGGER, STORM. Qualifications include `NIGHT_OPS`, `AAM_COMBAT`, `TACTICAL_DATALINK`, `SAR_RADAR`. |
| Missions (10) | `M-01..M-10` | Baseline statuses: 5 in-progress, 4 planned, 1 approved, 0 at-risk, 0 completed. Includes CAP (`M-01` Northern Sentinel, P1, BASE-A), recon (`M-02` Eastern Border Recon Orbit, P2, BASE-D), strike (`M-04` Central Precision Strike Sortie, the SAM demo mission), CAP/QRA (`M-06` Quick Reaction Alert, P1, BASE-A), strike (`M-07` Offensive Counter-Air Sweep, P2, BASE-B), SAR (`M-08` Forward Strip CSAR Standby, P2, BASE-D, requires `SAR_RADAR`). Each mission has route options with both an `id` (`Route A`/`Route B`/`Route C`) and a display `name`, plus `waypoints`, `distanceKm` and `riskScore`. |
| Threats | `THR-01..04` | SAM 65 km, SAM 85 km, a CAP/fighter contact, a radar site. Mix of `active` and `suspected`. |
| Airspace | `AS-01..04` | transit corridor, restricted range, no-fly border buffer, maritime danger area |
| Weapons | stocks per base | generic names (for example `GENERIC-AAM-M`, `GENERIC-AAM-S`, `PGM-Mk2`, a generic anti-radiation type, recon pods, cargo pallets). Use the names in the frontend mock export. |
| Audit | empty in `world.json` | `auditLog` is `[]`; the backend creates genesis (`prevHash` = 64 zeros) and baseline entries with real SHA-256 in B8 (seed parity ignores audit contents). |

**Rules for the seed:** deterministic from `SEED`; baseline plan feasible and conflict-free (no double-booked aircraft/crew, turnaround ≥ 45 min, no crew over the 12 h duty limit, type match, nothing at-risk); `recommendations` empty; `auditLog` empty (the backend adds its own entries in B8).

**Authoritative seed:** `shared/seed/world.json` (exported from the mock engine and committed). The backend seed generator must reproduce it exactly; the seed parity test compares IDs, types, bases, statuses, mission windows and route options (audit contents excluded).

> **Verified baseline caveat:** in `world.json`, `M-04`'s current `route` equals Route B and active `THR-02` (SAM, 85 km) sits at `{lat: 4.8, lng: 7.5}`; Route B's display name says it intersects THR-02 and carries `riskScore` 88. This contradicts the earlier "M-04's baseline route is clear of threats" rule. The seed is authoritative: reproduce it as-is; do not silently move THR-02 or reroute M-04. The frontend still treats the day as "all green" because its conflict checker covers scheduling constraints (statuses 5 in-progress / 4 planned / 1 approved, zero at-risk), not threat geometry. Threat/risk semantics are revisited in B4.

**Range model used by the frontend map (keep consistent):** combat radius about 450 km Fighter-A, 650 km Strike-B, 1100 km Transport-C.

## 11. Domain model

**Enums**
- `AircraftStatus`: `serviceable | maintenance | unserviceable | airborne | turnaround`
- `CrewStatus`: `available | resting | on-mission | unavailable`
- `RunwayStatus`: `open | degraded | closed`
- `MissionType`: `CAP | strike | recon | airlift | SAR | escort`; `MissionStatus`: `planned | approved | in-progress | completed | at-risk | cancelled`; `Priority`: `1|2|3|4`
- `AirspaceType`: `restricted | corridor | no-fly | danger`
- `ThreatType`: `SAM | fighter | radar | AAA`; `ThreatStatus`: `active | suspected | neutralised`
- `Severity`: `nominal | caution | severe`
- `EventType`: `THREAT_DETECTED | AIRCRAFT_UNSERVICEABLE | BASE_CLOSED | WEATHER_DEGRADED | NEW_PRIORITY_MISSION | CREW_UNAVAILABLE`
- `RecommendationStatus`: `pending | approved | rejected | modified | stale | expired`
- `Change.kind`: `aircraft_swap | crew_swap | reroute | delay | cancel | new_assignment`
- `Tradeoff.direction`: `good | bad | neutral`
- `AlertSeverity`: `critical | warning | info`; `AlertType`: `threat | readiness | weather | crew | conflict | prediction | data-quality`

**Entities** (`?` optional; fields marked ★ are frontend extras the backend must also emit or accept)
- **Base**: `id, name, code★, location, runwayStatus, weather: WeatherState, fuelStockPct, shelterCapacity`
- **Aircraft**: `id, tailNumber, callsign★, type, baseId, status, fuelPct, flightHoursToNextService, weaponLoad[{station★?, weaponType, quantity}], position?, heading?, speed?, assignedMissionId?`
- **Crew**: `id, callsign, role, qualifications[], baseId, fatigueIndex, dutyHoursLast24h, status`
- **WeaponStock**: `{baseId, weaponType, quantity}`
- **Mission**: `id, name, type, priority, status, launchBaseId, target{lat,lng,name}, route[], routeOptions★[{id:'Route A'|'Route B'|'Route C', name (display name), waypoints[], distanceKm, riskScore}], windowStart, windowEnd, requiredAircraftType, requiredCrewQuals[], requiredWeapons[{weaponType,quantity}], assigned{aircraftIds[],crewIds[]}, currentWaypointIndex★?`
- **Airspace**: `id, name, type, activeFrom, activeTo, floorFt★, ceilingFt★, polygon (GeoJSON Polygon, [lng,lat])`
- **Threat**: `id, type, position, rangeKm, confidence, lastSeen (ISO), status`
- **WeatherState**: `baseId? | region?, visibilityKm, cloudBaseFt, windKts, severity, forecast[{time(ISO), severity, visibilityKm?, windKts?}]`
- **OpsEvent**: `id, type, payload, timestamp, severity★?, description★?, operator?`
- **Recommendation**: `id, triggerEventId, summary, score(0–100), changes[], impactedMissionIds[], tradeoffs[{label,delta,unit,direction}], explanation[], constraintsSatisfied[], constraintsRelaxed[], alternatives?: Recommendation[], status, createdAt, stateVersion, confidence(0–1), dataFreshnessSec`
- **Change**: `{missionId, kind, before, after, note}`
- **Prediction**: `entityType, entityId, metric, value, confidence, horizonMinutes, createdAt, message`
- **AuditEntry**: `id, timestamp, operator, action, targetId, details, prevHash, hash` (SHA-256 chain, genesis `prevHash` = 64 zeros)
- **Alert** (`ALERT` message): see `OperationalAlert` in `frontend/src/types/index.ts`
- **WireSnapshot**: arrays (not id-keyed objects) for `bases, aircraft, crew, weaponStocks, missions, airspace, threats, weather, recommendations, predictions`, plus `stateVersion`, `sim {time, speed, paused}`, `simTime`, `speedMultiplier`, optional `activeEvents`. The frontend normalises arrays into dictionaries.

**OpsEvent payloads**

| type | payload |
|---|---|
| `THREAT_DETECTED` | `{threatType, position{lat,lng}, rangeKm, confidence}` — the UI sends `threatType` (`SAM`/`Fighter`/`EW`/`Radar`); the backend normalises the value (`EW` → `radar`, lower-case otherwise) and the new threat gets a **new** ID (`THR-05` and up, never overwriting a baseline threat) with `status: 'active'` |
| `AIRCRAFT_UNSERVICEABLE` | `{aircraftId, reason, etrHours?}` |
| `BASE_CLOSED` | `{baseId, runwayStatus, durationHours}` |
| `WEATHER_DEGRADED` | `{baseId?, region?, severity, visibilityKm?, windKts?, durationHours?}` — the UI sends `baseId`, `severity`, `windKts`, `visibilityKm` |
| `NEW_PRIORITY_MISSION` | flat fields, not wrapped in `mission`: `{name, type, priority, launchBaseId, targetCoordinates{lat,lng}, requiredAircraftType}`; backend fills defaults (new `M-xx` ID, route, window, qualifications, weapons) |
| `CREW_UNAVAILABLE` | `{crewId, reason}` |

## 12. API surface (base `/api`, WebSocket `/ws`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | status, version, simTime, speed, solverReady |
| GET | `/snapshot` | `WireSnapshot` |
| POST | `/events` | body `{type, payload, severity?}`; **returns `201` with the full `OpsEvent`** (`id`, `timestamp`); triggers retasking |
| GET | `/recommendations?status=`, `/recommendations/{id}` | list / one |
| POST | `/recommendations/{id}/validate-modification` | body is the **raw modifications object** exactly as the frontend sends it (not wrapped in `{modifications}`); returns conflicts, updated trade-offs and score; applies nothing |
| POST | `/recommendations/{id}/decision` | body `{decision:'approve'\|'reject'\|'modify', reason?, modifications?, operator}`; returns the updated `Recommendation`. Reject requires `reason`. |
| GET | `/missions/{id}/eligible-resources` | feasible aircraft/crew (powers the Modify dropdowns) |
| GET | `/predictions` | sorted by urgency |
| POST | `/scenarios/run` | what-if; never mutates live state |
| GET | `/scenarios`, `/scenarios/{id}` | saved runs |
| GET | `/audit`, `/audit/verify` | list (filters) / hash-chain verification |
| POST | `/sim/control` | `{action:'pause'\|'resume'\|'speed'\|'reset', speed?: 1\|5\|20}`; `reset` restores the clean seed and clears recommendations, alerts and scenarios (audit retained) |
| GET | `/demo-scripts`, POST `/demo-scripts/{name}/run` | scripted event sequences on the sim clock |
| GET | `/fusion/status`, `/routes/risk` | backend-only extras (optional for the frontend) |

**WebSocket envelope:** `{ "type": string, "payload": object, "ts": ISO8601, "stateVersion"?: number }`.

Server → client: `SNAPSHOT` (always first), `ENTITY_UPDATE` (batched upserts/deletes by entity type), `POSITION_TICK` (batched, about 1 Hz sim time), `CLOCK_TICK`, `EVENT_INJECTED`, `IMPACT_ANALYSIS`, `RETASK_PROGRESS`, `RECOMMENDATION_READY`, `RECOMMENDATION_UPDATED`, `ALERT`, `PREDICTION_UPDATE`, `AUDIT_APPENDED`, `HEARTBEAT` (every 5 s).
Client → server: `PING` (sent in reply to `HEARTBEAT`).
Unknown message types are ignored by the frontend, never fatal. Exact payload shapes: `docs/API_CONTRACT.md` and `frontend/scripts/fake-backend.mjs`.

## 13. Behaviours the frontend relies on

1. **Impact analysis (`IMPACT_ANALYSIS`):** `{impactedMissionIds[], reasons per mission, mostUrgent, timeToDecisionMin}`. The UI flags those missions red on the map, board and timeline and shows a countdown (the mock starts at 5:00).
2. **Retask progress (`RETASK_PROGRESS`):** stages `fusing → constraints → optimising → ranking` (then `ready`), each with `elapsedMs`. The UI animates a re-plan of about 2–4 s; add a configurable minimum stage duration so it is visible in demos.
3. **Recommendation content:** the card shows a score gauge, trigger event, `confidence`, `dataFreshnessSec`, `stateVersion`, a diff per `Change` (before → after with `note`), trade-offs with `direction`, "why" bullets, constraints satisfied (green) and relaxed (amber, prominent), and **alternatives**. The comparison view charts alternatives on five criteria: Overall Feasibility, Threat Avoidance, Fuel Efficiency, Schedule Adherence, Fleet Margin Preserved. Return 2 alternatives (see open question Q3 for the exact field).
4. **Event types the mock engine handles (the real engine should match):** aircraft unserviceable → hot-swap with a compatible ground spare; base closed or weather degraded → divert airborne aircraft to the nearest open base with fuel reserve; threat detected → reroute (Route C or a dogleg) or add a fighter screen; crew unavailable → reassign a rested, qualified crew with the lowest fatigue; new priority mission → scramble a ready aircraft or retask a lower-priority sortie.
5. **Approve / Modify / Reject:** approve applies the plan atomically (assignments, routes, delays, statuses), bumps `stateVersion`, emits `ENTITY_UPDATE` and `RECOMMENDATION_UPDATED`, and appends an audit entry (`AUDIT_APPENDED`). Reject needs a reason. Modify validates a manual swap (type mismatch, double-booking, crew qualification and fatigue) and returns violations (422) or applies as `modified`.
6. **Staleness:** a recommendation records `stateVersion`; if a later change touches what it depends on (assigned aircraft/crew, route threat, base status, mission), mark it `stale` and emit `RECOMMENDATION_UPDATED`. Pending recommendations expire after a configurable sim-time TTL.
7. **Conflict checks the frontend runs locally (the backend optimiser must obey the same rules):** no double-booked aircraft or crew; minimum **45 min** turnaround between sorties; crew **12 h** duty limit (`dutyHoursLast24h` + sortie duration); aircraft type must match `requiredAircraftType`; crew must hold the required qualifications.
8. **Scenarios:** `ScenarioParams {name?, aircraftLoss[{type?, baseId?, count}], baseOutage?{baseId, hours}, crewAvailabilityReductionPct?, weatherSeverity?('nominal'|'caution'|'severe'), threatLevel?('low'|'medium'|'high'|'critical'), surgeMissions?(0–8), horizonHours}`. `ScenarioResult {id, name, createdAt, baselineKpis, scenarioKpis, series{time[], baseline[], scenario[]}, firstFailure?{time, cause, description}, unmetMissions[{missionId, reason}], capped?}`. KPIs: `missionsFulfilledPct, p1CoveragePct, avgDelayMin, aircraftUtilisationPct, crewFatigueMean, crewFatigueMax, fuelConsumptionPct, weaponsConsumptionPct`. Invariants: zero changes equals baseline; more losses never improve coverage; live state, `stateVersion`, recommendations and audit decisions are untouched (only a "scenario run" audit entry may be written).
9. **Demo scripts:** two scripts the UI can trigger via `/demo-scripts/{name}/run`: **"SAM site on Route B"** and **"Runway closure + aircraft AOG"** (name the endpoints `sam-route-b` and `runway-closure-aog`; `GET /demo-scripts` lists them). They start from the clean baseline.
10. **Audit actions (runtime strings):** `DECISION_APPROVED`, `DECISION_REJECTED`, `DECISION_MODIFIED`, `INJECT_EVENT` (plus scenario-run and sim-control actions). Note: the `AuditLogPage` filter dropdown still offers the stale values `DECISION_APPROVE`/`DECISION_REJECT`/`DECISION_MODIFY`/`EVENT_INJECTED`, so its exact-match filters miss; the aggregate filters (`DECISIONS_ONLY`, `EVENTS_ONLY`) still work. Backend emits the runtime strings; the frontend dev fixes the dropdown (see section 0.1 item 8).
11. **Alerts:** emit `ALERT` for threats, readiness, weather, crew, conflicts, predictions and stale or degraded data, with severity `critical|warning|info`.
12. **Stale-data contract:** the frontend marks the connection STALE if nothing arrives for 15 s (`VITE_STALE_AFTER_SEC`). The 5 s `HEARTBEAT` keeps it live.

## 14. Data fusion (pillar 1)

Simulate **seven source systems** with deliberately different schemas, units, ID formats and cadence:

| Source | Quirks |
|---|---|
| Maintenance | tail numbers, decimal hours, codes `FMC/PMC/NMC/AOG`, 60 s updates |
| Roster | different crew IDs, local-time duty, qualification codes |
| Armament | weapon names differ in case/format, quantities per bunker |
| Airspace | polygons in `(lng,lat)` vs `(lat,lng)`, Zulu strings |
| Met | visibility in metres, wind in m/s, 3-hour forecast blocks |
| Intel | fuzzy positions, confidence words (`low/med/high`), conflicting reports |
| Ops/Tasking | free-text priorities (`IMMEDIATE`, `HIGH`) |

Pipeline: **normalise → validate (quarantine bad records, never drop silently) → reconcile (freshness + source trust; merge duplicate intel into one Threat) → quality metadata (`DataQuality {source, lastUpdated, freshnessSec, confidence, flags[]}`) → state store.** Stale data beyond `STALE_DATA_SEC` raises an `ALERT` and lowers recommendation `confidence`. `GET /fusion/status` lists sources, counts and quarantined records.

## 15. Optimisation (pillar 2)

OR-Tools **CP-SAT**, time limit about 4 s, fixed seed, one worker in test mode.
- **Variables:** `x[m,a]` aircraft, `y[m,c]` crew, `d[m]` delay (5-min steps), `r[m,k]` route option, `u[m]` unfulfilled.
- **Hard constraints:** type match and serviceability/turnaround readiness; fuel/range for route + reserve; weapons available at the launch base; crew qualifications and duty/fatigue limits (12 h); no double-booking and minimum 45 min turnaround; runway/weather minima at launch and recovery; no active no-fly airspace on the chosen route; mission window with allowed delay.
- **Soft constraints (reported in `constraintsRelaxed`):** threat exposure, delay beyond preferred, restricted-airspace use, crew rest margin, weapon reserve, plan disruption vs baseline, predicted failure risk.
- **Objective:** minimise `Σ priorityWeight·u` (P1=1000, P2=300, P3=100, P4=30) + weighted delay, risk, fuel, fatigue and plan changes.
- **Alternatives:** solve under three profiles (`min_disruption`, `min_risk`, `max_coverage`); the best is primary and the two others are `alternatives`.
- **Score (0–100):** blend of priority-weighted coverage, risk reduction, resource efficiency and stability; document the formula in `docs/OPTIMISER.md`.
- **Explanations** derive from solver artefacts (binding constraints, rejected candidates and why).
- Provide an independent `check_plan(snapshot, plan)` validator used by tests and by Modify validation.

## 16. Retasking pipeline

```
OpsEvent → apply factual effect to state → EVENT_INJECTED → IMPACT ANALYSIS (<300 ms)
        → IMPACT_ANALYSIS + ALERT → RETASK_PROGRESS x4 → optimise impacted scope + dependents
        → recommendation + alternatives + explanations → RECOMMENDATION_READY
        (live plan unchanged until a decision arrives)
```
Targets: full recommendation < 5 s for 24 aircraft and 10–12 missions; deterministic.

## 17. Predictive analytics (pillar 3)

Small, explainable models trained at startup on seeded synthetic data (no downloads): aircraft serviceability risk (3/6/12 h), crew fatigue trajectory, fuel depletion per base, weather impact on mission windows. Output `Prediction` with confidence, `horizonMinutes`, a readable `message` (for example "AC-14 likely unserviceable within 6 h (72%)") and top factors. Emit `PREDICTION_UPDATE` only on meaningful change. Feed predictions into the optimiser as soft penalties and into recommendation confidence.

## 18. Audit and security

Append-only audit with `hash = SHA-256(prevHash + canonical_json(entry))`; `/audit/verify` recomputes the chain and reports the first broken link. Log events, recommendations generated, decisions (who/what/when/why), modifications, scenario runs, sim control and auth failures. Local JWT RBAC (`commander` approves/rejects/modifies; `planner` injects events and runs scenarios; `observer` is read-only), controlled by `AUTH_ENABLED` (default false for demos; the operator then comes from the request body, default `demo-commander`). No secrets in code; CORS limited to configured origins; input validation and size limits; no outbound network calls (add a test that fails on any non-local socket).

## 19. Non-functional targets

`GET /snapshot` < 200 ms; impact analysis < 300 ms; retask < 5 s; position ticks batched at about 1 Hz sim time for ≤ 50 aircraft; startup to ready < 15 s; same seed + same event = same recommendation; ≥ 80% test coverage on `optimiser/`, `retask/`, `geo/`, `fusion/`.

## 20. Demo scenarios (must work end to end, from the clean baseline)

**Demo 1: SAM site on Route B.** Inject `THREAT_DETECTED` (SAM, about 85 km, confidence 0.9) over M-04's Route B → M-04 (P1) and possibly 1–2 others flagged at risk → the recommendation reroutes via Route C, makes one aircraft swap, delays one mission by about 20 min, offers two alternatives, and explains with the threat intersection and range limits → approve → state updated → audit entry.

**Demo 2: Runway closure + aircraft AOG.** `BASE_CLOSED` on `BASE-B` (about 6 h) then `AIRCRAFT_UNSERVICEABLE` on `AC-07` → the recommendation relocates sorties, re-pairs crews, flags any relaxed fatigue margin, preserves P1/P2 coverage and defers P4.

## 21. Testing

Unit (each constraint, geometry, normalisers, audit chain), property-based (plans never violate hard constraints, no double-booking, determinism), integration (event → recommendation → decision → state change → audit), **contract tests** (every REST response and WebSocket message validated against the Pydantic models and compared with the frontend contract), a performance benchmark, an offline-socket guard, and a **seed parity test** against `shared/seed/world.json`.

## 22. Open questions to settle during integration

| # | Question | Default until settled |
|---|---|---|
| Q1 | The frontend threat injector offers `SAM / Fighter / EW / Radar`; the backend enum is `SAM|fighter|radar|AAA`. | Accept `EW` as an alias of `radar`; add `AAA` support. |
| Q2 | Shape of `modifications` in a `modify` decision. Contract intent: `[{missionId, aircraftIds?, crewIds?}]`; the frontend types it loosely. | Accept the array shape; verify what the Modify UI actually sends. |
| Q3 | Per-criterion scores for the alternatives chart. | Backend adds an optional `criteriaScores` map (0–100) per recommendation and alternative; the frontend reads it if present. |
| Q4 | Exact audit `action` strings. | Settled for now: the runtime strings in section 13 item 10; contract update deferred to B8. |
| Q5 | Baseline `THR-02` vs the injected threat ID in Demo 1. | Injected threats get new IDs (`THR-05` and up); M-04 baseline is green. |
| Q6 | `POST /events` response. | Full `OpsEvent`, status 201. |
| Q7 | `shared/seed/world.json` export from the frontend mock. | Settled: the file is committed and authoritative; see section 10. |

## 23. Definition of done (per stage)

Runs from a clean checkout with documented commands; tests pass; `ruff` and `mypy` clean; docs updated; a stage report (what was built, how to run, how to test, assumptions, anything skipped).

## 24. Glossary

**COP** Common Operating Picture. **CAP** Combat Air Patrol. **QRA** Quick Reaction Alert. **SAM** Surface-to-Air Missile (threat zone). **AOG** Aircraft on Ground (unserviceable). **CSAR/SAR** (Combat) Search and Rescue. **ATO** Air Tasking Order. **Retasking** changing resource assignments in response to change. **Sortie** one aircraft flight for a mission. **Turnaround** recovery, rearm and refuel time before the next sortie. **Fatigue index** 0–100 crew readiness-risk measure. **Stale recommendation** one computed from a state version that has since changed in a way that affects it.
