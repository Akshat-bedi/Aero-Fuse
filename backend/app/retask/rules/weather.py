"""Weather-degradation rule: relocate, hold or accept sorties at the affected base."""

from __future__ import annotations

from datetime import timedelta

from app.domain import (
    Change,
    ChangeKind,
    MissionStatus,
    OpsEvent,
    Severity,
    WeatherDegradedPayload,
    parse_timestamp,
    to_iso_z,
)
from app.retask import geometry_lite
from app.retask.rules import common
from app.retask.rules.common import CandidatePlan
from app.state.store import StateStore

CAUTION_HOLD_MIN = 15.0


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, WeatherDegradedPayload):
        return CandidatePlan(profile=profile, failure="event is not a weather degradation")

    plan = CandidatePlan(profile=profile)
    if payload.severity is Severity.NOMINAL:
        plan.explanations.append(
            "Weather report is nominal; the current plan remains feasible."
        )
        return plan

    base = state.bases.get(payload.base_id) if payload.base_id is not None else None
    candidates = (
        common.open_bases(state, exclude=base.id if base else None)
        if payload.severity is Severity.SEVERE and base is not None
        else []
    )

    for mission_id in impacted:
        mission = state.missions.get(mission_id)
        if mission is None:
            continue
        if base is not None and mission.status is MissionStatus.IN_PROGRESS:
            recovers_at_base = bool(mission.route) and (
                geometry_lite.distance_km(mission.route[-1], base.location) <= 1.0
            )
            if recovers_at_base and candidates:
                chosen, notes = common.choose_base(
                    state, mission, candidates, profile, origin=base
                )
                plan.relaxed.extend(notes)
                plan.changes.append(
                    Change(
                        mission_id=mission.id,
                        kind=ChangeKind.REROUTE,
                        before=base.id,
                        after=chosen.id,
                        note=f"Divert recovery from {base.id} to {chosen.id}",
                    )
                )
                plan.explanations.append(
                    f"{mission.id} {mission.name} recovers at {base.id} during "
                    f"{payload.severity.value} weather; recovery diverted to {chosen.id}."
                )
            else:
                plan.relaxed.append(
                    f"{mission.id} continues under {payload.severity.value} weather at "
                    f"{base.id}; no recovery diversion was required."
                )
            continue

        if base is not None and payload.severity is Severity.SEVERE and candidates:
            chosen, notes = common.choose_base(
                state, mission, candidates, profile, origin=base
            )
            plan.relaxed.extend(notes)
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.REROUTE,
                    before=base.id if base else payload.base_id,
                    after=chosen.id,
                    note=f"Relocate launch from {base.id} to {chosen.id}",
                )
            )
            plan.explanations.append(
                f"{mission.id} {mission.name} is relocated from {base.id} to "
                f"{chosen.id} to avoid severe weather."
            )
        else:
            delay_min = CAUTION_HOLD_MIN if payload.severity is Severity.CAUTION else 30.0
            before = mission.window_start
            after = to_iso_z(parse_timestamp(before) + timedelta(minutes=delay_min))
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.DELAY,
                    before=before,
                    after=after,
                    note=f"Hold {delay_min:g} min for weather at {mission.launch_base_id}",
                )
            )
            plan.explanations.append(
                f"{mission.id} {mission.name} is held {delay_min:g} min for "
                f"{payload.severity.value} weather at {mission.launch_base_id}."
            )

    if not plan.changes and not plan.relaxed:
        plan.explanations.append(
            "No active sortie operates from the affected base; no changes required."
        )
    return plan
