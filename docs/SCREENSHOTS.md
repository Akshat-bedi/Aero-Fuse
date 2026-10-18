# AirOps DSS — Presentation Screenshot & Capture Checklist

This document details the essential high-resolution screens and operational states to capture for the mission presentation, technical evaluation, and demonstration slides.

> **Simulation Rule**: All entities, airbases, callsigns, coordinates, and units shown in these captures are **strictly fictional and simulated**.

---

## 1. Primary Operational Views

### [ ] 1. Tactical Common Operating Picture (COP) — Daytime Baseline
- **Route**: `/`
- **Setup**: Clean nominal baseline, all systems green.
- **Key Elements to Highlight**:
  - Full-width top classification banner: `EXERCISE // SIMULATED DATA // NOT REAL OPERATIONS`.
  - Tactical top bar with dual clocks (Local + Zulu), connection status pill (`MOCK` or `LIVE`), operator callout (`COL. J. MERCER / OPS CONTROLLER`).
  - MapLibre planar tactical map with Republic of Veridia territory bounds (0–10°N, 0–12°E).
  - 4 Air Bases (`BASE-A` through `BASE-D`) with runway condition badges and weather icons.
  - Active sortie tracks (`M-01` to `M-10`) with waypoints and directional headings.
  - Left tactical navigation rail (expanded or compact mode).
  - Floating layer controls panel (Airbases, Sorties, Corridors, Threats, Radar).

### [ ] 2. Tactical Common Operating Picture (COP) — Night Vision Mode
- **Route**: `/` (Press `N` or click Sun/Moon icon in top bar)
- **Setup**: Red-shifted, low-lumen tactical ops room lighting scheme.
- **Key Elements to Highlight**:
  - Zero harsh blue/cyan light; strict low-light red/charcoal contrast meeting WCAG AA.
  - Night-vision map palette, preserving layer symbol legibility.
  - Dual Zulu/Local clock cell in red accents.

### [ ] 3. ATO Sortie Collision Detection & Threat Envelope Intersection
- **Route**: `/` (Trigger Demo Step 2/3 or inject SAM Threat on Route B)
- **Setup**: Active SA-11 SAM site (`THR-02`) detected near Contested Hub Oscar.
- **Key Elements to Highlight**:
  - Threat engagement ring (85 km radius) intersecting Sortie `M-04` along Route B.
  - Sortie `M-04` highlighted in bold warning/critical amber-red.
  - Persistent impact analysis notification banner.
  - Tactical alert bell badge in top bar showing incremented unacknowledged alert count.

### [ ] 4. 4-Stage Automated Retasking Engine Telemetry
- **Route**: `/` (Trigger Demo Step 4)
- **Setup**: Retasking engine computing contingency plan.
- **Key Elements to Highlight**:
  - Retask progress progress bar animating through stages:
    1. `Fusing telemetry & threat coordinates...`
    2. `Validating range, fuel, crew duty & weapon load...`
    3. `Evaluating route doglegs and alternate airframes...`
    4. `Ranking Pareto trade-offs & confidence scores...`
  - Visual indication of AI decision support without human commander disenfranchisement.

---

## 2. Decision Support & Human Commander Approval

### [ ] 5. Recommendation Card with Before/After Plan Comparison
- **Route**: `/recommendations` or COP Docked Panel
- **Setup**: Recommendation `REC-0001` selected.
- **Key Elements to Highlight**:
  - Prominent banner: `RECOMMENDATION ONLY - REQUIRES COMMANDER APPROVAL`.
  - Proposed changes list: Reroute `M-04` from Route B to Route C, Airframe swap `AC-07` -> `AC-11`.
  - Multi-criteria trade-off metrics: Threat exposure (-92%), Delay (+12 min), Fuel burn (+6%).
  - Constraints satisfied: Aircraft type match, Aircrew duty qualification, Weapon magazine inventory.
  - Plan comparison toggle: `BEFORE` vs `AFTER` showing ghost sortie overlays on the tactical map.
  - Primary commander action buttons: `APPROVE`, `MODIFY`, `REJECT`.

### [ ] 6. Air Tasking Order (ATO) Missions Board & Sortie Gantt Timeline
- **Route**: `/missions`
- **Setup**: View switcher toggled between Kanban Board, Sortie Timeline, and Data Table.
- **Key Elements to Highlight**:
  - 3-column Kanban board: `PLANNED`, `IN-PROGRESS / APPROVED`, `COMPLETED / REST`.
  - Sortie cards with priority tags (P1–P4), airframe tail IDs, aircrew callsigns, and window times.
  - Sortie Gantt Timeline view with time-scrubber and ghost bars for proposed schedule modifications.
  - Mission Detail Drawer showing side-by-side required vs assigned resources.

---

## 3. Readiness, Cryptographic Ledger & Sandboxed Simulation

### [ ] 7. Fleet Readiness & Logistics Console
- **Route**: `/resources`
- **Setup**: Tabs: `Aircraft Readiness`, `Aircrew Status`, `Weapons & Logistics`, `Predictive Insights`.
- **Key Elements to Highlight**:
  - Reusable `ReadinessStrip` showing theatre-wide availability metrics.
  - Aircraft status donut chart and base-by-base inventory bar chart.
  - Fleet table with airframe health, fuel percentage, and next service interval.
  - Aircrew tab: fatigue index gauges (0–100) and duty-hour limits.
  - Predictive insights tab: 6-hour machine-learned airframe unscheduled maintenance warnings.

### [ ] 8. What-If Scenario Simulator (Simulation Safety Isolation)
- **Route**: `/scenarios`
- **Setup**: Running contingency simulation (BASE-B runway cratering outage + 20% crew reduction).
- **Key Elements to Highlight**:
  - Persistent dashed amber border and prominent header: `SIMULATION - NOT LIVE OPERATIONS`.
  - Preset selector and parameter adjustment sliders (aircraft loss, base outage hours, crew availability, weather severity).
  - Side-by-side KPI cards comparing Baseline vs Scenario metrics.
  - Time-series degradation charts (missions fulfilled, average delay, aircraft utilization).
  - Absolute isolation: live COP state and pending recommendations remain 100% unmutated.

### [ ] 9. Immutable Cryptographic Audit Ledger
- **Route**: `/audit-log`
- **Setup**: After approving a recommendation in demo mode.
- **Key Elements to Highlight**:
  - Verified chain banner: `CRYPTOGRAPHIC INTEGRITY VERIFIED (N/N BLOCKS INTACT)`.
  - Log table displaying Zulu timestamps, action types (`DECISION_APPROVE`), operator ID (`COL. J. MERCER`), operational rationale, and 64-character SHA-256 block hashes (`hash` and `prevHash`).
  - Search and filter controls by action type and operator.

---

## 4. Operational Ergonomics & Offline Verification

### [ ] 10. Guided Demo Mode Step-Guide HUD
- **Route**: Any screen (Press `d` or click `DEMO` in top bar)
- **Setup**: Demo walkthrough step 3 or 5 active.
- **Key Elements to Highlight**:
  - Docked military HUD panel with step counter (`STEP X OF 9`), progress bar, and narration text.
  - Controls: `Prev`, `Pause/Play`, `Next`, `Reset Initial State`, `Exit`.
  - Collapsible minimized mode ensuring zero map or timeline obstruction.

### [ ] 11. Tactical Keyboard Shortcuts Reference Modal
- **Route**: Any screen (Press `?` on keyboard)
- **Setup**: Modal displaying operational keybindings.
- **Key Elements to Highlight**:
  - Two-key navigation chords (`g` then `c`/`m`/`r`/`s`/`a`/`l`).
  - Quick action keys (`A` approve, `R` reject, `N` night vision, `/` search, `Esc` close).
  - Note indicating shortcuts are disabled during text input.

### [ ] 12. Air-Gapped Offline Compliance Terminal Output
- **Command**: `npm run check:offline`
- **Key Elements to Highlight**:
  - Zero unauthorized external network URLs.
  - 100% local fonts, local audio chimes, local vector tiles, and localhost telemetry.
