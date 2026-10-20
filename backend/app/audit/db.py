"""SQLAlchemy 2 persistence model for the append-only audit log."""

from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class AuditBase(DeclarativeBase):
    """Declarative base scoped to the audit database."""


class AuditRow(AuditBase):
    """One immutable audit block.

    ``seq`` is an internal ordering key; ``id`` is the wire identifier and the
    two must stay in lockstep (``AUD-0001`` -> seq 1). ``details`` is stored as
    canonical JSON text so the hash can be recomputed byte-for-byte.
    """

    __tablename__ = "audit_entries"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    timestamp: Mapped[str] = mapped_column(String(40), index=True)
    operator: Mapped[str] = mapped_column(String(120), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_id: Mapped[str] = mapped_column(String(120), index=True)
    details_json: Mapped[str] = mapped_column(Text)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
