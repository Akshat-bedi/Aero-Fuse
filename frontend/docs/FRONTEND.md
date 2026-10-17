# AirOps DSS — Frontend Architecture & Developer Guide

## 1. System Overview

**AirOps DSS** (Dynamic Air Operations & Resource Optimisation Decision-Support System) is a specialised web-based command-centre decision-support application designed for a national Air Force Operations Centre.

Air operations planning requires fusing disparate, mission-critical operational streams:
- Aircraft availability & serviceability
- Crew duty status & readiness
- Weapon loads & station configurations
- Airspace boundaries & flight corridors
- Weather conditions & forecast minima
- Threat events & radar detections
- Mission priorities & operational tempo

AirOps DSS provides a single consolidated operational picture, predicts resource bottlenecks, optimises asset allocations, and proposes AI-assisted retasking options within seconds.

---

## 2. Core Architectural Principles

1. **Decision Support, Not Autonomy**:
   - The system is strictly advisory. It produces ranked recommendations.
   - Every operational decision requires explicit commander interaction: **Approve**, **Modify**, or **Reject**.
   - No autonomous or silent actions take place without human confirmation.

2. **Explainability**:
   - Every AI recommendation provides:
     - An overall suitability score (0–100) and confidence rating
     - A plain-language operational rationale ("Why this choice")
     - List of hard constraints satisfied (e.g. crew duty limits, fuel thresholds, payload compatibility)
     - Explicit operational trade-offs (e.g. drawdown of ready reserves, transit fuel burn)
     - Alternative options evaluated

3. **Fictional Data Only**:
   - Strict adherence to fictional geography, fictional bases (e.g. *Sector Alpha FOB*, *North Bastion Airbase*), generic aircraft designations (*Fighter-A*, *Strike-B*, *Transport-C*, *Recon-D*, *Helicopter-E*), and fictional callsigns (*VAPOR-11*, *GHOST-01*).
   - Zero real-world military locations, operational units, or real order-of-battle.

4. **Offline-First & Air-Gapped Ready**:
   - Military networks are often strictly air-gapped.
   - **Zero runtime dependencies on external CDNs**, online map tile servers, Google Fonts, or external cloud APIs.
   - Typography is bundled locally via `@fontsource/inter` and `@fontsource/jetbrains-mono`.
   - Tactical map rendering uses MapLibre GL JS driven entirely by **local GeoJSON** vector data without external tile endpoints.

5. **Backend-Agnostic Service Layer**:
   - Frontend components never call `fetch` or WebSockets directly.
   - All data access passes through a unified service facade in `src/services/`.
   - The system toggles between a realistic in-memory **MockOpsEngine** and a live **REST + WebSocket** backend by modifying a single environment variable (`VITE_DATA_SOURCE`), with **zero component changes**.

6. **Safety-Critical UX**:
   - Custom dark "Command Centre" theme built on high-contrast CSS variables.
   - Statuses are never conveyed by colour alone: icons, textual status tags, and high-contrast indicators are paired everywhere.
   - Destructive or plan-altering actions require modal confirmation.
   - Keyboard accessible and optimized for 1920×1080 command displays, responsive down to 1366×768.

---

## 3. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | React 18 + Vite | High-performance SPA with fast HMR |
| **Language** | TypeScript (Strict Mode) | Strong type safety, zero `any` policy |
| **Styling** | Tailwind CSS + CSS Variables | Tactical command-centre dark palette |
| **State Management** | Zustand | Lightweight, decoupled global operational state |
| **Tactical Map** | MapLibre GL JS | Local GeoJSON vector rendering (no tile server) |
| **Visualisation** | Apache ECharts | Resource gauges, timeline metrics, telemetry |
| **Timeline** | Custom SVG/DOM Gantt | Lightweight timeline for missions & maintenance |
| **Icons** | Lucide React | Bundled SVG tactical iconography |
| **Networking** | Native WebSocket Client | Auto-reconnect with exponential backoff |
| **Testing** | Vitest + React Testing Library | Unit tests and regression verification |
| **Linter / Formatter**| ESLint + Prettier | Code quality and strict type enforcement |

---

## 4. Monorepo Structure & Folder Responsibilities

The frontend application lives entirely within the `/frontend` directory of the `aero-fuse` monorepo. **All frontend `npm` commands must be run from `/frontend` (`cd frontend`).**

```text
aero-fuse/
├── backend/                  # Backend service layer (to be populated)
├── docs/                     # Cross-repo shared documentation
├── shared/seed/              # Shared data seeds and operational fixtures
└── frontend/                 # AirOps DSS frontend application root
    ├── .env.example          # Environment variable template
    ├── .env                  # Local environment configuration
    ├── .gitignore            # Frontend-specific gitignore
    ├── docs/
    │   └── FRONTEND.md       # Frontend architecture and developer guide
    ├── public/               # Static public web assets
    ├── src/
    │   ├── app/              # Application bootstrap, routing, shell layouts, providers
    │   ├── assets/           # Bundled static assets
    │   │   ├── fonts/        # Local font definitions / documentation
    │   │   └── geojson/      # Local GeoJSON maps (fictional territory, sectors, bases)
    │   ├── components/
    │   │   └── ui/           # Command-centre UI primitives (buttons, cards, badges, modals, tabs)
    │   ├── features/         # Feature-sliced domain modules
    │   │   ├── alerts/       # Operational alerts, warning banners, safety threshold watches
    │   │   ├── events/       # Live tactical events feed (weather shifts, radar tracks)
    │   │   ├── map/          # MapLibre offline situational map & tactical overlays
    │   │   ├── missions/     # Mission planning, ATO (Air Tasking Order) viewer
    │   │   ├── recommendations/ # AI retasking proposals, explainability panel, action dialogs
    │   │   ├── resources/    # Aircraft status, weapon inventory, fuel levels, crew rosters
    │   │   ├── scenarios/    # "What-if" scenario simulator & contingency analysis
    │   │   └── timeline/     # Custom Gantt chart (airframe availability, mission windows)
    │   ├── lib/              # Reusable helper functions, military time formatters, geo math
    │   ├── services/         # Backend-agnostic service layer (REST client, WS client, Mock engine)
    │   ├── store/            # Zustand operational stores
    │   ├── test/             # Test setup, mocks, and testing utilities
    │   ├── types/            # Domain models and strict TypeScript contracts
    │   ├── App.tsx           # Root application entry component
    │   ├── index.css         # Tactical theme variables, fontsource imports, Tailwind styles
    │   └── main.tsx          # React DOM mounting
    ├── tailwind.config.js    # Theme definition with CSS variable bindings
    ├── tsconfig.json         # Root TypeScript project references
    ├── tsconfig.app.json     # Strict TypeScript compiler options & path aliases
    └── vite.config.ts        # Vite bundler, path aliases, Vitest config
```

---

## 5. Path Aliases

To maintain clean and modular imports, the project defines standard path aliases in `tsconfig.app.json` and `vite.config.ts`:

- `@/*` &rarr; `src/*`
- `@/app/*` &rarr; `src/app/*`
- `@/components/*` &rarr; `src/components/*`
- `@/features/*` &rarr; `src/features/*`
- `@/services/*` &rarr; `src/services/*`
- `@/store/*` &rarr; `src/store/*`
- `@/types/*` &rarr; `src/types/*`
- `@/lib/*` &rarr; `src/lib/*`
- `@/assets/*` &rarr; `src/assets/*`

---

## 6. Data Source Layer: Switching Between Mock and Live

The system is designed so that frontend components are completely decoupled from whether data originates from an in-memory simulation or a live backend.

### Environment Configuration

Configure `.env` (or copy from `.env.example`):

```bash
# Switch between 'mock' and 'live'
VITE_DATA_SOURCE=mock

# Live Backend REST API endpoint
VITE_API_BASE_URL=http://localhost:8000/api

# Live Backend WebSocket endpoint
VITE_WS_URL=ws://localhost:8000/ws
```

### How Switching Works

1. `src/services/config.ts` reads `import.meta.env.VITE_DATA_SOURCE`.
2. When `VITE_DATA_SOURCE=mock`:
   - `opsService` routes calls to `mockEngine` (`src/services/mockEngine.ts`).
   - Mock data returns simulated airbases, aircraft status, and retasking recommendations.
   - Updates are delivered via local mock emitter.
3. When `VITE_DATA_SOURCE=live`:
   - `opsService` routes calls to `apiClient` (`src/services/apiClient.ts`).
   - `TacticalWebSocketClient` (`src/services/wsClient.ts`) initiates a connection to `VITE_WS_URL` with exponential-backoff auto-reconnect.
   - Real-time updates flow into the UI components seamlessly.
4. **Zero component changes** are needed when switching environments.

---

## 7. Development & Testing Commands

All commands below must be executed from the `frontend/` directory (`cd frontend`):

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts Vite local development server |
| `npm run build` | Runs TypeScript compilation (`tsc -b`) and Vite production bundle |
| `npm run test` | Runs Vitest unit tests |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run lint` | Runs ESLint over all TypeScript and React files |
| `npm run format` | Formats code with Prettier |
| `npm run preview` | Previews production build locally |

---

## 8. Design System & Application Shell (Stage 1)

### Tactical Command Centre Theme
- **Layered Surfaces**:
  - `command-bg` (`--color-bg-base`): `#080b11` deep tactical backdrop
  - `command-panel` (`--color-bg-panel`): `#0e1422` operational console panel
  - `command-raised` (`--color-bg-raised`): `#151e32` elevated cards and active selection
  - `command-border`: `#1d2a44` crisp dividers
- **Accents**:
  - Primary: Muted cyan/teal (`#06b6d4`, hover `#22d3ee`)
  - Secondary: Caution amber (`#f59e0b`, hover `#fbbf24`)
- **Semantic Status Colours (Always paired with icons and text labels)**:
  - `nominal`: Serviceable/Nominal (Green `#10b981`)
  - `warning`: Caution/Degraded (Amber `#f59e0b`)
  - `critical`: Critical/Unserviceable/Threat (Red `#ef4444`)
  - `info`: Pending/Info (Blue `#3b82f6`)
  - `inactive`: Inactive (Grey `#64748b`)
- **Military Night Vision Mode (`.night-mode`)**:
  - Full red-shifted, low-lumen palette for dimmed operations rooms preserving dark adaptation.

### Reusable UI Primitives (`src/components/ui/`)
- `Button`: Primary, secondary, danger, ghost, loading, and 2-click safety `requireConfirm` variant.
- `Panel` / `Card`: Header with title, subtitle, badges, action slot, and collapsible state.
- `StatusBadge`: High contrast status badges paired with Lucide status icons.
- `PriorityTag`: P1 (Critical), P2 (High), P3 (Routine), P4 (Low) mission urgency tags.
- `Modal`: Accessible dialog with Escape key dismiss, backdrop click, and focus handling.
- `ConfirmDialog`: Safety-critical confirmation modal with explicit risk warning and action verification.
- `Tabs`: Underline and segmented tab bars with counters and active indicator.
- `Tooltip`: Micro-tooltips with keyboard focus support and shortcut hotkey badges.
- `DataTable`: Generic sortable table with column alignments, empty state, and row selection.
- `ProgressBar`: Safety threshold progress bars (fuel endurance, operational readiness).
- `Toast` & `ToastContainer`: Global operational notifications system.
- `Skeleton`: Shimmer placeholder loaders for text, cards, and data views.
- `EmptyState`: Clean tactical empty states for cleared views or empty filters.
- `KeyValue` & `KeyValueList`: Dense telemetry key-value displays with copyable values.
- `Stat`: High-visibility metric tiles with directional trend indicator and context subtitle.

### Component Gallery
Visit `/dev/components` in the running application to view, interact with, and test all 15 UI primitives.

---

## 9. Data Contract, Shared Types & Mock Engine (Stage 2)

### 9.1 Shared TypeScript Domain Types (`src/types/index.ts`)
The entire application is strictly typed with canonical types:
- `Base`: Airbase state (runway status `open|degraded|closed`, weather, fuel stock %, shelter capacity).
- `Aircraft`: Airframes (`serviceable|maintenance|unserviceable|airborne|turnaround`), fuel %, flight hours to service, weapon load, live position/heading/speed, assigned mission.
- `Crew`: Aircrew personnel, role, flight qualifications, fatigue index (0–100), duty hours in last 24h, operational status.
- `WeaponStock`: Munition inventory per base and weapon type.
- `Mission`: Operational tasking (`CAP`, `strike`, `recon`, `airlift`, `SAR`, `escort`), priority (P1–P4), mission window, waypoints, asset assignments.
- `Airspace`: Dynamic vector airspace zones (`restricted`, `corridor`, `no-fly`, `danger`) with GeoJSON polygons.
- `Threat`: Fictional threat detections (`SAM`, `fighter`, `radar`, `AAA`), engagement range, confidence, status (`active`, `suspected`, `neutralised`).
- `WeatherState`: METAR-style surface/air conditions per base or sector, with 6h forecast horizons.
- `OpsEvent`: Injectable operational triggers (`THREAT_DETECTED`, `AIRCRAFT_UNSERVICEABLE`, `BASE_CLOSED`, `WEATHER_DEGRADED`, `NEW_PRIORITY_MISSION`, `CREW_UNAVAILABLE`).
- `Recommendation`: Decision-support recommendations containing suitability score (0–100), concrete entity changes, impacted missions, trade-offs, constraints satisfied/relaxed, plain-language operational rationale, and human commander decision (`pending`, `approved`, `rejected`, `modified`).
- `Prediction`: Proactive threshold breach predictions with confidence and time horizon.
- `AuditEntry`: Immutable operational decisions and override logs.

### 9.2 Service Layer & Data Agnosticism (`src/services/`)
Data access is isolated through `IDataService`:
- `getSnapshot()`: Returns the complete current `OperationalSnapshot`.
- `subscribe(callback)`: Real-time event stream subscription.
- `injectEvent(event)`: Injects operational contingencies for optimization.
- `decideRecommendation(id, decision, modifications)`: Processes commander decisions.
- `runScenario(params)`: Executes what-if simulations.
- `getAuditLog()`: Retrieves immutable event and decision logs.
- `setSpeedMultiplier(speed)`: Controls simulation tempo (`1x`, `5x`, `20x`).

**Backend-Agnostic Switch**:
- `mockDataService.ts`: In-memory realistic fictional simulation engine with live 1000ms movement loop advancing waypoints, fuel burn, and dynamic retasking.
- `liveDataService.ts`: Production REST + auto-reconnecting WebSocket client.
- Configuration: Set `VITE_DATA_SOURCE=mock` or `VITE_DATA_SOURCE=live` in `frontend/.env`.

### 9.3 Mock Retasking Optimisation Engine (`src/services/mockRetaskEngine.ts`)
Deterministic decision engine that generates explainable retask plans:
- **Aircraft Unserviceable**: Identifies compatible serviceable ground-spare at launch base, swaps airframe, logs turnaround delta.
- **Base Closed / Weather Degraded**: Diverts airborne flights to nearest open recovery base with fuel check; warns of readiness reduction.
- **Threat Detected**: Evaluates mission route intersections; suggests dogleg reroute around threat ceiling or CAP screen.
- **Crew Unavailable / Fatigue Exceeded**: Reassigns qualified resting crew with lowest fatigue index.
- **New Priority Mission**: Scrambles QRA alert aircraft or diverts low-priority routine patrols.

### 9.4 Zustand State Architecture (`src/store/`)
Domain state is partitioned into normalized slices:
- `entitiesStore`: Normalized dictionary maps for `bases`, `aircraft`, `crew`, `missions`, `airspace`, `threats`, `weather`, `weaponStocks`, `predictions`.
- `recommendationsStore`: Pending recommendations, status filters, active counts.
- `eventsStore`: Chronological ops events log.
- `auditStore`: Immutable audit trail of operational choices.
- `uiStore`: Navigation state, night mode, modal states, alerts drawer, toast notifications.
- `sync.ts`: Central synchronizer subscribing `dataService` directly into Zustand on app mount.

### 9.5 Interactive Data & Simulation Console (`/dev/data`)
Visit `/dev/data` to:
- Monitor live entity counts and active tracks in real time.
- Adjust simulation clock rate (`1x`, `5x`, `20x`).
- Toggle the **Planted Conflict Demo Layer** live without needing to restart the dev server.
- Inject operational contingencies with single-click tactical scenario buttons.
- Inspect, approve, or reject generated AI recommendations.
- View live raw JSON snapshots for integration verification.

---

## 10. Operational Baseline & Conflict Demo Layer (Stage 5)

### 10.1 Default Clean Baseline (M-01 .. M-10)
To enable the decision-support retasking demonstration to start from a nominal state ("all green"), the default mock dataset starts with **ZERO active conflicts**:
- **0 double-booked aircraft**: Every active and planned sortie has an exclusively assigned airframe.
- **0 double-booked crew**: Every sortie has distinct assigned personnel.
- **0 turnaround violations**: All sequential sorties have greater than the 45-minute mandatory turnaround buffer.
- **0 crew duty limit breaches**: No rostered crew exceeds the legal 12.0-hour continuous duty threshold.
- **0 airframe or qualification mismatches**: Airframes match required mission types, and aircrew possess required certifications (e.g. `CR-22` holds `SAR_RADAR` for CSAR `M-08`).
- **0 at-risk sorties**: All initial missions are nominal (`in-progress`, `planned`, or `approved`).

### 10.2 Planted Conflict Demo Layer (M-11 .. M-14)
The planted conflict scenarios created for timeline demonstration are isolated in a separate dataset layer:
- `M-11`: Northern Interdiction Strike (`at-risk`, assigned mismatched airframe `AC-23` [Helicopter-E instead of Strike-B], assigned `CR-08` with duty breach [11.2h + 4.0h = 15.2h > 12h]).
- `M-12`: Border Patrol Sweep Post-Strike (`completed`, assigned `AC-21`, `CR-21`).
- `M-13`: Reinforced Combat Air Patrol (`planned`, concurrent overlap with `M-06` double-booking airframe `AC-04` and pilot `CR-04`).
- `M-14`: Secondary Supply Staging Sweep (`planned`, starts 15m after `M-07` on airframe `AC-09`, violating 45m turnaround buffer).
- `REC-0001`: Proposed DSS recommendation swapping `AC-04` to `AC-05` to resolve double-booking.

### 10.3 Controlling the Conflict Layer
1. **Environment Flag**:
   In `frontend/.env` (or `.env.example`), set:
   ```env
   VITE_MOCK_CONFLICTS=false  # default: clean baseline (M-01..M-10)
   # VITE_MOCK_CONFLICTS=true # enables planted conflict demo layer (M-01..M-14)
   ```
2. **Runtime Dev Toggle**:
   Navigate to `/dev/data` and click the **"Enable Conflict Demo" / "Disable Conflict Demo"** toggle. The store synchronizer instantly hot-reloads the operational snapshot.

### 10.4 Canonical ID Alignment with Backend Seed
The default dataset adheres to the following ID ranges:
- **Air Bases (4)**: `BASE-A`, `BASE-B`, `BASE-C`, `BASE-D`
- **Aircraft Fleet (24)**: `AC-01` .. `AC-24`
  - `AC-01`..`AC-08`: Fighter-A (Airborne: `AC-01` on M-01, `AC-03` on M-03; Maintenance: `AC-06`; Unserviceable: `AC-02`)
  - `AC-09`..`AC-14`: Strike-B (Airborne: `AC-07` on M-04; Serviceable: `AC-09` on M-07)
  - `AC-15`..`AC-18`: Transport-C (Airborne/Serviceable: `AC-15` on M-05, `AC-16` on M-10)
  - `AC-19`..`AC-21`: Recon-D (Airborne: `AC-19` on M-02; Serviceable: `AC-20` on M-09)
  - `AC-22`..`AC-24`: Helicopter-E (Serviceable: `AC-22` on M-08)
- **Aircrew Personnel (30)**: `CR-01` .. `CR-30`
  - `CR-01`..`CR-10`: Lead Fighter Pilots
  - `CR-11`..`CR-18`: Strike Weapons Officers
  - `CR-19`..`CR-24`: Recon Systems Operators
  - `CR-25`..`CR-30`: Heavy Transport Captains
- **Missions (Default 10)**: `M-01` .. `M-10`
  - `M-01`: Northern Sentinel (CAP, Fighter-A, `AC-01`, `CR-01`, in-progress)
  - `M-02`: Eastern Border Recon Orbit (recon, Recon-D, `AC-19`, `CR-19`, in-progress)
  - `M-03`: Southern Sea Approach Patrol (CAP, Fighter-A, `AC-03`, `CR-03`, in-progress)
  - `M-04`: Central Precision Strike Sortie (strike, Strike-B, `AC-07`, `CR-07`, in-progress)
    - *SAM Demo Path*: Route B intersects SAM `THR-02` (85 km); Route C is viable dogleg bypass.
  - `M-05`: Inter-Base Munitions Airlift (airlift, Transport-C, `AC-15`, `CR-25`, in-progress)
  - `M-06`: Quick Reaction Alert (CAP, Fighter-A, `AC-04`, `CR-04`, planned)
  - `M-07`: Offensive Counter-Air Sweep (strike, Strike-B, `AC-09`, `CR-11`, approved)
  - `M-08`: Forward Strip CSAR Standby (SAR, Helicopter-E, `AC-22`, `CR-22`, planned)
  - `M-09`: Electronic Warfare Escort (escort, Recon-D, `AC-20`, `CR-20`, planned)
  - `M-10`: Scheduled Personnel Rotation (airlift, Transport-C, `AC-16`, `CR-26`, planned)
- **Threat Contacts (4)**: `THR-01` (SAM, 65km), `THR-02` (SAM, 85km), `THR-03` (CAP Bogey), `THR-04` (Radar Site)
- **Airspace Zones (4)**: `AS-01` (Transit Corridor Echo), `AS-02` (Restricted Range Bravo), `AS-03` (No-Fly Northern Border), `AS-04` (Maritime Danger Area)
- **Audit Entries (3 baseline)**: `AUD-0001`, `AUD-0002`, `AUD-0003`

### 10.5 Pure Conflict Detection Engine (`src/lib/conflictDetection.ts`)
Conflict evaluation is implemented as a **pure function**:
```ts
export function detectMissionConflicts(
  missions: Mission[],
  aircraft: Record<string, Aircraft>,
  crew: Record<string, Crew>,
  turnaroundMinutesOrRefTime?: number | string | Date,
  optionalTurnaroundMinutes?: number,
): ConflictDetectionResult;
```
- **Guarantees**:
  - ZERO Zustand store access
  - ZERO `Date.now()` or host system clock dependence
  - ZERO React hooks or JSX rendering
  - 100% deterministic testability in Vitest
- **Detects 5 Critical Conflict Conditions**:
  1. `double_booked_aircraft`: Concurrent scheduling of identical airframe across overlapping sortie windows.
  2. `double_booked_crew`: Concurrent assignment of same aircrew personnel across overlapping sorties.
  3. `insufficient_turnaround`: Sorties on the same airframe with departure buffers below the turnaround threshold (default 45 min).
  4. `crew_duty_limit_breach`: Assigned aircrew projected duty hours exceeding 12.0 hours.
  5. `resource_mismatch`: Aircraft type mismatch or aircrew missing required qualifications.


