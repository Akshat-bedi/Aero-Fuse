# AirOps DSS — Canonical Backend API & WebSocket Integration Contract

This document is the **single authoritative integration contract** between the backend server (FastAPI) and the frontend client (React/Vite). Both teams must strictly adhere to this specification.

> **Simulation Rule**: All data, bases, units, geographies, callsigns, and order-of-battle are **strictly fictional**.

---

## 1. Architectural Protocol & Configuration

- **REST API Base URL**: `http://localhost:8000/api` (configurable via `VITE_API_BASE_URL`)
- **WebSocket Gateway URL**: `ws://localhost:8000/ws` (configurable via `VITE_WS_URL`)
- **Data Source Switch**: Toggle `VITE_DATA_SOURCE=mock` or `VITE_DATA_SOURCE=live` in `frontend/.env`. Zero frontend component changes required.

---

## 2. Core Conventions & Standards

### 2.1 Serialization & Naming
- **JSON on the wire**: `camelCase` for all properties.
- **Python backend**: `snake_case` models with Pydantic v2 aliases (`alias_generator=to_camel`, `populate_by_name=True`).

### 2.2 Time & Dates
- **Format**: All timestamps on the wire are **ISO 8601 UTC strings** (e.g. `"2026-03-14T06:30:00Z"`).
- **Display**: Military Zulu format (e.g. `"1420Z"`) is computed **only at display time** using frontend formatting helpers.
- **Time Source**: The simulation clock (`sim.time`) is the single authoritative time source. Never use client local time or `datetime.now()` for domain calculations.

### 2.3 ID Prefix Conventions
All entity and transaction IDs must use prefixed strings:
| Entity | Prefix Format | Example | Description |
| :--- | :--- | :--- | :--- |
| **Air Base** | `BASE-[A-D]` | `BASE-B` | Fictional airbase identifier |
| **Aircraft** | `AC-nn` | `AC-07` | Two-digit aircraft tail ID |
| **Aircrew** | `CR-nn` | `CR-12` | Two-digit crew member ID |
| **Mission** | `M-nn` | `M-04` | Two-digit Air Tasking Order mission |
| **Threat** | `THR-nn` | `THR-02` | Two-digit detected threat contact |
| **Airspace** | `AS-nn` | `AS-03` | Two-digit tactical airspace sector |
| **Ops Event** | `EV-nnnn` | `EV-0015` | Four-digit operational event trigger |
| **Recommendation**| `REC-nnnn` | `REC-0007` | Four-digit optimiser proposal |
| **Audit Log** | `AUD-nnnn` | `AUD-0042` | Four-digit hash-chained audit record |

### 2.4 Measurement Units
- **Distance**: Kilometers (`km`)
- **Speed**: Knots (`kts`)
- **Altitude**: Feet above mean sea level (`ft`)
- **Fuel & Capacities**: Percentages `0–100` (`%`)
- **Confidence Rating**: Decimal fraction `0.0` to `1.0`
- **Crew Fatigue Index**: Scale `0–100` (`pts`, higher = more fatigued)
- **Durations**: Minutes (`min`) unless explicitly named otherwise

### 2.5 Map Bounding Box (Republic of Veridia)
The tactical map operates within a fictional planar coordinate space:
- **Latitude**: `0.0` to `10.0`
- **Longitude**: `0.0` to `12.0`
- **GeoJSON Coordinate Order**: `[longitude, latitude]` per RFC 7946

```json
{
  "bounds": {
    "minLat": 0.0,
    "maxLat": 10.0,
    "minLng": 0.0,
    "maxLng": 12.0
  }
}
```

### 2.6 State Versioning
Canonical state maintains a monotonically increasing `stateVersion` integer. Every snapshot, recommendation, and entity update emits the version it was derived from.

### 2.7 Error Format
All HTTP error responses adhere to RFC 7807:
```json
{
  "type": "https://airops.dss/errors/stale-recommendation",
  "title": "Conflict: Stale Recommendation",
  "status": 409,
  "detail": "Recommendation REC-0007 was computed on stateVersion 412, current version is 415."
}
```

---

## 3. Enumerations

```typescript
// Aircraft serviceability & flight status
type AircraftStatus = 'serviceable' | 'maintenance' | 'unserviceable' | 'airborne' | 'turnaround';

// Aircrew availability
type CrewStatus = 'available' | 'resting' | 'on-mission' | 'unavailable';

// Runway physical condition
type RunwayStatus = 'open' | 'degraded' | 'closed';

// Tactical mission profiles
type MissionType = 'CAP' | 'strike' | 'recon' | 'airlift' | 'SAR' | 'escort';

// Air Tasking Order lifecycle states
type MissionStatus = 'planned' | 'approved' | 'in-progress' | 'completed' | 'at-risk' | 'cancelled';

// Mission priority (1 = highest urgency)
type Priority = 1 | 2 | 3 | 4;

// Airspace classification
type AirspaceType = 'restricted' | 'corridor' | 'no-fly' | 'danger';

// Threat classifications & status
type ThreatType = 'SAM' | 'fighter' | 'radar' | 'AAA';
type ThreatStatus = 'active' | 'suspected' | 'neutralised';

// Meteorological severity
type Severity = 'nominal' | 'caution' | 'severe';

// Injectable operational contingency triggers
type EventType =
  | 'THREAT_DETECTED'
  | 'AIRCRAFT_UNSERVICEABLE'
  | 'BASE_CLOSED'
  | 'WEATHER_DEGRADED'
  | 'NEW_PRIORITY_MISSION'
  | 'CREW_UNAVAILABLE';

// Recommendation lifecycle
type RecommendationStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'stale' | 'expired';

// Recommendation atomic change kind
type ChangeKind = 'aircraft_swap' | 'crew_swap' | 'reroute' | 'delay' | 'cancel' | 'new_assignment';

// Trade-off directional impact
type TradeoffDirection = 'good' | 'bad' | 'neutral';
```

---

## 4. REST API Surface (`/api`)

| Method | Path | Request Body | Response Body | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/health` | — | `{ status, version, simTime, solverReady }` | Liveness, clock, and optimiser readiness check |
| `GET` | `/snapshot` | — | `WireSnapshot` | Complete canonical state + `stateVersion` |
| `POST` | `/events` | `OpsEvent` (without id/ts) | `OpsEvent` | Inject contingency event; triggers retask pipeline |
| `GET` | `/recommendations?status=` | — | `Recommendation[]` | Filter recommendations by status |
| `GET` | `/recommendations/{id}` | — | `Recommendation` | Get single recommendation with alternatives |
| `POST` | `/recommendations/{id}/validate-modification` | `{ modifications }` | `{ conflicts, score, tradeoffs, valid }` | Re-validate manual commander edits without applying |
| `POST` | `/recommendations/{id}/decision` | `{ decision, reason?, modifications?, operator }` | `Recommendation` | Human commander decision (`approve`, `reject`, `modify`) |
| `GET` | `/missions/{id}/eligible-resources`| — | `{ aircraft: Aircraft[], crew: Crew[] }` | Feasible resources for mission modification dropdowns |
| `GET` | `/predictions` | — | `Prediction[]` | Proactive predictions sorted by urgency |
| `POST` | `/scenarios/run` | `ScenarioParams` | `ScenarioResult` | Run what-if simulation (never mutates live plan) |
| `GET` | `/scenarios` | — | `ScenarioResult[]` | List saved scenario runs |
| `GET` | `/scenarios/{id}` | — | `ScenarioResult` | Get specific scenario run details |
| `GET` | `/audit` | — | `AuditEntry[]` | Filterable immutable audit log (`?operator=&action=`) |
| `GET` | `/audit/verify` | — | `{ valid: boolean, brokenLinkIndex?, message }` | Verify SHA-256 hash-chain integrity |
| `POST` | `/sim/control` | `{ action, speed? }` | `{ simTime, speed, paused }` | Sim clock controls (`pause`, `resume`, `speed`, `reset`) |
| `GET` | `/demo-scripts` | — | `DemoScriptItem[]` | List pre-scripted scenario demonstrations |
| `POST` | `/demo-scripts/{name}/run` | — | `{ status, eventCount }` | Replay scripted demonstration on the sim clock |

---

## 5. WebSocket Protocol (`/ws`)

### 5.1 Standard Message Envelope
All WebSocket frames across client and server strictly use this uniform envelope:
```json
{
  "type": "STRING_TYPE",
  "payload": {},
  "ts": "2026-03-14T06:30:00Z",
  "stateVersion": 412
}
```

### 5.2 Server → Client Message Types
| Type | Payload Description |
| :--- | :--- |
| `SNAPSHOT` | Complete `WireSnapshot` sent immediately on client connect |
| `ENTITY_UPDATE` | Batched upserts/deletes by entity type: `{ bases?, aircraft?, crew?, missions? }` |
| `POSITION_TICK` | 1 Hz batched aircraft position updates: `[{ id, position, heading, speed, fuelPct }]` |
| `CLOCK_TICK` | Sim clock step: `{ simTime, speed, paused }` |
| `EVENT_INJECTED` | Real-time `OpsEvent` broadcast when contingency is registered |
| `IMPACT_ANALYSIS` | Retask impact assessment: `{ impactedMissionIds, reasons, timeToDecisionMin }` |
| `RETASK_PROGRESS` | Retasking pipeline step: `{ stage: "fusing"\|"constraints"\|"optimising"\|"ranking", elapsedMs }` |
| `RECOMMENDATION_READY` | Newly formulated `Recommendation` emitted by retask engine |
| `RECOMMENDATION_UPDATED` | Status change (`approved`, `rejected`, `stale`, `expired`) broadcast |
| `ALERT` | Operational safety threshold breach warning |
| `PREDICTION_UPDATE` | Updated predictive risk array |
| `AUDIT_APPENDED` | New immutable hash-chained audit entry |
| `HEARTBEAT` | Server keepalive ping emitted every 5 seconds |

### 5.3 Client → Server Message Types
| Type | Payload | Description |
| :--- | :--- | :--- |
| `PING` | `{}` | Heartbeat reply sent by client |

---

## 6. Entity Data Models & JSON Schemas

### 6.1 Air Base (`Base`)
```json
{
  "id": "BASE-B",
  "name": "North Bastion Strike Base",
  "code": "BASE-B",
  "location": { "lat": 5.20, "lng": 6.80 },
  "runwayStatus": "degraded",
  "weather": {
    "baseId": "BASE-B",
    "visibilityKm": 6.0,
    "cloudBaseFt": 1200,
    "windKts": 28,
    "severity": "caution",
    "forecast": [
      { "time": "2026-03-14T12:00:00Z", "severity": "caution", "visibilityKm": 6.0, "windKts": 28 },
      { "time": "2026-03-14T18:00:00Z", "severity": "severe", "visibilityKm": 3.0, "windKts": 36 }
    ]
  },
  "fuelStockPct": 65.0,
  "shelterCapacity": 24
}
```

### 6.2 Aircraft (`Aircraft`)
```json
{
  "id": "AC-07",
  "tailNumber": "VR-S07",
  "callsign": "HAMMER-07",
  "type": "Strike-B",
  "baseId": "BASE-B",
  "status": "airborne",
  "fuelPct": 62.5,
  "flightHoursToNextService": 18.4,
  "weaponLoad": [
    { "weaponType": "PGM-Mk2", "quantity": 4 }
  ],
  "position": { "lat": 4.21, "lng": 6.88 },
  "heading": 74,
  "speed": 430,
  "assignedMissionId": "M-04"
}
```

### 6.3 Weapon Stock (`WeaponStock`)
```json
{
  "baseId": "BASE-B",
  "weaponType": "PGM-Mk2",
  "quantity": 48
}
```

### 6.4 Aircrew (`Crew`)
```json
{
  "id": "CR-12",
  "callsign": "MAVERICK",
  "role": "Lead Fighter Pilot",
  "qualifications": ["AAM_COMBAT", "NIGHT_OPS", "TACTICAL_DATALINK", "INSTRUMENT_RATING"],
  "baseId": "BASE-A",
  "fatigueIndex": 24,
  "dutyHoursLast24h": 4.2,
  "status": "available"
}
```

### 6.5 Mission (`Mission`)
```json
{
  "id": "M-04",
  "name": "Central Precision Interdiction",
  "type": "strike",
  "priority": 1,
  "status": "in-progress",
  "launchBaseId": "BASE-B",
  "target": { "lat": 4.50, "lng": 8.50, "name": "Contested Logistics Hub Oscar" },
  "route": [
    { "lat": 5.20, "lng": 6.80 },
    { "lat": 4.80, "lng": 7.40 },
    { "lat": 4.50, "lng": 8.50 },
    { "lat": 5.20, "lng": 6.80 }
  ],
  "routeOptions": [
    {
      "id": "Route A",
      "name": "Route A (Direct High-Altitude)",
      "waypoints": [
        { "lat": 5.20, "lng": 6.80 },
        { "lat": 5.80, "lng": 7.60 },
        { "lat": 4.50, "lng": 8.50 },
        { "lat": 5.20, "lng": 6.80 }
      ],
      "distanceKm": 340,
      "riskScore": 22
    },
    {
      "id": "Route B",
      "name": "Route B (Direct Corridor - Intersects SAM THR-02)",
      "waypoints": [
        { "lat": 5.20, "lng": 6.80 },
        { "lat": 4.80, "lng": 7.40 },
        { "lat": 4.50, "lng": 8.50 },
        { "lat": 5.20, "lng": 6.80 }
      ],
      "distanceKm": 310,
      "riskScore": 88
    },
    {
      "id": "Route C",
      "name": "Route C (Southern Dogleg Bypass)",
      "waypoints": [
        { "lat": 5.20, "lng": 6.80 },
        { "lat": 3.80, "lng": 7.20 },
        { "lat": 4.00, "lng": 8.40 },
        { "lat": 4.50, "lng": 8.50 },
        { "lat": 5.20, "lng": 6.80 }
      ],
      "distanceKm": 380,
      "riskScore": 14
    }
  ],
  "windowStart": "2026-03-14T06:00:00Z",
  "windowEnd": "2026-03-14T10:00:00Z",
  "requiredAircraftType": "Strike-B",
  "requiredCrewQuals": ["TACTICAL_DATALINK"],
  "requiredWeapons": [
    { "weaponType": "PGM-Mk2", "quantity": 4 }
  ],
  "assigned": {
    "aircraftIds": ["AC-07"],
    "crewIds": ["CR-07"]
  },
  "currentWaypointIndex": 1
}
```

### 6.6 Tactical Airspace (`Airspace`)
```json
{
  "id": "AS-03",
  "name": "No-Fly Buffer Zone (Northern Border)",
  "type": "no-fly",
  "activeFrom": "2026-03-14T00:00:00Z",
  "activeTo": "2026-03-14T23:59:59Z",
  "floorFt": 0,
  "ceilingFt": 60000,
  "polygon": {
    "type": "Polygon",
    "coordinates": [
      [
        [1.0, 9.2],
        [11.0, 9.2],
        [11.0, 9.9],
        [1.0, 9.9],
        [1.0, 9.2]
      ]
    ]
  }
}
```

### 6.7 Threat Contact (`Threat`)
```json
{
  "id": "THR-02",
  "type": "SAM",
  "position": { "lat": 4.80, "lng": 7.50 },
  "rangeKm": 85.0,
  "confidence": 0.90,
  "lastSeen": "2026-03-14T06:25:00Z",
  "status": "active"
}
```

### 6.8 Weather State (`WeatherState`)
```json
{
  "baseId": "BASE-A",
  "visibilityKm": 18.0,
  "cloudBaseFt": 4500,
  "windKts": 12,
  "severity": "nominal",
  "forecast": [
    { "time": "2026-03-14T12:00:00Z", "severity": "nominal", "visibilityKm": 18.0, "windKts": 12 },
    { "time": "2026-03-14T18:00:00Z", "severity": "nominal", "visibilityKm": 16.0, "windKts": 14 }
  ]
}
```

### 6.9 Operational Events (`OpsEvent`)
```json
{
  "id": "EV-0015",
  "type": "THREAT_DETECTED",
  "payload": {
    "threatType": "SAM",
    "position": { "lat": 4.80, "lng": 7.50 },
    "rangeKm": 85.0,
    "confidence": 0.90,
    "status": "active"
  },
  "timestamp": "2026-03-14T06:30:00Z",
  "operator": "INTEL_DESK_02"
}
```

#### Event Payloads Specification:
| Type | Payload Schema |
| :--- | :--- |
| `THREAT_DETECTED` | `{ "threatType": ThreatType, "position": LatLng, "rangeKm": number, "confidence": number, "status": ThreatStatus }` |
| `AIRCRAFT_UNSERVICEABLE`| `{ "aircraftId": string, "reason": string, "etrHours"?: number }` |
| `BASE_CLOSED` | `{ "baseId": string, "runwayStatus": RunwayStatus, "durationHours": number }` |
| `WEATHER_DEGRADED` | `{ "baseId"?: string, "region"?: string, "severity": Severity, "durationHours": number }` |
| `NEW_PRIORITY_MISSION` | `{ "mission": Partial<Mission> }` |
| `CREW_UNAVAILABLE` | `{ "crewId": string, "reason": string }` |

### 6.10 Decision-Support Recommendation (`Recommendation`)
```json
{
  "id": "REC-0007",
  "triggerEventId": "EV-0015",
  "summary": "Reroute M-04 via Route C; swap AC-07 for AC-11 on M-07",
  "score": 86.4,
  "changes": [
    {
      "missionId": "M-07",
      "kind": "aircraft_swap",
      "before": "AC-07",
      "after": "AC-11",
      "note": "AC-07 fuel insufficient on new route"
    },
    {
      "missionId": "M-04",
      "kind": "reroute",
      "before": "Route B",
      "after": "Route C",
      "note": "Route B inside active SAM envelope"
    }
  ],
  "impactedMissionIds": ["M-04", "M-07"],
  "tradeoffs": [
    { "label": "Total delay", "delta": 20, "unit": "min", "direction": "bad" },
    { "label": "Threat exposure", "delta": -92, "unit": "%", "direction": "good" },
    { "label": "Fuel burn", "delta": 8, "unit": "%", "direction": "bad" }
  ],
  "explanation": [
    "Route B intersects THR-02 (SAM, 85 km radius, confidence 0.90).",
    "AC-11 is the only serviceable Strike-B at BASE-B with 4x PGM-Mk2 and sufficient range."
  ],
  "constraintsSatisfied": [
    "Aircraft type match",
    "Crew qualifications",
    "Weapon availability",
    "No double-booking"
  ],
  "constraintsRelaxed": [
    "M-09 launch delayed 20 min (within 30 min tolerance)"
  ],
  "alternatives": [],
  "status": "pending",
  "createdAt": "2026-03-14T06:30:05Z",
  "stateVersion": 412,
  "confidence": 0.81,
  "dataFreshnessSec": 8
}
```

### 6.11 Prediction (`Prediction`)
```json
{
  "entityType": "aircraft",
  "entityId": "AC-14",
  "metric": "serviceability_risk",
  "value": 0.72,
  "confidence": 0.82,
  "horizonMinutes": 360,
  "createdAt": "2026-03-14T06:00:00Z",
  "message": "AC-14 likely unserviceable within 6 h (72%)"
}
```

### 6.12 Audit Log Entry (`AuditEntry`)
```json
{
  "id": "AUD-0042",
  "timestamp": "2026-03-14T06:32:10Z",
  "operator": "COMMANDER_OPS",
  "action": "DECISION_APPROVE",
  "targetId": "REC-0007",
  "details": "Commander approved retask plan REC-0007: reroute M-04 and airframe swap AC-11.",
  "prevHash": "5d41402abc4b2a76b9719d911017c592b0c44298fc1c149afbf4c8996fb92427",
  "hash": "a7b8c9d0e1f234567890abcdef1234567890abcdef1234567890abcdef123456"
}
```

### 6.13 Wire Snapshot (`WireSnapshot`)
Emitted over `GET /api/snapshot` and WebSocket `SNAPSHOT`:
```json
{
  "stateVersion": 412,
  "sim": {
    "time": "2026-03-14T06:30:00Z",
    "speed": 1,
    "paused": false
  },
  "bases": [],
  "aircraft": [],
  "crew": [],
  "missions": [],
  "airspace": [],
  "threats": [],
  "weather": [],
  "weaponStocks": [],
  "recommendations": [],
  "predictions": [],
  "activeEvents": [],
  "auditLog": []
}
```
*Note: The frontend Zustand store normalizes all arrays into dictionary lookups indexed by entity `id`.*
