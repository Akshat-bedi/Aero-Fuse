"""Generate ``backend/docs/ACCESS_MATRIX.md`` from the policy table.

Usage:
    python -m app.security.matrix [--check]

The document is rendered **from** :data:`app.security.policy.ROLE_PERMISSIONS`,
never hand-edited. ``--check`` exits non-zero when the committed document is
stale (used by tests and CI).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.security.policy import (
    COMMANDER_ONLY_PERMISSIONS,
    EVENT_TYPE_GRANTS,
    OPERATIONAL_PERMISSIONS,
    Permission,
    Role,
    permissions_for,
)

_ROLE_PURPOSE: dict[Role, str] = {
    Role.OBSERVER: "Read-only watch officer.",
    Role.INTEL_OFFICER: "Read plus threat reporting (`THREAT_DETECTED` only).",
    Role.MAINTENANCE_OFFICER: "Read plus serviceability and runway reporting.",
    Role.OPS_PLANNER: "Plans and injects events, runs scenarios and demo scripts, sim speed.",
    Role.COMMANDER: "Full operational authority including approve/reject/modify.",
    Role.AUDITOR: "Reads, exports and verifies the audit chain. No operational access.",
    Role.SYS_ADMIN: "Manages users only. No operational access.",
}


def _mark(allowed: bool) -> str:
    return "Y" if allowed else "."


def _role_header() -> str:
    cells = " | ".join(role.value for role in Role)
    rules = " | ".join(":---:" for _ in Role)
    return f"| Permission | {cells} |\n| :--- | {rules} |"


def _event_header() -> str:
    cells = " | ".join(role.value for role in Role)
    rules = " | ".join(":---:" for _ in Role)
    return f"| Event type | {cells} |\n| :--- | {rules} |"


def _intro() -> list[str]:
    lines = [
        "# AirOps DSS - Access Control Matrix",
        "",
        "> GENERATED FILE. Do not edit by hand.",
        "> Regenerate with `python -m app.security.matrix` from `backend/`.",
        "> Source of truth: `backend/app/security/policy.py`.",
        "",
        "Fictional simulation only. This matrix documents an access-control design for",
        "the AirOps DSS demo; it is not a real military authorisation scheme.",
        "",
        "## Roles",
        "",
        "| Role | Purpose |",
        "| :--- | :--- |",
    ]
    lines.extend(f"| `{role.value}` | {_ROLE_PURPOSE[role]} |" for role in Role)
    lines.extend(["", "## Permission matrix", "", "`Y` = allowed, `.` = denied.", ""])
    return lines


def _outro() -> list[str]:
    lines = [
        "",
        "## Guarantees",
        "",
        "- Only `commander` can approve, reject or modify a recommendation.",
        "- `sys_admin` and `auditor` hold no operational permission (no event injection,",
        "  no scenario runs, no decisions, no sim control, no demo scripts).",
        "- `observer` is strictly read-only.",
        "- Event injection is additionally restricted per event type (below).",
        "",
        "## Event injection grants",
        "",
        "`Y` = role may raise this event type.",
        "",
    ]
    return lines


def render_matrix() -> str:
    """Render the full markdown document from the policy table."""
    lines = _intro()
    lines.append(_role_header())
    for permission in Permission:
        cells = [_mark(permission in permissions_for(role)) for role in Role]
        lines.append(f"| `{permission.value}` | {' | '.join(cells)} |")
    lines.extend(_outro())
    lines.append(_event_header())
    all_event_types = sorted(
        {event for grants in EVENT_TYPE_GRANTS.values() for event in grants},
        key=lambda event: event.value,
    )
    for event_type in all_event_types:
        cells = [
            _mark(event_type in EVENT_TYPE_GRANTS.get(role, frozenset())) for role in Role
        ]
        lines.append(f"| `{event_type.value}` | {' | '.join(cells)} |")
    lines.extend(
        [
            "",
            "## Policy invariants (machine-checked)",
            "",
            "- Commander-only permissions: "
            + ", ".join(sorted(permission.value for permission in COMMANDER_ONLY_PERMISSIONS))
            + ".",
            "- Operational permissions: "
            + ", ".join(sorted(permission.value for permission in OPERATIONAL_PERMISSIONS))
            + ".",
            "",
        ]
    )
    return "\n".join(lines)


def default_output_path() -> Path:
    """``backend/docs/ACCESS_MATRIX.md`` relative to this file."""
    return Path(__file__).resolve().parents[2] / "docs" / "ACCESS_MATRIX.md"


def write_matrix(path: Path | None = None) -> Path:
    """Write the rendered matrix and return the path written."""
    destination = path if path is not None else default_output_path()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(render_matrix(), encoding="utf-8", newline="\n")
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the access-control matrix.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if the committed matrix is stale.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Override output path.")
    args = parser.parse_args(argv)

    expected = render_matrix()
    if args.check:
        destination = args.output if args.output is not None else default_output_path()
        if not destination.is_file() or destination.read_text(encoding="utf-8") != expected:
            print(f"Access matrix is stale: {destination}", file=sys.stderr)
            return 1
        print(f"Access matrix is current: {destination}")
        return 0

    written = write_matrix(args.output)
    print(f"Wrote access matrix: {written}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
