"""Canonical world seed loader.

``shared/seed/world.json`` is the authoritative baseline dataset exported from
the frontend mock engine. It must round-trip exactly through the domain models
(``tests/test_seed_parity.py``) and satisfy the scheduling baseline
(``tests/test_seed_baseline.py``).

Baseline quirk reproduced as-is: ``M-04`` is assigned Route B, whose corridor
crosses active SAM threat ``THR-02`` (85 km, position 4.8/7.5). The frontend
still treats the day as all-green because its conflict checker covers
scheduling constraints, not threat geometry. Do not "fix" the seed; threat and
risk semantics are revisited in stage B4.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.config import get_settings
from app.domain import WireSnapshot

#: Baseline entity counts of the clean "all green" day (context.md section 10).
EXPECTED_COUNTS: dict[str, int] = {
    "bases": 4,
    "aircraft": 24,
    "crew": 30,
    "missions": 10,
    "threats": 4,
    "airspace": 4,
    "weaponStocks": 24,
    "weather": 4,
    "predictions": 8,
}


def seed_path() -> Path:
    """Resolve the configured seed file (``SEED_PATH`` environment wins)."""
    return Path(get_settings().seed_path)


def load_seed(path: str | Path | None = None) -> WireSnapshot:
    """Load and validate the canonical seed snapshot."""
    source = Path(path) if path is not None else seed_path()
    if not source.is_file():
        raise FileNotFoundError(f"seed file not found: {source} (set SEED_PATH)")
    raw = json.loads(source.read_text(encoding="utf-8"))
    return WireSnapshot.model_validate(raw)


def check() -> int:
    """Validate the seed, print entity counts and report mismatches."""
    snapshot = load_seed()
    counts = {
        "bases": len(snapshot.bases),
        "aircraft": len(snapshot.aircraft),
        "crew": len(snapshot.crew),
        "missions": len(snapshot.missions),
        "threats": len(snapshot.threats),
        "airspace": len(snapshot.airspace),
        "weaponStocks": len(snapshot.weapon_stocks),
        "weather": len(snapshot.weather),
        "predictions": len(snapshot.predictions),
    }
    ok = True
    for name, expected in EXPECTED_COUNTS.items():
        actual = counts[name]
        status = "ok" if actual == expected else "MISMATCH"
        ok = ok and actual == expected
        print(f"{name:<14} {actual:>3} (expected {expected:>3})  {status}")
    print(f"{'stateVersion':<14} {snapshot.state_version:>3}")
    print(f"{'sim.time':<14} {snapshot.sim.time}")
    return 0 if ok else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="AirOps DSS seed utilities.")
    parser.add_argument("command", choices=["check"], help="check: validate seed and print counts")
    parser.parse_args()
    raise SystemExit(check())


if __name__ == "__main__":
    main()
