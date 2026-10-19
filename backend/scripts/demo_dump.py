"""Run both B6a demo scripts in-process and print their artefacts.

Usage:
    python scripts/demo_dump.py
    python scripts/demo_dump.py --demo sam-route-b

The output is ASCII-only (safe for Windows consoles) and mirrors what the
frontend receives in ``RECOMMENDATION_READY`` / ``GET /api/recommendations``.
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from app.config import get_settings
from app.main import create_app
from app.runtime import SimRuntime
from fastapi.testclient import TestClient


def _section(title: str) -> None:
    print()
    print("=" * 8, title, "=" * 8)


def _print_recommendation(recommendation: dict[str, Any], indent: str = "") -> None:
    print(
        f"{indent}{recommendation['id']} score={recommendation['score']} "
        f"status={recommendation['status']} confidence={recommendation['confidence']} "
        f"stateVersion={recommendation['stateVersion']}"
    )
    print(f"{indent}  summary: {recommendation['summary']}")
    print(f"{indent}  impacted: {', '.join(recommendation['impactedMissionIds'])}")
    print(f"{indent}  changes:")
    for change in recommendation["changes"]:
        print(
            f"{indent}    {change['kind']:<15} {change['missionId']}: "
            f"{change.get('before')} -> {change.get('after')} "
            f"({change.get('note')})"
        )
    print(f"{indent}  criteriaScores: {recommendation.get('criteriaScores')}")
    print(f"{indent}  tradeoffs:")
    for tradeoff in recommendation["tradeoffs"]:
        print(
            f"{indent}    {tradeoff['label']}: {tradeoff['delta']:+g} "
            f"{tradeoff['unit']} ({tradeoff['direction']})"
        )
    print(f"{indent}  constraintsSatisfied:")
    for item in recommendation["constraintsSatisfied"]:
        print(f"{indent}    - {item}")
    print(f"{indent}  constraintsRelaxed:")
    for item in recommendation["constraintsRelaxed"]:
        print(f"{indent}    - {item}")
    print(f"{indent}  explanation:")
    for item in recommendation["explanation"]:
        print(f"{indent}    - {item}")
    for alternative in recommendation.get("alternatives") or []:
        print(f"{indent}  alternative:")
        _print_recommendation(alternative, indent + "    ")


def _run_demo(client: TestClient, runtime: SimRuntime, name: str) -> None:
    _section(f"demo {name}")
    response = client.post(f"/api/demo-scripts/{name}/run?reset=true")
    response.raise_for_status()
    print(f"start response: {json.dumps(response.json(), ensure_ascii=True)}")
    if not runtime.demos.wait_idle(10.0):
        raise RuntimeError(f"demo {name} did not finish")
    if not runtime.retask.wait_idle(10.0):
        raise RuntimeError(f"retasking for demo {name} did not finish")

    print("events:")
    for event in runtime.store.active_events:
        print(f"  {event.id} {event.type.value} @ {event.timestamp}")

    recommendations = [
        item
        for item in client.get("/api/recommendations").json()
        if item["id"] in runtime.store.recommendations
    ]
    for recommendation in recommendations:
        print("recommendation:")
        _print_recommendation(recommendation, indent="  ")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--demo",
        choices=["sam-route-b", "runway-closure-aog", "all"],
        default="all",
        help="which scripted demo to run (default: all)",
    )
    args = parser.parse_args()

    settings = get_settings().model_copy(
        update={"retask_min_stage_ms": 0, "demo_step_delay_s": 0.0}
    )
    application = create_app(autostart_sim=False, settings=settings)
    with TestClient(application) as client:
        runtime = application.state.runtime
        assert isinstance(runtime, SimRuntime)
        names = (
            ["sam-route-b", "runway-closure-aog"]
            if args.demo == "all"
            else [args.demo]
        )
        for name in names:
            _run_demo(client, runtime, name)


if __name__ == "__main__":
    main()
