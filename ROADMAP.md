# AirOps DSS: Roadmap and Backend Handoff

> Companion to `context.md` (v2). `context.md` says **what the system is**; this file says **where we are, what to build next, and in what order**.
> Repo: `https://github.com/Akshat-bedi/Aero-Fuse` (monorepo: `frontend/`, `backend/`, `shared/seed/`, `docs/`).

---

## 0. Paste this into your Claude first (onboarding prompt)

```
You are helping me build the BACKEND of "AirOps DSS", a decision-support system for a
national Air Force Operations Centre (SIH problem 26250). The frontend (React) is already
built by my teammate and is the source of truth for the data contract.

Read, in this order:
1. context.md (project brief, v2) and ROADMAP.md (status and plan)
2. docs/API_CONTRACT.md, frontend/src/types/index.ts and frontend/src/lib/contractValidation.ts
   (the exact wire shapes), and frontend/scripts/fake-backend.mjs (a reference server)

Then reply with: (a) a 10-line summary of the system, (b) the 5 biggest contract details the
backend must get exactly right, (c) which backend stage we should do next given the checklist in
ROADMAP.md section 3, and (d) any contradiction you found between the documents and the code.
Do not write code until I confirm.

Rules for all work: decision support only (a human approves every plan change), explainable
recommendations, fictional data only, offline (no runtime network calls), deterministic with a
seed, camelCase JSON on the wire, FastAPI + Pydantic v2 + OR-Tools CP-SAT, one stage at a time,
and finish each stage with a report (what was built, how to run, how to test, assumptions,
anything skipped).
```

## 1. The project in one paragraph

A single decision-support dashboard that fuses data from separate air-operations systems, optimises aircraft + crew + weapons allocation to missions, predicts problems, and **retasks within seconds** when conditions change, always **recommending** and never acting on its own. The commander sees a ranked, explained recommendation, previews before/after on the map and timeline, then approves, modifies or rejects. Every decision lands in a hash-chained audit log. A what-if simulator runs on a cloned state and never touches the live plan. Everything is fictional and runs offline.

## 2. Progress so far

### Frontend (all merged to `main` unless noted)

| Stage | What it delivers | Tag |
|---|---|---|
| 0 | Vite + React + TS scaffold, Tailwind, offline fonts, folder structure | `fe-stage-0-done` |
| 1 | Design system, 15 UI components, app shell (top bar, nav, alerts drawer) | `fe-stage-1-done` |
| 2 | Shared types, `DataService` interface, mock + live services, Zustand stores, **`docs/API_CONTRACT.md`** | tag `fe-stage-2-done` was never created |
| 3 | Common Operating Picture map (offline GeoJSON, MapLibre), layers, detail panel, route-risk check | `fe-stage-3-done` |
| 4 | Resource views: aircraft, crew, weapons, predictions; readiness strip | `fe-stage-4-done` |
| 5 | Mission board (kanban/table), Gantt timeline, pure conflict detection, clean baseline | `fe-stage-5-done` |
| 6 | Event injector, impact banner, retask progress, before/after toggle, ghost bars, two demo scripts | `fe-stage-6-done` |
| Fix | Map was rebuilt every second (unstable callback); now created once, viewport persisted | in Stage 6 PR |
| Theme | Military C2 visual language (flat, dense, NATO-style symbology) | `fe-design-theme-done` |
| 7 | Recommendation card (score, diff, trade-offs, constraints, alternatives), approve/modify/reject, audit log with hash-chain verify and CSV export | `fe-stage-7-done` |
| 8 | What-if scenario simulator (builder, baseline vs scenario KPIs, charts, first point of failure, compare runs) | `fe-stage-8-done` |
| 9 | Alerts console, live data service (reconnect, stale detection, version-gap handling), contract validators, fake backend, guided demo mode, keyboard shortcuts, error boundaries, offline check | `fe-stage-9-done` |

The frontend is demo-ready on its own mock engine (130 tests passing at last report). Remaining frontend work: live integration fixes, screenshots, demo rehearsal.

### Backend

Fill this in and keep it updated (the frontend dev reads it):

- [ ] B0 Scaffold and tooling
- [ ] B1 Domain models and seed dataset (must match the frontend layout)
- [ ] B2 State store, sim clock, REST + WebSocket
- [ ] B3 Data fusion
- [ ] B4 Geo risk engine and route planner
- [ ] B5 Optimiser (CP-SAT)
- [ ] B6 Retasking engine
- [ ] B7 Predictive analytics
- [ ] B8 Decisions, staleness, audit, RBAC
- [ ] B9 What-if scenarios
- [ ] B10 Hardening, docs, packaging

## 3. Recommended backend plan (v2: "thin vertical slice first")

The frontend already works end to end on a mock. The fastest way to a convincing live demo is to get the backend serving the **same loop** early, with simple rules, and then replace the internals with the real optimiser. Judges see the UI, so a working live loop beats a perfect optimiser behind a broken integration.

**Phase 1: Be a drop-in replacement for the frontend mock (do first)**
1. **B0** scaffold.
2. **B1** models + seed that reproduces the frontend dataset (`context.md` section 10; `shared/seed/world.json` when exported). Add a seed parity test.
3. **B2** state store, sim clock (1x/5x/20x, pause, reset), `GET /health`, `GET /snapshot` (`WireSnapshot`), `POST /sim/control`, `POST /events` (applies the event's factual effect and broadcasts), WebSocket `/ws` with `SNAPSHOT` first, then `POSITION_TICK`, `CLOCK_TICK`, `EVENT_INJECTED`, `HEARTBEAT` every 5 s. CORS for `http://localhost:5173`.
   - **Checkpoint 1:** frontend set to `live` shows the baseline, moving aircraft and a LIVE indicator.
4. **B6a (rule-based slice)** implement impact analysis and a rule-based recommendation generator behind the interface the real engine will use. Cover the event types listed in `context.md` section 13 item 4. Emit `IMPACT_ANALYSIS`, `RETASK_PROGRESS` x4, `RECOMMENDATION_READY`, plus `GET /recommendations`, `/recommendations/{id}`, `/missions/{id}/eligible-resources`, `/demo-scripts`, and the two demo scripts.
5. **B8a (decisions and audit)** `POST /recommendations/{id}/decision`, `validate-modification`, hash-chained audit (`GET /audit`, `/audit/verify`, `AUDIT_APPENDED`), staleness marking.
   - **Checkpoint 2:** the full live demo works: inject SAM → impact → progress → recommendation → approve → plan and audit update.

**Phase 2: Make it real**
6. **B4** geo engine (route risk against threats and airspace, Route A/B/C risk scores, fuel and range).
7. **B5** CP-SAT optimiser with `check_plan` validator, three profiles, explanations. Swap it in behind the B6a interface. Re-run checkpoint 2.
8. **B7** predictions (`GET /predictions`, `PREDICTION_UPDATE`), feeding the optimiser.
9. **B9** scenarios (`POST /scenarios/run`, `GET /scenarios`, `GET /scenarios/{id}`), cloned state, KPIs, first point of failure.
   - **Checkpoint 3:** scenarios and predictions live in the UI.

**Phase 3: Depth and polish**
10. **B3** data fusion (seven simulated sources, quality metadata, `GET /fusion/status`, data-quality alerts).
11. **B8b** RBAC and staleness refinements; **B10** hardening, docs, Docker, benchmark, offline guard.

**If time is short, do:** B0, B1, B2, B6a, B8a (Phase 1), then B4, B5, B9, then B7, B3, B10.

## 4. Adjustments to the earlier backend stage prompts (`backend_prompts.md`)

If your teammate is already running the v1 prompts, paste this addendum before the next stage:

```
ADDENDUM (v2). The frontend is built. context.md v2 and docs/API_CONTRACT.md override the
earlier brief wherever they differ. Specifically:
1. IDs and seed: reproduce the frontend layout in context.md section 10 and `shared/seed/world.json`
   (AC-07 is a Strike-B, `VR-S07`, assigned to M-04; bases BASE-A..D; M-01..M-10; THR-01..04;
   AS-01..04). Add a seed parity test.
2. Bounds are lat 0-10, lng 0-12.
3. Wire shapes: WireSnapshot uses arrays plus stateVersion and sim{time,speed,paused}. Recommendation
   needs createdAt, stateVersion, confidence, dataFreshnessSec, alternatives, status incl.
   'stale'|'expired'. Change = {missionId, kind, before, after, note}. Tradeoff has direction.
   Mission has routeOptions (Route A/B/C with riskScore). Include the frontend extras marked
   with a star in context.md section 11.
4. Decision body: {decision:'approve'|'reject'|'modify', reason?, modifications?, operator}.
5. Impose the 45 min turnaround and 12 h crew duty limits used by the frontend conflict checker.
6. POST /events returns 201 with the full OpsEvent. Injected threats get new IDs (THR-05+).
7. Build order: implement a rule-based retask slice first (see ROADMAP.md section 3), then swap in
   the CP-SAT optimiser behind the same interface.
8. Contract tests must validate against the Pydantic models and be compared with
   frontend/src/lib/contractValidation.ts. Use frontend/scripts/fake-backend.mjs as a reference
   for message shapes.
```

## 5. Integration plan and checklist

**How to point the frontend at the backend** (frontend dev does this locally; never commit `.env`):

```
# frontend/.env
VITE_DATA_SOURCE=live
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
VITE_STALE_AFTER_SEC=15
```
Run the backend on port 8000 and the frontend with `npm run dev` (port 5173).

**Checkpoint 1: snapshot and movement**
- [ ] Top bar shows LIVE, aircraft move on the map, clock ticks, speed buttons work (`/sim/control`).
- [ ] Missions board shows M-01..M-10 with no conflicts and nothing at risk; no recommendations.
- [ ] Stop the backend: STALE or RECONNECTING appears within about 15 s with the last state kept.

**Checkpoint 2: the retasking loop**
- [ ] Inject the SAM event: `IMPACT_ANALYSIS` highlights missions, a countdown shows.
- [ ] `RETASK_PROGRESS` drives the four steps, then `RECOMMENDATION_READY` docks a card.
- [ ] Before/after toggle and timeline ghost bars appear.
- [ ] Approve: plan updates everywhere; `/audit-log` has a new entry; **Verify chain** passes.
- [ ] Reject requires a reason; Modify shows eligible resources and live validation.
- [ ] Demo 2 (runway closure + AOG) works from a reset.

**Checkpoint 3: depth**
- [ ] `/resources` Predictions tab shows live predictions.
- [ ] `/scenarios` runs against `/scenarios/run`; live state is unchanged afterwards.
- [ ] Alerts arrive over `ALERT`.
- [ ] The guided demo mode (press `d`) runs all nine steps in live mode, and Reset Baseline works.

**Rules when something does not match:** compare the payload with `contractValidation.ts`. If the frontend is wrong, the frontend dev fixes it. If the backend is wrong, the backend dev fixes it. If the contract itself needs to change, open a `contract-change` issue, agree, update `docs/API_CONTRACT.md` in the same PR.

## 6. Open questions to settle early

See `context.md` section 22 (Q1–Q7). The most important ones to settle at Checkpoint 2: the `modifications` array shape (Q2), the per-criterion alternatives scores (Q3), and the exact audit action strings (Q4).

## 7. Git workflow (summary)

```
git checkout main && git pull origin main
git checkout -b backend/stage-N-name
git branch --show-current        # always check before the first commit
... build, test, then grouped commits with conventional messages ...
git push -u origin backend/stage-N-name
# open a PR into main, get one approval, merge on GitHub
git checkout main && git pull origin main
git branch -d backend/stage-N-name
git tag be-stage-N-done && git push origin be-stage-N-done
```
- Commit in logical groups (models, services, routes, tests, docs), push after each.
- Check `git status --short` before committing: never stage `.env`, `*.db`, `__pycache__/`, `.venv/`.
- Windows tip: run `git config --global core.pager cat` to avoid the `less` pager trapping the terminal.

## 8. Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Optimiser takes too long or is infeasible live | Keep the rule-based generator as a fallback; return a labelled best-effort result; cap solver time at about 4 s |
| Seed drifts from the frontend mock | Seed parity test against `shared/seed/world.json` |
| Contract drift | Contract tests on both sides; `contract-change` issues; one canonical `docs/API_CONTRACT.md` |
| Nondeterministic demos | Fixed seed, one solver worker in demo mode, sorted candidate lists |
| Integration discovered late | Phase 1 delivers the full loop early; run the three checkpoints as each lands |
| Time pressure | Follow the "if time is short" order in section 3 |

## 9. Demo day checklist

- [ ] Backend starts offline from a clean clone using documented commands (Docker or `make run`).
- [ ] `GET /health` is green; the frontend shows LIVE.
- [ ] Reset to baseline, run Demo 1 and Demo 2 twice each in under 3 minutes without errors.
- [ ] Retask time under 5 s; audit chain verifies.
- [ ] A fallback: the frontend still runs fully on its mock engine (`VITE_DATA_SOURCE=mock`) if the backend fails.
- [ ] Screenshots captured (see `docs/SCREENSHOTS.md`); README up to date; no secrets or real data in the repo.
