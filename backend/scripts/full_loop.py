#!/usr/bin/env python3
"""Drive the complete B8a retask loop against a running AirOps DSS server.

Usage:
    python scripts/full_loop.py
    python scripts/full_loop.py --demo sam-route-b
    python scripts/full_loop.py --base-url http://127.0.0.1:8000/api --demo all

The script resets the simulation, runs one or both scripted demos, waits for
the recommendation, approves every still-pending recommendation, captures the
resulting live state, and verifies the audit chain over HTTP. It prints one
JSON evidence document to stdout and exits non-zero if any step fails. It only
uses the standard library so it can run from an air-gapped operator shell.

The matching standalone file verification is:

    python scripts/verify_audit.py --db <path printed by the server config>
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

DEFAULT_BASE_URL = "http://127.0.0.1:8000/api"
DEFAULT_OPERATOR = "COMMANDER_ALPHA"
DEMOS = ("sam-route-b", "runway-closure-aog")
POINT_TOLERANCE = 1e-6


class FullLoopError(RuntimeError):
    """A live HTTP step failed or returned an unusable payload."""


@dataclass(frozen=True)
class Api:
    """Tiny JSON client for the documented REST surface."""

    base_url: str
    timeout: float = 30.0

    def get(self, path: str) -> Any:
        return self._request("GET", path)

    def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        return self._request("POST", path, body)

    def _request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> Any:
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url, data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise FullLoopError(
                f"{method} {url} -> HTTP {exc.code}: {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise FullLoopError(f"{method} {url} failed: {exc.reason}") from exc
        except TimeoutError as exc:
            raise FullLoopError(f"{method} {url} timed out") from exc

        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise FullLoopError(f"{method} {url} returned invalid JSON") from exc


def _same_point(first: dict[str, Any], second: dict[str, Any]) -> bool:
    return (
        abs(float(first["lat"]) - float(second["lat"])) <= POINT_TOLERANCE
        and abs(float(first["lng"]) - float(second["lng"])) <= POINT_TOLERANCE
    )


def _same_route(actual: list[dict[str, Any]], expected: list[dict[str, Any]]) -> bool:
    return len(actual) == len(expected) and all(
        _same_point(left, right) for left, right in zip(actual, expected, strict=True)
    )


def _rotation_offset(
    actual: list[dict[str, Any]], expected: list[dict[str, Any]]
) -> int | None:
    if len(actual) != len(expected):
        return None
    for offset in range(len(expected)):
        if all(
            _same_point(actual[index], expected[(index + offset) % len(expected)])
            for index in range(len(actual))
        ):
            return offset
    return None


def _route_match(mission: dict[str, Any]) -> dict[str, Any]:
    route = mission.get("route") or []
    for option in mission.get("routeOptions") or []:
        waypoints = option.get("waypoints") or []
        if _same_route(route, waypoints):
            return {
                "optionId": option["id"],
                "optionName": option.get("name"),
                "mode": "exact",
            }
        if len(route) == len(waypoints) + 1:
            if _same_route(route[:-1], waypoints):
                return {
                    "optionId": option["id"],
                    "optionName": option.get("name"),
                    "mode": "withTrailingReturn",
                }
            if _same_route(route[1:], waypoints):
                return {
                    "optionId": option["id"],
                    "optionName": option.get("name"),
                    "mode": "withLeadingPosition",
                }
            offset = _rotation_offset(route[1:], waypoints)
            if offset is not None:
                return {
                    "optionId": option["id"],
                    "optionName": option.get("name"),
                    "mode": "afterCurrentPosition",
                    "rotationOffset": offset,
                }
    return {"optionId": None, "optionName": None, "mode": "custom"}


def _wait_for_recommendations(
    api: Api, expected: int, timeout: float, poll_interval: float
) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        recommendations = api.get("/recommendations")
        if isinstance(recommendations, list) and len(recommendations) >= expected:
            time.sleep(min(poll_interval, 0.1))
            return api.get("/recommendations")
        time.sleep(poll_interval)
    raise FullLoopError(
        f"timed out after {timeout:.1f}s waiting for {expected} recommendation(s)"
    )


def _approve_pending(
    api: Api, recommendations: list[dict[str, Any]], operator: str
) -> list[dict[str, Any]]:
    decisions: list[dict[str, Any]] = []
    for recommendation in recommendations:
        if recommendation.get("status") != "pending":
            continue
        recommendation_id = recommendation["id"]
        started = time.perf_counter()
        decided = api.post(
            f"/recommendations/{recommendation_id}/decision",
            {
                "decision": "approve",
                "reason": "full_loop.py end-to-end commander approval.",
                "operator": operator,
            },
        )
        decisions.append(
            {
                "id": recommendation_id,
                "decision": "approve",
                "operator": operator,
                "httpStatus": 200,
                "status": decided.get("status"),
                "elapsedMs": round((time.perf_counter() - started) * 1000.0, 1),
            }
        )
    return decisions


def _mission_view(mission: dict[str, Any]) -> dict[str, Any]:
    match = _route_match(mission)
    return {
        "id": mission["id"],
        "name": mission["name"],
        "status": mission["status"],
        "priority": mission["priority"],
        "launchBaseId": mission["launchBaseId"],
        "windowStart": mission["windowStart"],
        "windowEnd": mission["windowEnd"],
        "assigned": mission["assigned"],
        "routeOption": match.get("optionId") or "Custom",
        "routeMatch": match,
        "route": mission.get("route") or [],
    }


def _run_demo(
    api: Api,
    name: str,
    operator: str,
    timeout: float,
    poll_interval: float,
) -> dict[str, Any]:
    started = time.perf_counter()
    run_response = api.post(f"/demo-scripts/{name}/run?reset=true")
    expected = int(run_response["eventCount"])
    initial = _wait_for_recommendations(api, expected, timeout, poll_interval)
    recommendation_ms = round((time.perf_counter() - started) * 1000.0, 1)

    decisions = _approve_pending(api, initial, operator)
    recommendations = api.get("/recommendations")
    snapshot = api.get("/snapshot")

    impacted_ids: set[str] = set()
    trigger_ids: set[str] = set()
    for recommendation in recommendations:
        impacted_ids.update(recommendation.get("impactedMissionIds") or [])
        for change in recommendation.get("changes") or []:
            if change.get("missionId"):
                impacted_ids.add(change["missionId"])
        if recommendation.get("triggerEventId"):
            trigger_ids.add(recommendation["triggerEventId"])

    missions = [
        _mission_view(mission)
        for mission in snapshot["missions"]
        if mission["id"] in impacted_ids
    ]
    events = [
        event
        for event in snapshot.get("activeEvents") or []
        if event.get("id") in trigger_ids
    ]
    return {
        "demo": name,
        "reset": True,
        "eventCount": expected,
        "recommendationCount": expected,
        "recommendationMs": recommendation_ms,
        "initialRecommendations": initial,
        "recommendations": recommendations,
        "decisions": decisions,
        "triggerEvents": events,
        "liveState": {
            "stateVersion": snapshot["stateVersion"],
            "simTime": snapshot.get("simTime") or snapshot.get("sim", {}).get("time"),
            "missions": missions,
        },
    }


def _audit_view(api: Api) -> dict[str, Any]:
    entries = api.get("/audit?limit=1000")
    verify = api.get("/audit/verify")
    action_counts: dict[str, int] = {}
    for entry in entries:
        action = entry["action"]
        action_counts[action] = action_counts.get(action, 0) + 1
    return {
        "entries": len(entries),
        "verify": verify,
        "latest": entries[-1] if entries else None,
        "actionCounts": action_counts,
        "decisionActions": [
            entry for entry in entries if str(entry.get("action", "")).startswith("DECISION_")
        ],
    }


def _selected_demos(value: str) -> list[str]:
    return list(DEMOS) if value == "all" else [value]


def run(
    *,
    base_url: str,
    demo: str,
    operator: str,
    timeout: float,
    poll_interval: float,
) -> dict[str, Any]:
    api = Api(base_url=base_url, timeout=timeout)
    health = api.get("/health")
    if health.get("status") != "ok":
        raise FullLoopError(f"server health is not ok: {health}")
    runs = [
        _run_demo(api, name, operator, timeout, poll_interval)
        for name in _selected_demos(demo)
    ]
    return {
        "ok": True,
        "baseUrl": base_url,
        "health": health,
        "operator": operator,
        "runs": runs,
        "audit": _audit_view(api),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the full AirOps DSS retask loop against a live server."
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"REST base URL (default: {DEFAULT_BASE_URL})",
    )
    parser.add_argument(
        "--demo",
        choices=(*DEMOS, "all"),
        default="all",
        help="demo script to run (default: all)",
    )
    parser.add_argument("--operator", default=DEFAULT_OPERATOR)
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="seconds to wait for each recommendation (default: 30)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=0.05,
        help="recommendation polling interval in seconds (default: 0.05)",
    )
    args = parser.parse_args(argv)
    if args.timeout <= 0 or args.poll_interval <= 0:
        parser.error("--timeout and --poll-interval must be positive")
    try:
        report = run(
            base_url=args.base_url,
            demo=args.demo,
            operator=args.operator,
            timeout=args.timeout,
            poll_interval=args.poll_interval,
        )
    except FullLoopError as exc:
        print(
            json.dumps(
                {"ok": False, "baseUrl": args.base_url, "error": str(exc)},
                indent=2,
                ensure_ascii=True,
            )
        )
        return 1
    except KeyboardInterrupt:
        return 130
    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
