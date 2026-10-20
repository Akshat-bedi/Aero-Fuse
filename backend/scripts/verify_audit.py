#!/usr/bin/env python3
"""Verify the AirOps DSS audit chain without importing the application.

Usage:
    python scripts/verify_audit.py [--db PATH_OR_SQLITE_URL]

This is intentionally stdlib-only so it can run in an air-gapped environment,
on a copied database, or from a build pipeline. Exit code 0 means the chain is
intact; 1 means the first broken link was reported; 2 means the database could
not be read.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

ZERO_HASH = "0" * 64


def canonical_hash(
    *,
    audit_id: str,
    timestamp: str,
    operator: str,
    action: str,
    target_id: str,
    details: str | dict[str, Any],
    prev_hash: str,
) -> str:
    payload = json.dumps(
        {
            "id": audit_id,
            "timestamp": timestamp,
            "operator": operator,
            "action": action,
            "targetId": target_id,
            "details": details,
            "prevHash": prev_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256((prev_hash + payload).encode("utf-8")).hexdigest()


def resolve_database(value: str) -> Path:
    if value.startswith("sqlite:///"):
        return Path(value.removeprefix("sqlite:///"))
    if value.startswith("sqlite://"):
        return Path(value.removeprefix("sqlite://"))
    return Path(value)


def verify(database: Path) -> tuple[bool, int, str, int]:
    connection = sqlite3.connect(database)
    try:
        rows = connection.execute(
            "SELECT seq, id, timestamp, operator, action, target_id, "
            "details_json, prev_hash, hash FROM audit_entries ORDER BY seq"
        ).fetchall()
    finally:
        connection.close()

    previous = ZERO_HASH
    for index, row in enumerate(rows):
        _seq, audit_id, timestamp, operator, action, target_id, details_json, prev_hash, digest = (
            row
        )
        expected_id = f"AUD-{index + 1:04d}"
        if audit_id != expected_id:
            return (
                False,
                index,
                f"id continuity: expected {expected_id}, found {audit_id}",
                len(rows),
            )
        if prev_hash != previous:
            return False, index, f"prevHash mismatch at {audit_id}", len(rows)
        try:
            details: str | dict[str, Any] = json.loads(details_json)
        except json.JSONDecodeError:
            return False, index, f"details JSON invalid at {audit_id}", len(rows)
        recomputed = canonical_hash(
            audit_id=audit_id,
            timestamp=timestamp,
            operator=operator,
            action=action,
            target_id=target_id,
            details=details,
            prev_hash=prev_hash,
        )
        if recomputed != digest:
            return False, index, f"hash mismatch at {audit_id}", len(rows)
        previous = digest

    return True, -1, f"verified {len(rows)} audit links", len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify the AirOps DSS hash chain.")
    parser.add_argument(
        "--db",
        default=str(Path(__file__).resolve().parents[1] / "airops.db"),
        help="SQLite path or sqlite:/// URL (default: backend/airops.db)",
    )
    args = parser.parse_args(argv)
    database = resolve_database(args.db)
    if not database.exists():
        print(
            json.dumps(
                {"valid": False, "message": f"database not found: {database}"}
            )
        )
        return 2
    try:
        valid, broken, message, count = verify(database)
    except (OSError, sqlite3.Error) as exc:
        print(json.dumps({"valid": False, "message": f"cannot read database: {exc}"}))
        return 2

    result = {
        "valid": valid,
        "entries": count,
        "brokenLinkIndex": None if broken < 0 else broken,
        "message": message,
    }
    print(json.dumps(result, indent=2))
    return 0 if valid else 1


if __name__ == "__main__":
    sys.exit(main())
