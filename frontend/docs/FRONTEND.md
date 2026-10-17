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

