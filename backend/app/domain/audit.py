"""Hash-chained audit log models (API_CONTRACT.md section 6.12)."""

from typing import Any

from pydantic import AliasChoices, Field

from app.domain.base import IsoTimestamp, WireModel


class AuditEntry(WireModel):
    id: str = Field(pattern=r"^AUD-")
    timestamp: IsoTimestamp
    operator: str = Field(min_length=1)
    action: str = Field(min_length=1)
    target_id: str = Field(min_length=1)
    details: str | dict[str, Any]
    prev_hash: str = Field(
        validation_alias=AliasChoices("prevHash", "previousHash"),
        serialization_alias="prevHash",
    )
    hash: str = Field(min_length=1)
    state_version: int | None = Field(default=None, ge=0)
