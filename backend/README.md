# AirOps DSS Backend

FastAPI backend for **AirOps DSS** (SIH 26250): a fused operational picture,
constraint-based resource optimisation, dynamic retasking, predictions and a
hash-chained audit log. **Fictional data only; runs fully offline.**

Current stage: **B6a - rule-based retasking slice.** The backend serves the full
canonical snapshot, sim clock/movement, WebSocket telemetry and an async
retasking pipeline (impact analysis, alerts, progress, explained
recommendations and the two demo scripts). The CP-SAT optimiser, fusion,
predictions, scenarios and decision/audit endpoints land in later stages (see
`../ROADMAP.md`).

## Requirements

- Python 3.11+ (tested with 3.14)
- Optional: [uv](https://docs.astral.sh/uv/) for fast venv/dependency management
- Optional: Docker (image runtime is offline; the image build needs network once)

## Quick start

```powershell
cd backend

# 1. Create .venv and install the project + dev tools
python tasks.py install
# or manually:
uv venv .venv
uv pip install --python .venv -e ".[dev]"      # or: .venv\Scripts\python -m pip install -e ".[dev]"

# 2. Run the dev server on http://localhost:8000
python tasks.py run                            # --reload
python tasks.py serve                          # no reload (demo)

# 3. Verify
curl http://localhost:8000/api/health
# {"status":"ok","version":"0.1.0","simTime":"2026-10-17T12:00:00.000Z","solverReady":false}
```

Point the frontend at it with `VITE_DATA_SOURCE=live`,
`VITE_API_BASE_URL=http://localhost:8000/api`, `VITE_WS_URL=ws://localhost:8000/ws`.

## Demos

```powershell
# Both scripted demos against an in-process app, full recommendation artefacts
python scripts/demo_dump.py

# Or against a running server:
curl -X POST "http://localhost:8000/api/demo-scripts/sam-route-b/run?reset=true"
curl -X POST "http://localhost:8000/api/demo-scripts/runway-closure-aog/run?reset=true"
```

Expected flow: `EVENT_INJECTED` -> `IMPACT_ANALYSIS` -> `ALERT` ->
four `RETASK_PROGRESS` stages -> `RECOMMENDATION_READY`. The live plan does not
change until a commander decision (B8a). Rules and exact demo outputs are in
`docs/RETASK_RULES.md`.

## Tasks

`make` is not used on this project; `tasks.py` is the cross-platform runner.

| Command | What it does |
|---|---|
| `python tasks.py install` | Create `.venv` and install deps (`.[dev]`) |
| `python tasks.py run` / `serve` | Uvicorn on port 8000, with / without reload |
| `python tasks.py test` | pytest |
| `python tasks.py lint` | `ruff check .` |
| `python tasks.py format` | `ruff format` + safe fixes |
| `python tasks.py typecheck` | `mypy` (strict, app + tests) |
| `python tasks.py check` | lint + typecheck + test |

## Configuration

Settings come from environment variables or a local `.env` (see `.env.example`);
parameters are documented there. Defaults are deterministic demo values.
B6a adds `RETASK_MIN_STAGE_MS` (progress animation padding, default 600 ms) and
`DEMO_STEP_DELAY_S` (default 10 sim seconds).

## API and docs

- `docs/API_IMPLEMENTED.md` - every live REST/WebSocket frame with semantics.
- `docs/RETASK_RULES.md` - impact rules, candidate generation, profiles,
  scoring, validation, apply semantics and demo expectations.
- `docs/MODELS.md` - domain-model conventions; JSON Schemas in `docs/schemas/`.
- `docs/API_CONTRACT.md` (repo `docs/`) - frontend-maintained contract.

## Docker

```powershell
docker compose up --build
# API on http://localhost:8000; container needs no outbound network at runtime
```

Docker was not available on the development machine, so the image is unverified;
treat this as best effort until B10.

## Layout

```
app/
  main.py            FastAPI factory, CORS, lifespan
  config.py          pydantic-settings configuration
  logging_setup.py   JSON logging with request ids
  middleware.py      per-request correlation id
  errors.py          RFC 7807 problem+json handlers
  api/               routes.py + ws.py
  domain/            Pydantic models (camelCase wire aliases)
  state/             canonical store, seed loader, versioning
  sim/               clock, movement, weather drift
  retask/            impact, rules/, engine, apply, validate, pipeline, demos
  fusion/ geo/ optimiser/ predict/ scenarios/ audit/ security/   (later stages)
tests/               pytest suite + offline socket guard
scripts/             ws_listen.py, demo_dump.py
tasks.py             cross-platform task runner
```
