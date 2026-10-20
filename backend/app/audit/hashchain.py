"""Canonical hash-chain calculation for the audit log (B8a).

The rule is intentionally small and stable so an independent verifier can
reproduce it without importing the application:

``canonical = json.dumps({id, timestamp, operator, action, targetId, details,
prevHash}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)``

``hash = sha256((prevHash + canonical).encode("utf-8")).hexdigest()``

The genesis entry uses 64 zeroes as ``prevHash``. ``stateVersion`` is not part
of the hash because it is a read-side convenience, not part of the event.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

ZERO_HASH = "0" * 64


def canonical_payload(
    *,
    audit_id: str,
    timestamp: str,
    operator: str,
    action: str,
    target_id: str,
    details: str | dict[str, Any],
    prev_hash: str,
) -> str:
    """Return the canonical JSON string hashed for one audit entry."""
    payload: dict[str, Any] = {
        "id": audit_id,
        "timestamp": timestamp,
        "operator": operator,
        "action": action,
        "targetId": target_id,
        "details": details,
        "prevHash": prev_hash,
    }
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def compute_hash(
    *,
    audit_id: str,
    timestamp: str,
    operator: str,
    action: str,
    target_id: str,
    details: str | dict[str, Any],
    prev_hash: str,
) -> str:
    """Compute the SHA-256 entry hash from the previous hash and entry fields."""
    canonical = canonical_payload(
        audit_id=audit_id,
        timestamp=timestamp,
        operator=operator,
        action=action,
        target_id=target_id,
        details=details,
        prev_hash=prev_hash,
    )
    return hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()
