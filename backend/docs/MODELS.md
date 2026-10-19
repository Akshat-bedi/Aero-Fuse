# AirOps DSS — Backend Domain Models (B1)

The wire domain lives in `backend/app/domain/`. Models are Pydantic v2, use
camelCase aliases on the wire and snake_case in Python, and are the single
source from which `backend/docs/schemas/*.schema.json` is generated.

**Source-of-truth order for this stage** (highest first):
`shared/seed/world.json` → `frontend/src/types/index.ts` →
`frontend/src/lib/contractValidation.ts` → `docs/API_CONTRACT.md`.
Where the older contract prose disagrees with the built frontend, the models
follow the verified runtime shapes and list the gap in
"Contract-change candidates" below.

## Files

| File | Contents |
| :--- | :--- |
| `base.py` | `WireModel` base (camelCase aliases, `extra="ignore"`, `populate_by_name`), `IsoTimestamp`, `dump_wire()` |
| `enums.py` | Every contract enum (`AircraftStatus`, `MissionType`, `ThreatType`, `EventType`, …) and `Priority = Literal[1..4]` |
| `entities.py` | `Base`, `Aircraft`, `WeaponLoad`, `WeaponStock`, `Crew`, `Mission`, `RouteOption`, `Airspace`, `AirspacePolygon`, `Threat`, `WeatherState`, `WeatherForecastItem`, `LatLng`, `MapBounds` |
| `events.py` | `OpsEvent`, `OpsEventRequest` and the six typed payloads with discriminated dispatch on `type` |
| `decision.py` | `Recommendation`, `Change`, `Tradeoff`, modification shapes, `DecisionRequest`, validation/eligible-resource responses |
| `telemetry.py` | `Prediction`, `OperationalAlert`, `ImpactAnalysis`, `RetaskProgress` |
| `audit.py` | `AuditEntry` (SHA-256 chain shape) |
| `scenarios.py` | `ScenarioParams`, `ScenarioResult`, KPI/series/failure models |
| `snapshot.py` | `SimState`, `WireSnapshot` (arrays; `sim{time,speed,paused}`; optional `bounds`) |
| `schemas.py` | `python -m app.domain.schemas [dir]` exports one JSON Schema per model to `backend/docs/schemas/` |

## Conventions

- **Timestamps** are validated ISO 8601 strings kept verbatim, so seed payloads
  round-trip byte-for-byte. `datetime.fromisoformat` accepts `Z` and offset
  forms; domain code never calls `datetime.now()` (sim clock only).
- **`dump_wire(model)`** = `model_dump(by_alias=True, exclude_none=True, mode="json")`.
  Empty lists are kept (the snapshot always emits every collection); `None`
  optionals are omitted.
- **IDs** are prefix-validated where the frontend validator checks them:
  `BASE-`, `AC-`, `CR-`, `M-`, `AS-`, `THR-`, `REC-`, `AUD-`, `SCEN-`, `EV-`.
- **Ranges**: lat `0–10`, lng `0–12`, fuel/fatigue `0–100`, confidence `0–1`,
  scores `0–100`, surrogate timestamps (`activeFrom < activeTo`), mission
  `windowStart < windowEnd`.
- **Polygons** must have closed rings of ≥ 4 `[lng, lat]` positions inside the
  map bounds (`Polygon` and `MultiPolygon` supported); airspace
  `ceilingFt >= floorFt`.
- **Unknown fields are ignored** (`extra="ignore"`), matching the frontend's
  tolerance for forward-compatible additions.

## Aliases and tolerances beyond the strict contract

| Model | Accepted on input | Emitted on output |
| :--- | :--- | :--- |
| `Crew` | `dutyHours24h`, `fatigueScore`, `restHoursRemaining` | `dutyHoursLast24h`, `fatigueIndex` |
| `AuditEntry` | `previousHash` | `prevHash` |
| `Recommendation` | `timestamp` | `createdAt` |
| `ThreatDetectedPayload` | `type` or `threatType`; case-insensitive; `EW` → `radar`; `AAA` supported; `confidence` optional | `threatType` |
| `BaseClosedPayload` | `runwayStatus`/`durationHours` optional (defaults `closed`/`None`) | canonical fields |
| `ModificationsRequest` | `{aircraftSwap, crewSwap}` (what the Modify UI actually posts) **or** `[{missionId, aircraftIds?, crewIds?}]` (contract intent, preserved under `assignments`) | canonical fields |
| `Mission` | optional `routeOptions`, `currentWaypointIndex` | as parsed |
| `WireSnapshot` | optional `bounds`, `activeEvents`, `auditLog`, `recommendations`, `predictions` | every collection emitted |

Payload dispatch: `OpsEvent`/`OpsEventRequest` coerce the `payload` object into
the typed model matching `type` (via `parse_event_payload`, which raises
`KeyError` on unknown types and `ValidationError` on shape mismatches).

## Seed

- Loader: `app/state/seed.py`; `load_seed()` → validated `WireSnapshot`;
  `python -m app.state.seed check` prints counts and exits non-zero on
  mismatch. Path resolution: `SEED_PATH` setting (default repo-relative
  `shared/seed/world.json`; docker-compose mounts `../shared/seed` and sets it).
- `tests/test_seed_parity.py` proves `world.json` → models → dump is identical
  (after key sorting); the only tolerated differences are omitted optional
  fields (`assignedMissionId`, `currentWaypointIndex`).
- `tests/test_seed_baseline.py` enforces the clean-day rules (no double
  booking, type/qualification match, ≥ 45 min turnaround, ≤ 12 h projected
  duty) and contains the tripwire for the verified baseline quirk: **M-04
  flies Route B through active SAM `THR-02` (85 km at 4.8/7.5)**. The seed is
  authoritative; threat/risk semantics are revisited in stage B4.

## Contract-change candidates

These are places where the built frontend and `docs/API_CONTRACT.md` disagree.
The models follow the frontend/seed; the contract document and/or
`frontend/src/types/index.ts` should be updated by the owning PR (agreed in
the B1 stage report):

1. **`modifications` shape** — contract intent is `[{missionId, aircraftIds?, crewIds?}]`;
   the Modify UI posts `{aircraftSwap: {missionId, newAircraftId}, crewSwap: {missionId, newCrewId}}`.
   Backend accepts both (contract §4 / open question Q2).
2. **`NEW_PRIORITY_MISSION` payload** — contract sketch wraps `{mission: Partial<Mission>}`;
   the injector sends flat `{name, type, priority, launchBaseId, targetCoordinates, requiredAircraftType}`.
3. **`THREAT_DETECTED` payload** — `confidence` and `status` are not always sent
   (`DebugDataPage` omits confidence; the contract sketch includes both).
   Model defaults: `confidence=None` (B6/engine applies its documented default),
   `status="active"`.
4. **`BASE_CLOSED` payload** — `DebugDataPage` sends only `{baseId, reason}`;
   `runwayStatus` and `durationHours` default on parse (`closed`, `None`).
5. **`recommendation.criteriaScores`** (Q3) — optional `{criterion: 0–100}` map
   emitted by the backend and read by the alternatives chart; not yet in the
   contract document.
6. **`WireSnapshot.bounds`** — emitted (seed includes it) but missing from the
   `WireSnapshot` TypeScript interface; `contractValidation.validateWireSnapshot`
   already accepts it.
7. **`ImpactAnalysis`** — `eventId`/`eventType` are in the frontend type but not
   the contract §5.2 payload sketch; both are optional on parse.
8. **`GET /health`** — context.md v2 mentions a `speed` key; the contract and
   frontend use the four keys `{status, version, simTime, solverReady}` (flagged
   in B0).
9. **`AuditEntry.stateVersion`** — tolerated optional field per the frontend
   validator; not in the contract JSON example.

## Regenerating schemas

```powershell
cd backend
python -m app.domain.schemas            # backend/docs/schemas/*.schema.json
```

Schemas are generated from the same models the API validates with, so they can
never drift from the code; regenerate and commit them in the same PR whenever
a model changes.
