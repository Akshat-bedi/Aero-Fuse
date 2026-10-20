# AirOps DSS - Access Control Matrix

> GENERATED FILE. Do not edit by hand.
> Regenerate with `python -m app.security.matrix` from `backend/`.
> Source of truth: `backend/app/security/policy.py`.

Fictional simulation only. This matrix documents an access-control design for
the AirOps DSS demo; it is not a real military authorisation scheme.

## Roles

| Role | Purpose |
| :--- | :--- |
| `observer` | Read-only watch officer. |
| `intel_officer` | Read plus threat reporting (`THREAT_DETECTED` only). |
| `maintenance_officer` | Read plus serviceability and runway reporting. |
| `ops_planner` | Plans and injects events, runs scenarios and demo scripts, sim speed. |
| `commander` | Full operational authority including approve/reject/modify. |
| `auditor` | Reads, exports and verifies the audit chain. No operational access. |
| `sys_admin` | Manages users only. No operational access. |

## Permission matrix

`Y` = allowed, `.` = denied.

| Permission | observer | intel_officer | maintenance_officer | ops_planner | commander | auditor | sys_admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `read_snapshot` | Y | Y | Y | Y | Y | Y | Y |
| `read_recommendations` | Y | Y | Y | Y | Y | Y | Y |
| `read_predictions` | Y | Y | Y | Y | Y | Y | Y |
| `read_alerts` | Y | Y | Y | Y | Y | Y | Y |
| `read_scenarios` | Y | Y | Y | Y | Y | Y | Y |
| `read_eligible_resources` | Y | Y | Y | Y | Y | Y | Y |
| `read_demo_scripts` | Y | Y | Y | Y | Y | Y | Y |
| `inject_event` | . | Y | Y | Y | Y | . | . |
| `run_scenario` | . | . | . | Y | Y | . | . |
| `validate_modification` | . | . | . | Y | Y | . | . |
| `decide_approve` | . | . | . | . | Y | . | . |
| `decide_reject` | . | . | . | . | Y | . | . |
| `decide_modify` | . | . | . | . | Y | . | . |
| `sim_pause` | . | . | . | Y | Y | . | . |
| `sim_resume` | . | . | . | Y | Y | . | . |
| `sim_speed` | . | . | . | Y | Y | . | . |
| `sim_reset` | . | . | . | . | Y | . | . |
| `read_audit` | . | . | . | . | . | Y | . |
| `export_audit` | . | . | . | . | . | Y | . |
| `verify_audit` | . | . | . | . | . | Y | . |
| `manage_users` | . | . | . | . | . | . | Y |
| `run_demo_script` | . | . | . | Y | Y | . | . |

## Guarantees

- Only `commander` can approve, reject or modify a recommendation.
- `sys_admin` and `auditor` hold no operational permission (no event injection,
  no scenario runs, no decisions, no sim control, no demo scripts).
- `observer` is strictly read-only.
- Event injection is additionally restricted per event type (below).

## Event injection grants

`Y` = role may raise this event type.

| Event type | observer | intel_officer | maintenance_officer | ops_planner | commander | auditor | sys_admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `AIRCRAFT_UNSERVICEABLE` | . | . | Y | Y | Y | . | . |
| `BASE_CLOSED` | . | . | . | Y | Y | . | . |
| `CREW_UNAVAILABLE` | . | . | . | Y | Y | . | . |
| `NEW_PRIORITY_MISSION` | . | . | . | Y | Y | . | . |
| `THREAT_DETECTED` | . | Y | . | Y | Y | . | . |
| `WEATHER_DEGRADED` | . | . | . | Y | Y | . | . |

## Policy invariants (machine-checked)

- Commander-only permissions: decide_approve, decide_modify, decide_reject.
- Operational permissions: decide_approve, decide_modify, decide_reject, inject_event, run_demo_script, run_scenario, sim_pause, sim_reset, sim_resume, sim_speed.
