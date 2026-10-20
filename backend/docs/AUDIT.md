# Hash-chained audit log (B8a)

Status: **live**. The audit log is append-only and persisted in SQLite via
SQLAlchemy 2 (`DB_URL`, default `sqlite:///./airops.db`). The application never
updates or deletes entries. `GET /api/audit/verify` and
`scripts/verify_audit.py` independently recompute the chain.

## 1. Wire entry

```json
{
  "id": "AUD-0004",
  "timestamp": "2026-10-17T12:00:05.000Z",
  "operator": "COMMANDER_ALPHA",
  "action": "DECISION_APPROVED",
  "targetId": "REC-0001",
  "details": "Approved REC-0001: M-04 rerouted via Route C. (score 90; state v2 -> v3).",
  "prevHash": "d0b1...64 hex chars",
  "hash": "1c9f...64 hex chars"
}
```

`timestamp` is always the simulation clock, never wall time. `details` is a
string or JSON object. The wire field `targetId` is stored as `target_id` in the
database; both map to the same canonical key below.

## 2. Exact hash rule

For every entry:

```text
canonical = json.dumps(
    {
        "id": id,
        "timestamp": timestamp,
        "operator": operator,
        "action": action,
        "targetId": targetId,
        "details": details,
        "prevHash": prevHash,
    },
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
)
hash = sha256((prevHash + canonical).encode("utf-8")).hexdigest()
```

- `prevHash` is the previous entry's `hash`; genesis uses **64 zeros**
  (`"0000...0000"`).
- Keys are sorted, no whitespace, UTF-8. Keep `ensure_ascii=False`.
- `stateVersion` is request metadata and is **not** hashed. `details` is hashed
  as its parsed value, so object key order does not matter after parsing.
- IDs are contiguous: `AUD-0001`, `AUD-0002`, ... `AUD-nnnn`.

The same algorithm is implemented in `app/audit/hashchain.py` and,
independently and stdlib-only, in `scripts/verify_audit.py`.

## 3. Storage and lifecycle

Table `audit_entries`:

| Column | Meaning |
|---|---|
| `seq` | internal primary key / ordering (1-based; matches the id suffix) |
| `id` | wire id (`AUD-nnnn`) |
| `timestamp` | sim-clock ISO-8601 |
| `operator` | commander, operator, `SYSTEM`, or `SYSTEM_DAEMON` |
| `action` | runtime action string |
| `target_id` | recommendation, event, plan, or `SIM` |
| `details_json` | canonical JSON text of `details` |
| `prev_hash`, `hash` | 64-char lowercase SHA-256 hex |

- One `asyncio.Lock` serialises request-path appends; a re-entrant thread lock
  covers synchronous listeners and the simulation tick. Both use the same
  append implementation.
- The database is created and the three baseline entries inserted on first
  initialisation. **Existing databases are never re-seeded** — reset, restart
  and demo scripts retain the chain.
- `SNAPSHOT` carries the full audit array from the database (not the in-memory
  seed, which has an empty `auditLog`). This is the only intentional snapshot
  difference from `shared/seed/world.json`; the seed-parity test compares all
  other fields.
- The live server also emits `AUDIT_APPENDED` after each append. On startup the
  frontend fetches `/api/audit` once and then appends these frames.

### Baseline blocks

| Id | Action | Operator | Target | Details |
|---|---|---|---|---|
| `AUD-0001` | `SYSTEM_INITIALIZATION` | `SYSTEM_DAEMON` | `CANONICAL_STORE` | AirOps DSS state initialized with fictional Veridia territory seed dataset. |
| `AUD-0002` | `APPROVE_ATO_BASELINE` | `COMMANDER_ALPHA` | `PLAN_ATO_20261017` | Baseline Air Tasking Order sorties approved for operations day 1. |
| `AUD-0003` | `INJECT_THREAT_CONTACT` | `INTEL_OFFICER_04` | `THR-02` | SAM contact THR-02 confirmed active at 4.80N 7.50E. |

The frontend mock uses the same ids/actions/operators/targets and timestamps
`06:00`, `06:15`, `11:45` on 2026-10-17. Its `AUD-0003` details line contains a
literal replacement character before `N/E`; this backend uses plain ASCII.
Baseline hashes are real SHA-256 values, so the baseline chain verifies.

## 4. Actions

Runtime strings (the frontend's aggregate filters depend on the prefixes):

| Action | Target | Written when |
|---|---|---|
| `INJECT_EVENT` | event id | an event is accepted and its factual effect applied |
| `RECOMMENDATION_GENERATED` | recommendation id | the retasking pipeline stores a recommendation |
| `DECISION_APPROVED` | recommendation id | a commander approves and the plan is applied |
| `DECISION_REJECTED` | recommendation id | a commander rejects with a reason |
| `DECISION_MODIFIED` | recommendation id | a commander applies a modified plan |
| `DECISION_DENIED` | recommendation id | the B8b approval gate denies the decision |
| `DECISION_PENDING` | recommendation id | the gate requires a second approver |
| `RECOMMENDATION_STALE` | recommendation id | a dependency changes or approval re-validation fails |
| `RECOMMENDATION_EXPIRED` | recommendation id | the TTL elapses while pending |
| `SIM_CONTROL` | `SIM` | pause/resume/speed/reset |
| `SCENARIO_RUN` | scenario id | reserved for B7 |

`AuditLogPage` displays unknown actions under `ALL`, matches `DECISION_` for
`DECISIONS_ONLY` and `EVENT` for `EVENTS_ONLY`. Its exact-match dropdown still
uses stale past-tense values (`DECISION_APPROVE` etc.); the backend emits the
runtime strings above (known frontend defect).

## 5. REST API

### `GET /api/audit`

Filters and pagination:

| Query | Meaning |
|---|---|
| `operator` | exact operator |
| `action` | exact action |
| `from`, `to` | inclusive ISO timestamp bounds (`from`/`to` aliases) |
| `limit` | 1–1000, default 100 |
| `offset` | default 0 |
| `format` | `json` (default) or `csv` |

Returns a chronological JSON array and `X-Total-Count` (total before
pagination). `format=csv` returns `text/csv` with
`Content-Disposition: attachment; filename="audit.csv"` and the columns
`id,timestamp,operator,action,targetId,details,prevHash,hash`. Cells beginning
with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` to
neutralise spreadsheet formula injection.

### `GET /api/audit/verify`

```json
{
  "valid": true,
  "brokenLinkIndex": null,
  "message": "Audit chain verified (5 links intact)."
}
```

On failure, `valid` is `false`, `brokenLinkIndex` is the zero-based first bad
row, and `message` names the failed check (id continuity, prevHash, hash, or
invalid JSON). The endpoint never mutates the chain.

## 6. Decisions and staleness

- Approve/modify writes exactly one `DECISION_*` entry after applying the plan
  once. Reject writes one entry and leaves the plan unchanged.
- Repeating the same decision on an already-decided recommendation returns the
  current recommendation without re-applying or re-auditing. A conflicting
  decision returns `409`.
- Approval re-validates against current state. If a hard constraint now fails,
  the recommendation is marked `stale`, `RECOMMENDATION_STALE` is written, and
  the decision returns `409` with
  `https://airops.dss/errors/stale-recommendation` and both state versions.
- Pending recommendations are stale when a committed change touches their
  proposed plan: dependent mission/assignment/route/window, airframes, crews,
  launch-base runway, or a new threat intersecting the proposed route. Position,
  fuel and clock ticks never notify the store and never stale a recommendation.
- Pending recommendations expire after `RECO_TTL_MIN` sim minutes (default 90),
  writing `RECOMMENDATION_EXPIRED`.

## 7. Verification and offline use

```powershell
cd backend
python scripts/verify_audit.py                     # backend/airops.db
python scripts/verify_audit.py --db C:\path\to\airops.db
python scripts/verify_audit.py --db sqlite:///./airops.db
```

The script imports only the Python standard library. Exit codes: `0` valid,
`1` broken chain, `2` unreadable/missing database. It prints a JSON summary;
use it in air-gapped demos or after copying a database for inspection.
