# AirOps DSS Backend

FastAPI backend for **AirOps DSS** (SIH 26250): a fused operational picture,
constraint-based resource optimisation, dynamic retasking, predictions and a
hash-chained audit log. **Fictional data only; runs fully offline.**

Current stage: **B0 — scaffold and tooling.** The only endpoint is
`GET /api/health`; data, WebSocket and optimisation layers land in later stages
(see `../ROADMAP.md`).

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
# {"status":"ok","version":"0.1.0","simTime":null,"solverReady":false}
```

## Tasks

`make` is not used on this project; `tasks.py` is the cross-platform runner.

| Command | What it does |
|---|---|
| `python tasks.py install` | Create `.venv` and install deps (`.[dev]`) |
| `python tasks.py run` / `serve` | Uvicorn on port 8000, with / without reload |
| `python tasks.py test` | pytest |
| `python tasks.py lint` | `ruff check` |
| `python tasks.py format` | `ruff format` + safe fixes |
| `python tasks.py typecheck` | `mypy` (strict) |
| `python tasks.py check` | lint + typecheck + test |

## Configuration

Settings come from environment variables or a local `.env` (see `.env.example`);
parameters are documented there. Defaults are deterministic demo values.

## Docker

```powershell
docker compose up --build
# API on http://localhost:8000; container needs no outbound network at runtime
```

Docker was not available on the B0 development machine, so the image is
unverified — treat this as best effort until B10.

## Layout

```
app/
  main.py            FastAPI factory, CORS, middleware wiring
  config.py          pydantic-settings configuration
  logging_setup.py   JSON logging with request ids
  middleware.py      per-request correlation id
  errors.py          RFC 7807 problem+json handlers
  api/               routers (health now; ws.py in B2)
  domain/            Pydantic models (camelCase wire aliases)
  fusion/  state/  sim/  geo/  optimiser/  retask/
  predict/  scenarios/  audit/  security/   (stage skeletons)
tests/               pytest suite + offline socket guard
tasks.py             cross-platform task runner
```

Conventions: camelCase JSON on the wire / snake_case in Python, ISO-8601 UTC
times, RFC 7807 errors, no outbound network calls, deterministic with `SEED`.
