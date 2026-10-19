"""Base-closure rule: relocate not-yet-launched sorties and divert recoveries."""

from __future__ import annotations

from app.domain import (
    Base,
    BaseClosedPayload,
    Change,
    ChangeKind,
    MissionStatus,
    OpsEvent,
)
from app.retask import geometry_lite
from app.retask.rules import common
from app.retask.rules.common import CandidatePlan
from app.state.store import StateStore


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, BaseClosedPayload):
        return CandidatePlan(profile=profile, failure="event is not a base closure")
    origin = state.bases.get(payload.base_id)
    if origin is None:
        return CandidatePlan(profile=profile, failure=f"unknown base {payload.base_id}")

    plan = CandidatePlan(profile=profile)
    candidates = common.open_bases(state, exclude=payload.base_id)
    for mission_id in impacted:
        mission = state.missions.get(mission_id)
        if mission is None:
            continue
        if not candidates:
            if common.is_p1_or_p2(mission):
                return CandidatePlan(
                    profile=profile,
                    failure=(
                        f"{mission.id} ({common.priority_label(mission.priority)}) needs an "
                        f"alternate to closed {payload.base_id}, but no other base is open."
                    ),
                )
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.CANCEL,
                    before=mission.status.value,
                    after="cancelled",
                    note=f"no open base can support {mission.id}",
                )
            )
            plan.relaxed.append(
                f"{mission.id} is cancelled: no open base can support its "
                f"{mission.required_aircraft_type.value} sortie."
            )
            continue

        chosen, notes = common.choose_base(
            state, mission, candidates, profile, origin=origin
        )
        plan.relaxed.extend(notes)
        if mission.status is MissionStatus.IN_PROGRESS:
            phase = "recovery diverted"
            note = f"Divert recovery from {payload.base_id} to {chosen.id}"
        else:
            phase = "sortie relocated"
            note = f"Relocate launch from {payload.base_id} to {chosen.id}"
        plan.changes.append(
            Change(
                mission_id=mission.id,
                kind=ChangeKind.REROUTE,
                before=payload.base_id,
                after=chosen.id,
                note=note,
            )
        )
        duration = (
            f"{payload.duration_hours:g} h"
            if payload.duration_hours is not None
            else "unspecified duration"
        )
        plan.explanations.append(
            f"{mission.id} {mission.name}: {phase} from {payload.base_id} "
            f"({payload.runway_status.value}, {duration}) to {chosen.id} "
            f"({chosen.runway_status.value}, {_distance_text(origin, chosen)})."
        )

    if not plan.changes and not plan.relaxed:
        plan.explanations.append(
            f"No active sortie launches or recovers at {payload.base_id}; "
            "no movement required."
        )
    return plan


def _distance_text(origin: Base, chosen: Base) -> str:
    return f"{geometry_lite.distance_km(origin.location, chosen.location):.0f} km transit"
