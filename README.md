# AirOps DSS — Dynamic Air Operations Decision-Support System

**AirOps DSS** is an air-gapped, explainable decision-support platform designed for an Air Force Operations Centre. It fuses heterogeneous real-time operational streams—airframe serviceability, aircrew duty cycles, weapons inventories, airspace corridors, meteorological forecasts, radar threats, and Air Tasking Order (ATO) priorities—into a unified tactical operating picture.

When unexpected operational friction occurs (e.g. pop-up surface-to-air missile threats, runway cratering, or sudden maintenance failures), AirOps DSS automatically assesses multi-sortie impacts, evaluates trade-offs, and proposes actionable retasking plans for human commander approval in seconds.

> **CRITICAL SIMULATION NOTICE**: All data, territories (Republic of Veridia), bases, units, airframe tail IDs, callsigns, operational events, and scenarios in this repository are **strictly fictional and simulated**. They do not reflect real-world military installations, geographies, operations, or tactics.

---

## Architecture Overview

```text
       ┌─────────────────────────────────────────────────────────────┐
       │                 AirOps DSS Command Console                  │
       │                   (React 18 + TypeScript)                   │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
  REST API / WebSockets                              In-Memory Mock Engine
 (LiveDataService - Stage 9)                      (MockDataService - Stages 1-8)
  - GET  /api/health                               - Deterministic seed dataset
  - GET  /api/snapshot                             - Dynamic 4-stage replanning
  - POST /api/events                               - Conflict detection engine
  - POST /api/recommendations/{id}/decision        - Pure scenario perturbation
  - WS   /ws (SNAPSHOT, TICKS, ALERTS)             - SHA-256 hash-chained ledger
            │                                                   │
            └─────────────────────────┬─────────────────────────┘
                                      │
                  ┌───────────────────┴───────────────────┐
                  │        Canonical Zustand Store        │
                  │   entitiesStore • recommendationsStore │
                  │     uiStore • auditStore • alertsStore│
                  └───────────────────┬───────────────────┘
                                      │
      ┌───────────────┬───────────────┼───────────────┬───────────────┐
      │               │               │               │               │
  ┌───┴────┐     ┌────┴───┐      ┌────┴───┐      ┌────┴───┐      ┌────┴───┐
  │  COP   │     │Missions│      │Fleet   │      │Decision│      │Audit & │
  │Tactical│     │Board & │      │Readiness│     │Support │      │Scenario│
  │  Map   │     │Timeline│      │Console │      │Panel   │      │Sandbox │
  └────────┘     └────────┘      └────────┘      └────────┘      └────────┘
```

---

## Key Features

1. **Common Operating Picture (COP)**:
   - High-performance MapLibre GL tactical planar map of the Republic of Veridia (`0.0–10.0°N`, `0.0–12.0°E`).
   - Single-mount lifecycle architecture: zero canvas flicker, stable camera position across 1-second simulation ticks.
   - Interactive layer controls for Air Bases, Sortie Corridors, Threats, and Radar envelopes.
   - BEFORE / AFTER visual retask plan comparison overlay displaying ghost routes.

2. **Missions Management (ATO Console)**:
   - 3-view switcher: Kanban board, Sortie Gantt timeline, and sortable data table.
   - Sortie collision detection tagging at-risk sorties (`M-04`) upon corridor threat intersection.
   - Side-by-side required vs assigned resource mismatch validator.

3. **Fleet Readiness & Aircrew Logistics**:
   - Fleet health breakdown (Serviceable, Airborne, Maintenance, AOG, Turnaround).
   - Aircrew duty-window monitoring with fatigue index gauges (`0–100`) and rest limit warnings.
   - Depot weapons magazine stock tracking across all 4 airbases.
   - 6-hour machine-learned predictive maintenance forecasting.

4. **Automated 4-Stage AI Retasking Engine**:
   - Sequential progression: **Sensor Fusion** → **Constraint Check** → **Route Optimisation** → **Multi-Criteria Ranking**.
   - Generates concrete proposals (e.g. `REC-0001`: reroute `M-04` via Route C dogleg and swap `AC-07` for `AC-11`).
   - Quantified Pareto trade-offs (threat exposure delta, delay delta, fuel burn delta).

5. **Human-in-the-Loop Commander Approval**:
   - Prominent indicator: `RECOMMENDATION ONLY - REQUIRES COMMANDER APPROVAL`.
   - Actions: `APPROVE`, `MODIFY` (with constraint conflict validation), and `REJECT`.
   - Atomic plan updates reflected instantly across map, board, and timeline.

6. **What-If Scenario Sandbox (Simulation Safety)**:
   - Sandboxed sandbox testing aircraft losses, base runway outages, crew availability drops, and severe weather.
   - **Core Invariant**: Scenario runs execute against cloned in-memory state and **never** mutate live COP entities, pending recommendations, or audit logs.
   - Persistent `SIMULATION - NOT LIVE OPERATIONS` banner and dashed amber boundary.

7. **Cryptographic SHA-256 Audit Ledger**:
   - Every commander decision and injected event is recorded in a tamper-evident hash-chained ledger.
   - One-click cryptographic verification button verifying hash links with zero tolerance for broken links.

8. **Operational Alerts System**:
   - Right-hand drawer feed supporting `critical`, `warning`, and `info` severities across 7 operational types.
   - Individual alert acknowledgement and "Ack All" bulk actions.
   - Offline local audio chime (`/sounds/alert.wav`), muted by default with toggle.

9. **Guided Demo Mode Walkthrough**:
   - 3-minute scripted story covering the complete operational cycle: Clean Baseline → SAM Incursion → Conflict Detection → AI Retask Progress → Before/After Diff → Commander Approval → Audit Link → What-If Sandbox → Summary.
   - Interactive HUD overlay with narration, step counter, pause/play, next/prev, and reset controls.

10. **Tactical C2 Military Design**:
    - Flat utilitarian military aesthetic: 1px borders, 2px maximum radius, charcoal/graphite surfaces, amber focus accents.
    - Zero glowing pills, bubbly cards, gradients, or AI sparkles.
    - Low-lumen red-shifted Night Vision Mode (press `N`).
    - Full keyboard navigation (press `?` for shortcuts reference).

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework & Language** | React 18, TypeScript 5, Vite 6 |
| **State Management** | Zustand 5 (Normalized stores with selective subscriptions) |
| **Tactical Mapping** | MapLibre GL 4 (Offline planar projection, GeoJSON layers) |
| **Data Visualisation** | Apache ECharts 5 (Flat C2 dark palette, hairline grids) |
| **Styling & Icons** | Tailwind CSS 3, Lucide Icons, Custom Tactical Tokens |
| **Testing & Quality** | Vitest 3, React Testing Library, ESLint 9 |
| **Offline Verification** | Custom Node.js air-gap compliance scanner |

---

## Getting Started

### Prerequisites
- Node.js `v20.x` or later (tested on Node `v24.x`)
- npm `v10.x` or later

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/aero-fuse.git
cd aero-fuse/frontend

# Install dependencies
npm install
```

---

## Running the Application

### 1. Offline Mock Mode (Default)
Runs 100% self-contained in the browser with the internal mock operations engine. Zero external network requests.

```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. Live Telemetry Mode (with Fake Backend)
Simulates a live FastAPI backend streaming WebSocket telemetry, heartbeats, and REST endpoints.

```bash
# Terminal 1: Launch the mock backend server (REST on :8000, WS on :8000/ws)
cd frontend
npm run fake-backend

# Terminal 2: Launch the frontend in live mode
cd frontend
# (Ensure VITE_DATA_SOURCE=live in frontend/.env or launch directly)
npm run dev
```

---

## Running the Guided Demo Walkthrough

The guided walkthrough runs a complete 3-minute scripted mission cycle demonstrating decision support under pressure:

1. **Launch the app** and navigate to the Common Operating Picture (`/`).
2. **Start Demo Mode**:
   - Click the `DEMO` button in the top bar, **or**
   - Press the key `d` on your keyboard.
3. **Follow the Step-Guide HUD**:
   - **Step 1 (Baseline)**: All systems green across Republic of Veridia.
   - **Step 2 (Threat)**: Pop-up SAM site detected intersecting Route B.
   - **Step 3 (Impact)**: Sortie `M-04` tagged at-risk with cross-module highlighting.
   - **Step 4 (Retasking)**: Watch the 4-stage replanning engine progress bar animate.
   - **Step 5 (Proposal)**: Review recommendation `REC-0001` with the BEFORE/AFTER route diff.
   - **Step 6 (Approval)**: Approve the retask plan, committing changes atomically.
   - **Step 7 (Audit)**: Inspect the immutable SHA-256 block hash appended to the ledger.
   - **Step 8 (What-If)**: Run the sandboxed contingency scenario and evaluate degraded KPIs.
   - **Step 9 (Debrief)**: Operations summary and return to COP.
4. **Controls**:
   - `Next` / `Prev`: Step through manually or let the countdown timer auto-advance.
   - `Pause` / `Play` (or `Space`): Halt or resume the timer.
   - `Reset Initial State`: Clears all events, recommendations, and alerts, restoring the clean baseline at any time.
   - `Exit` (or `Esc`): Close the demo overlay.

---

## Keyboard Shortcuts

Press `?` on any screen to open the interactive tactical keyboard reference:

| Keybinding | Action |
| :--- | :--- |
| `g` then `c` | Navigate to Common Operating Picture (COP) |
| `g` then `m` | Navigate to Missions Management |
| `g` then `r` | Navigate to Fleet Readiness & Logistics |
| `g` then `s` | Navigate to What-If Scenario Simulator |
| `g` then `a` | Navigate to Cryptographic Audit Log |
| `g` then `l` | Navigate to Tactical Alerts Feed |
| `/` | Focus tactical search input |
| `A` | Approve focused pending recommendation (with confirmation dialog) |
| `R` | Reject focused pending recommendation (with confirmation dialog) |
| `d` | Toggle Guided Demo Mode |
| `N` | Toggle Night Vision Mode |
| `?` | Open Keyboard Shortcuts Reference |
| `Esc` | Close dialogs, drawer, or exit demo mode |

*Note: All shortcuts are automatically suppressed when typing inside search inputs or form fields.*

---

## Verification & Compliance Testing

```bash
cd frontend

# Run all 16 Vitest test suites (120+ tests)
npm test -- --run

# Run ESLint validation (0 errors, 0 warnings enforced)
npm run lint

# Compile production bundle (TypeScript strict check + Vite rollup)
npm run build

# Run Air-Gapped Offline Verification Scanner
npm run check:offline
```

### Confirming Offline Integrity in Browser
1. Open DevTools (`F12`) and select the **Network** tab.
2. Filter by `All` and reload the page (`Ctrl + R`).
3. Confirm that **every request** is served from `localhost:5173` (static assets, fonts, audio) or `localhost:8000` (telemetry).
4. Zero requests are dispatched to external CDNs, Google Fonts, or cloud analytics.

---

## Documentation Links

- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — Single authoritative integration contract between frontend and backend.
- [frontend/docs/FRONTEND.md](frontend/docs/FRONTEND.md) — Frontend architecture, C2 military styling guidelines, and state flow.
- [docs/SCREENSHOTS.md](docs/SCREENSHOTS.md) — Structured presentation capture checklist for key operational screens.
