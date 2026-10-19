"""Pydantic base models and shared annotated types for the wire domain.

All wire-facing models use camelCase JSON aliases while staying snake_case in
Python (API_CONTRACT.md section 2.1). Timestamps stay strings so dumps
round-trip the wire payloads byte-for-byte (seed parity); the simulation clock
is the single time source and domain code never calls ``datetime.now()``.
"""

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict
from pydantic.alias_generators import to_camel


def parse_iso_timestamp(value: Any) -> str:
    """Validate an ISO 8601 timestamp string, preserving the original value."""
    if isinstance(value, datetime):
        return value.isoformat()
    if not isinstance(value, str) or not value.strip():
        raise ValueError("timestamp must be a non-empty ISO 8601 string")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"invalid ISO 8601 timestamp: {value!r}") from exc
    return value


IsoTimestamp = Annotated[str, BeforeValidator(parse_iso_timestamp)]


class WireModel(BaseModel):
    """Base for wire-facing models: camelCase JSON, snake_case Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


def dump_wire(model: BaseModel, *, exclude_none: bool = True) -> dict[str, Any]:
    """Dump a model in wire format (camelCase aliases, JSON-compatible values)."""
    return model.model_dump(by_alias=True, exclude_none=exclude_none, mode="json")
