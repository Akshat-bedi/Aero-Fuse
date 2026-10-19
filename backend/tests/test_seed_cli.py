"""Seed loader and CLI coverage."""

import subprocess
import sys
from pathlib import Path

import pytest
from app.state import seed as seed_module

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_load_seed_returns_validated_snapshot() -> None:
    snapshot = seed_module.load_seed()
    assert len(snapshot.bases) == 4
    assert len(snapshot.aircraft) == 24
    assert len(snapshot.missions) == 10


def test_load_seed_missing_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        seed_module.load_seed(tmp_path / "nope.json")


def test_check_reports_expected_counts(capsys: pytest.CaptureFixture[str]) -> None:
    assert seed_module.check() == 0
    output = capsys.readouterr().out
    assert "bases" in output
    assert "predictions" in output
    assert "2026-10-17T12:00:00.000Z" in output
    assert "MISMATCH" not in output


def test_module_cli_runs() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "app.state.seed", "check"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "weaponStocks" in result.stdout
    assert "MISMATCH" not in result.stdout
