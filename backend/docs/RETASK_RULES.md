# Retask rules (B6a thin slice)

Status: **rule-based retasking slice** (Stage B6a). This is the explainable,
deterministic fallback that the CP-SAT optimiser (B5) will replace behind the
same `RetaskEngine` boundary. It recomputes plans but **never changes the live
plan**: only the event's own factual effect is applied when the event is
injected. Approval and plan application land in B8a.

Code map:

| Module | Responsibility |
|---|---|
| `app/retask/impact.py` | Which missions an event affects, why, most urgent, decision clock |
| `app/retask/geometry_lite.py` | Local-projection distance, segment/ring exposure, route assessment |
| `app/retask/eligibility.py` | Free/eligible aircraft and crew for a mission |
| `app/retask/rules/` | One candidate-plan builder per event type + shared helpers |
| `app/retask/engine.py` | Three profiles, alternatives, scoring, explanations, no-feasible result |
| `app/retask/apply.py` | Pure application of a `Change` list to a state copy |
| `app/retask/validate.py` | Independent light validator that gates every candidate |
| `app/retask/pipeline.py` | Off-request async analysis, progress frames, alerts, generation counter |
| `app/retask/demos.py` | The two scripted demo sequences |

## 1. Guardrails

- **Pure/deterministic.** Same state version + same event => identical primary
  recommendation and alternatives (ids, strings, scores, ordering). No wall
  clock, no randomness.
- **No live mutation.** Candidate plans are applied with `apply_changes` to a
  deep copy (`StateStore.copy()`). The pipeline only stores the emitted
  `Recommendation`; `stateVersion` is not bumped for recommendations.
- **Ordered work.** The engine iterates missions in impact order (priority
  then id) and sorts every candidate list with explicit tie-breakers.
- **No false feasibility.** Every surviving plan passes `check_plan_lite`; if
  none passes and a P1/P2 mission cannot be covered, the result is an explicit
  **NO FEASIBLE PLAN** recommendation.
- **ASCII output.** Summaries use `->`, never Unicode arrows (Windows console).

## 2. Pipeline and wire sequence

`POST /api/events` applies the factual change, bumps `stateVersion`, broadcasts
`EVENT_INJECTED` + `ENTITY_UPDATE`, returns `201` and *then* queues retasking.
The single FIFO worker emits:

```
IMPACT_ANALYSIS -> ALERT -> RETASK_PROGRESS(fusing, constraints, optimising, ranking)
                -> RETASK_PROGRESS(ready) -> RECOMMENDATION_READY
```

All pipeline frames carry the store's current `stateVersion` (no bump).
`RETASK_PROGRESS` messages and the ready text match
`frontend/src/features/.../retaskService` exactly. One alert per event with
`id = "<event>-AL"` and severity/type derived from the event. `/sim/control
reset` increments a generation counter; queued/in-flight analyses compare it
before every stage and before storing the recommendation, so a reset is never
overwritten.

## 3. Impact analysis

All reasons are generated from the state and name concrete entities (mission,
threat/base/aircraft/crew) so the UI can show them verbatim. Decision time is
5 sim minutes for every event type.

| Event | Missions flagged | Reason |
|---|---|---|
| `THREAT_DETECTED` | Each active mission whose clearance geometry intersects the new threat, **or** that is in progress and recovers at a base inside the ring | Threat id, type, range, exposure km |
| `AIRCRAFT_UNSERVICEABLE` | Missions currently assigned that aircraft (in-progress and planned) | Tail/id and reason |
| `BASE_CLOSED` | Missions launched from the base plus missions (including in-progress) whose route recovers there (last waypoint within 1 km) | Launch/recovery relationship and runway status |
| `WEATHER_DEGRADED` | Missions launched from the affected base, plus in-progress missions recovering there | Base/region and severity |
| `CREW_UNAVAILABLE` | Missions assigned that crew member | Crew id and reason |
| `NEW_PRIORITY_MISSION` | The new mission itself first (most urgent), then lower-priority planned/approved missions of the same aircraft type that may be pre-empted | New tasking and candidate |

`mostUrgent` is the first item after ordering by priority (new mission first
for `NEW_PRIORITY_MISSION`), then status (in-progress before planned), then id.
Geometry is evaluated with departure/recovery endpoints stripped when they are
within 1 km of the launch base (loops would otherwise count the base as
exposed). In-progress missions are evaluated on their remaining route
(`route[currentWaypointIndex:]`; with index 0 the full route is used).

## 4. Geometry (`geometry_lite`)

- Local equirectangular projection around lat 5 / lng 6: `dx = (lng2-lng1) *
  111.32 * cos(5 deg)`, `dy = (lat2-lat1) * 110.57`; distance and point-to-
  segment distance in km.
- Segment/ring exposure: exact clipped length of the segment inside the threat
  circle (sampled intersection of the line with the circle).
- Route exposure sums segment exposure; a route "clears" a threat when total
  exposure is 0.
- Route options are assessed individually with their own waypoints; route
  distance uses the seed `distanceKm` for display/tradeoffs when available
  (the raw polyline can double-count a dogleg that returns near the target).

This module is deliberately replaceable by B4's geo engine.

## 5. Candidate rules

### Threat detected (`rules/threat.py`)

For each affected mission:

1. If an alternate route option has zero exposure, switch to it. Profile
   choice: `min_disruption` -> shortest distance; `min_risk` -> lowest
   `riskScore` then distance; `max_coverage` -> keep the current route if it
   clears, else lowest risk.
2. If no option clears but exposure can be reduced, switch to the least-exposed
   option and add a relaxation explaining the remaining exposure.
3. Otherwise keep the route and add a prominent relaxation with the exposure
   that is accepted. P1/P2 missions are **not** failed purely for residual
   threat exposure.

Demo 1: M-04 (Route B) and M-05 (recovers at BASE-B) are flagged; Route C
clears, so the primary is "M-04 rerouted via Route C." (score 90.2).

### Aircraft unserviceable (`rules/aircraft.py`)

Hot-swap the affected sortie to a free, serviceable aircraft of the required
type. Candidates prefer the launch base, then (profile-dependent) lowest
flight-hours-to-service (`min_risk`), highest fuel, or highest fuel
(`max_coverage`). No spare: P1/P2 -> plan failure; P3/P4 -> cancel and note it.
A swap from a different base, or from a base whose runway is not open, adds a
relaxation (ferry/recovery assumed).

### Base closed (`rules/base_ops.py`)

Every affected mission has its launch base (planned/approved) or recovery base
(in-progress) changed to an open alternate. Alternate selection prioritises:
`min_disruption` -> nearest; `min_risk` -> least threat coverage around the
base; `max_coverage` -> most spare aircraft. Bases whose weapon stock cannot
cover the mission are used only with a resupply relaxation if nothing better
exists. No open base: P1/P2 failure, lower priority cancelled.

### Crew unavailable (`rules/crew.py`)

Re-pair with an available, rested crew member holding all required
qualifications and within the 12 h duty limit. Same base first, then lowest
fatigue. Same failure/cancel split by priority; cross-base assignments add a
"crew transport assumed" relaxation.

### Weather degraded (`rules/weather.py`)

- `nominal`: no change.
- `severe` and a base is known: relocate planned/approved sorties to an open
  base; in-progress missions whose recovery is at the base are diverted.
- otherwise: hold the sortie (`caution` 15 min, `severe` 30 min) via a `delay`.

### New priority mission (`rules/priority.py`)

One lower-priority planned/approved mission of the same type may be pre-empted
(cancelled) to free resources. Then assign a serviceable aircraft and an
available qualified crew (same base first). The `new_assignment` change makes
the mission `approved` only in the computed plan; the live mission stays
`planned` until B8a applies a decision. No resources: P1/P2 failure, lower
priorities remain unassigned with a relaxation.

## 6. Profiles and alternatives

`PROFILES = ("min_disruption", "min_risk", "max_coverage")`. Each profile runs
all applicable rules and produces one candidate. Candidates are deduplicated by
their change tuple. If fewer than three remain, hold variants are added for the
highest-value impacted mission (10 then 20 minutes), keeping the seed plan's
changes and appending a `delay`; variants must also pass the validator. The
primary is the best-scoring candidate under the fixed weights below; the two
alternatives are the next best (deduped) and are also embedded in
`primary.alternatives` so the comparison chart works from either shape.
Alternative ids: `REC-0001-ALT1`, `REC-0001-ALT2`.

## 7. Scoring and presentation

```
score = 0.35 * coverage
      + 0.25 * threat_avoidance
      + 0.15 * fuel_efficiency
      + 0.10 * schedule
      + 0.15 * fleet_margin
```

- **Coverage**: priority-weighted share of active missions with both aircraft
  and crew (`P1=1000, P2=300, P3=100, P4=30`).
- **Threat avoidance**: `100 - 400 * exposure/distance` against the triggering
  threat (or all threats when the event is not a detection), clamped 0–100.
- **Fuel efficiency**: `100 - 4 * mean sortie fuel burn (%)`, clamped.
- **Schedule**: `100 - 2 * total delay minutes` for impacted missions, clamped.
- **Fleet margin**: percentage of ready airframes left unassigned.
- **Confidence**: `max(0.4, min(0.92, 0.86 - 0.05 * len(constraintsRelaxed)))`.
- `criteriaScores` exposes exactly the five chart labels: `Overall
  Feasibility` (= score), `Threat Avoidance`, `Fuel Efficiency`, `Schedule
  Adherence`, `Fleet Margin Preserved`.
- Tradeoffs are derived from the changes (route distance/risk, delay, swap
  margin, etc.) with `good|bad|neutral` directions.
- Summary strings cover every change and always end with `.`; no changes reads
  "No plan changes required; monitor the situation."

## 8. Application and validation semantics

`apply_changes(state, changes)` (pure):

| Kind | `before` / `after` | Effect |
|---|---|---|
| `reroute` (option) | route-option id | Planned: replace route. In-progress: rotate the option from the nearest waypoint, prepend the current airborne position, `currentWaypointIndex=0` |
| `reroute` (base) | base id | Update `launchBaseId` and move assigned aircraft/crew `baseId`; planned routes swap endpoints within 1 km of the old base. In-progress = recovery diversion only |
| `aircraft_swap` | aircraft ids | Reassign; in-progress transfers airborne position/heading/speed to the replacement (hot-swap) |
| `crew_swap` | crew ids | Reassign; in-progress replacement becomes `on-mission` |
| `delay` | new ISO start | Shift the window start; preserve duration |
| `cancel` | - | Cancel and free aircraft/crew |
| `new_assignment` | `{aircraftIds, crewIds}` | Assign and mark `approved` |

`check_plan_lite(state, changes)` applies to a copy and returns human-readable
violations (empty = valid):

- required aircraft type and readiness (`serviceable|turnaround`, plus
  `airborne` for in-progress);
- required crew qualifications and `dutyHoursLast24h + sortie <= 12 h`;
- no shared aircraft inside a 45 min turnaround; no shared crew overlap;
- weapon demand per launch base <= stock;
- fuel >= `distance/speed * burn + 15%` reserve.

## 9. No feasible plan

If every P1/P2 candidate fails (no compatible spare, no open base, no rested
crew, no resources for a new P1/P2 tasking) the proposal is:

- summary prefixed `NO FEASIBLE PLAN`;
- `changes=[]`, `score=10.0`, `confidence=0.3`;
- shortfalls listed in `constraintsRelaxed` (validator/rules text);
- critical `conflict` alert; the recommendation is still stored so the
  commander sees the explicit failure.

## 10. Demo scripts

`GET /api/demo-scripts` lists:

1. `sam-route-b` — injects a 85 km SAM at M-04 Route B's first interior
   waypoint `(4.8, 7.4)` (confidence 0.9). Expected: M-04 + M-05 impacted,
   primary reroute to Route C (90.2), two alternatives (10/20 min holds).
2. `runway-closure-aog` — closes BASE-B for 6 h (EV-0001), then marks AC-07
   unserviceable with a hydraulic AOG reason (EV-0002). Expected: first
   recommendation diverts M-04/M-05/M-07 to BASE-D (72.3); second swaps
   AC-07 -> AC-10 (74.7) and flags AC-10's closed-base recovery assumption.

`POST /api/demo-scripts/{name}/run?reset=true` resets first. Scripts run in the
background, spacing steps by `DEMO_STEP_DELAY_S` sim seconds (scaled by sim
speed, pause-aware), and the API returns immediately with
`{status:"started", eventCount:N}`. A concurrent run returns `409`, unknown
names `404`. Run `python scripts/demo_dump.py` to print the full expected
artefacts for both demos.

## 11. Determinism, performance, limitations

- Deterministic: candidate ordering, tie-breakers and holds are fully specified;
  tests compare serialised recommendations across independent seed loads.
- Local runtime for both demos in tests is well under the 5 s target
  (`min_stage_ms` only pads the demo animation).
- Limitations (accepted for B6a): straight-segment geometry; threats evaluated
  at their current position for the whole sortie; no time-phased airspace;
  base closure duration is not independently persisted (B4); no per-minute
  launch offsets; no CP-SAT optimality; no decision application/audit chain
  (B8a); no fusion/prediction inputs yet. B5/B4 replace these while keeping the
  engine protocol and wire shapes.

## 12. Verify

```powershell
cd backend
python -m pytest tests/test_retask_*.py -q
python tasks.py check
python scripts/demo_dump.py
```
