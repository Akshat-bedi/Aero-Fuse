"""Append-only, hash-chained audit store backed by SQLite (B8a).

The chain is the source of truth for ``GET /api/audit`` and
``GET /api/audit/verify``. Entries are never updated or deleted through the
application. ``append`` is the request-path entry point (serialised by one
``asyncio.Lock``); ``append_sync`` is used by synchronous store listeners and
the simulation tick, guarded by a re-entrant thread lock. Both funnel into the
same ``_append_locked`` implementation.

On first initialisation the database receives three baseline blocks that mirror
the frontend mock (genesis, baseline ATO approval, baseline threat contact).
Their hashes are computed with the real SHA-256 rule; unlike the mock they form
a genuine chain. Existing databases are never re-seeded, including after reset
or a restart.
"""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.audit.db import AuditBase, AuditRow
from app.audit.hashchain import ZERO_HASH, compute_hash
from app.domain import AuditEntry, AuditVerification

BASELINE_ENTRIES: tuple[dict[str, Any], ...] = (
    {
        "timestamp": "2026-10-17T06:00:00Z",
        "operator": "SYSTEM_DAEMON",
        "action": "SYSTEM_INITIALIZATION",
        "target_id": "CANONICAL_STORE",
        "details": "AirOps DSS state initialized with fictional Veridia territory seed dataset.",
    },
    {
        "timestamp": "2026-10-17T06:15:00Z",
        "operator": "COMMANDER_ALPHA",
        "action": "APPROVE_ATO_BASELINE",
        "target_id": "PLAN_ATO_20261017",
        "details": "Baseline Air Tasking Order sorties approved for operations day 1.",
    },
    {
        "timestamp": "2026-10-17T11:45:00Z",
        "operator": "INTEL_OFFICER_04",
        "action": "INJECT_THREAT_CONTACT",
        "target_id": "THR-02",
        "details": "SAM contact THR-02 confirmed active at 4.80N 7.50E.",
    },
)


def _details_json(details: str | dict[str, Any]) -> str:
    return json.dumps(
        details,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _details_value(raw: str, *, strict: bool = True) -> str | dict[str, Any]:
    try:
        value: Any = json.loads(raw)
    except json.JSONDecodeError:
        if strict:
            raise
        return raw
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value
    return str(value)


class AuditLog:
    """SQLite-backed audit chain with in-memory read cache."""

    def __init__(self, db_url: str) -> None:
        connect_args: dict[str, Any] = {}
        if db_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        self._engine: Engine = create_engine(db_url, connect_args=connect_args)
        self._sessions: sessionmaker[Session] = sessionmaker(bind=self._engine)
        self._async_lock = asyncio.Lock()
        self._thread_lock = threading.RLock()
        AuditBase.metadata.create_all(self._engine)
        self._cache: list[AuditEntry] = []
        with self._thread_lock:
            self._ensure_baseline()
            self._refresh_cache()

    # -------------------------------------------------------------- lifecycle

    def close(self) -> None:
        """Dispose the SQLAlchemy engine (called from runtime shutdown)."""
        self._engine.dispose()

    # ---------------------------------------------------------------- appends

    async def append(
        self,
        *,
        timestamp: str,
        operator: str,
        action: str,
        target_id: str,
        details: str | dict[str, Any],
        state_version: int | None = None,
    ) -> AuditEntry:
        """Append one entry from an async request path."""
        async with self._async_lock:
            with self._thread_lock:
                return self._append_locked(
                    timestamp=timestamp,
                    operator=operator,
                    action=action,
                    target_id=target_id,
                    details=details,
                    state_version=state_version,
                )

    def append_sync(
        self,
        *,
        timestamp: str,
        operator: str,
        action: str,
        target_id: str,
        details: str | dict[str, Any],
        state_version: int | None = None,
    ) -> AuditEntry:
        """Append one entry from a synchronous listener or tick."""
        with self._thread_lock:
            return self._append_locked(
                timestamp=timestamp,
                operator=operator,
                action=action,
                target_id=target_id,
                details=details,
                state_version=state_version,
            )

    def entries(self) -> list[AuditEntry]:
        """Chronological copy of the cached chain (oldest first)."""
        with self._thread_lock:
            return list(self._cache)

    def latest(self) -> AuditEntry | None:
        with self._thread_lock:
            return self._cache[-1] if self._cache else None

    # ------------------------------------------------------------- read/query

    def query(
        self,
        *,
        operator: str | None = None,
        action: str | None = None,
        from_timestamp: str | None = None,
        to_timestamp: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[AuditEntry], int]:
        """Return a filtered page and the total count before pagination."""
        conditions = []
        if operator is not None:
            conditions.append(AuditRow.operator == operator)
        if action is not None:
            conditions.append(AuditRow.action == action)
        if from_timestamp is not None:
            conditions.append(AuditRow.timestamp >= from_timestamp)
        if to_timestamp is not None:
            conditions.append(AuditRow.timestamp <= to_timestamp)

        with self._sessions() as session:
            total = session.scalar(
                select(func.count()).select_from(AuditRow).where(*conditions)
            )
            statement = select(AuditRow).where(*conditions).order_by(AuditRow.seq)
            if offset:
                statement = statement.offset(offset)
            if limit is not None:
                statement = statement.limit(limit)
            rows = list(session.scalars(statement))
        return [_row_to_entry(row) for row in rows], int(total or 0)

    def verify(self) -> AuditVerification:
        """Recompute the whole chain and report the first broken block."""
        with self._sessions() as session:
            rows = list(session.scalars(select(AuditRow).order_by(AuditRow.seq)))

        previous = ZERO_HASH
        for index, row in enumerate(rows):
            expected_id = f"AUD-{index + 1:04d}"
            if row.id != expected_id:
                return AuditVerification(
                    valid=False,
                    broken_link_index=index,
                    message=(
                        f"Broken id continuity at index {index}: "
                        f"expected {expected_id}, found {row.id}."
                    ),
                )
            try:
                details = _details_value(row.details_json)
            except json.JSONDecodeError:
                return AuditVerification(
                    valid=False,
                    broken_link_index=index,
                    message=f"Details JSON invalid at index {index} ({row.id}).",
                )
            if row.prev_hash != previous:
                return AuditVerification(
                    valid=False,
                    broken_link_index=index,
                    message=f"Broken hash link at index {index} ({row.id}).",
                )
            recomputed = compute_hash(
                audit_id=row.id,
                timestamp=row.timestamp,
                operator=row.operator,
                action=row.action,
                target_id=row.target_id,
                details=details,
                prev_hash=row.prev_hash,
            )
            if recomputed != row.hash:
                return AuditVerification(
                    valid=False,
                    broken_link_index=index,
                    message=f"Hash mismatch at index {index} ({row.id}).",
                )
            previous = row.hash

        return AuditVerification(
            valid=True,
            message=f"Audit chain verified ({len(rows)} links intact).",
        )

    # -------------------------------------------------------------- internals

    def _append_locked(
        self,
        *,
        timestamp: str,
        operator: str,
        action: str,
        target_id: str,
        details: str | dict[str, Any],
        state_version: int | None,
    ) -> AuditEntry:
        with self._sessions() as session:
            highest = session.scalar(select(func.max(AuditRow.seq)))
            seq = int(highest or 0) + 1
            audit_id = f"AUD-{seq:04d}"
            previous = self._cache[-1].hash if self._cache else ZERO_HASH
            entry = AuditEntry(
                id=audit_id,
                timestamp=timestamp,
                operator=operator,
                action=action,
                target_id=target_id,
                details=details,
                prev_hash=previous,
                hash=compute_hash(
                    audit_id=audit_id,
                    timestamp=timestamp,
                    operator=operator,
                    action=action,
                    target_id=target_id,
                    details=details,
                    prev_hash=previous,
                ),
                state_version=state_version,
            )
            session.add(
                AuditRow(
                    seq=seq,
                    id=entry.id,
                    timestamp=entry.timestamp,
                    operator=entry.operator,
                    action=entry.action,
                    target_id=entry.target_id,
                    details_json=_details_json(entry.details),
                    prev_hash=entry.prev_hash,
                    hash=entry.hash,
                )
            )
            session.commit()
        self._cache.append(entry)
        return entry

    def _ensure_baseline(self) -> None:
        with self._sessions() as session:
            existing = session.scalar(select(func.count()).select_from(AuditRow))
            if existing:
                return
            previous = ZERO_HASH
            for index, spec in enumerate(BASELINE_ENTRIES, start=1):
                audit_id = f"AUD-{index:04d}"
                entry = AuditEntry(
                    id=audit_id,
                    timestamp=str(spec["timestamp"]),
                    operator=str(spec["operator"]),
                    action=str(spec["action"]),
                    target_id=str(spec["target_id"]),
                    details=spec["details"],
                    prev_hash=previous,
                    hash=compute_hash(
                        audit_id=audit_id,
                        timestamp=str(spec["timestamp"]),
                        operator=str(spec["operator"]),
                        action=str(spec["action"]),
                        target_id=str(spec["target_id"]),
                        details=spec["details"],
                        prev_hash=previous,
                    ),
                )
                session.add(
                    AuditRow(
                        seq=index,
                        id=entry.id,
                        timestamp=entry.timestamp,
                        operator=entry.operator,
                        action=entry.action,
                        target_id=entry.target_id,
                        details_json=_details_json(entry.details),
                        prev_hash=entry.prev_hash,
                        hash=entry.hash,
                    )
                )
                previous = entry.hash
            session.commit()

    def _refresh_cache(self) -> None:
        with self._sessions() as session:
            rows = list(session.scalars(select(AuditRow).order_by(AuditRow.seq)))
        self._cache = [_row_to_entry(row) for row in rows]


def _row_to_entry(row: AuditRow) -> AuditEntry:
    return AuditEntry(
        id=row.id,
        timestamp=row.timestamp,
        operator=row.operator,
        action=row.action,
        target_id=row.target_id,
        details=_details_value(row.details_json, strict=False),
        prev_hash=row.prev_hash,
        hash=row.hash,
    )
