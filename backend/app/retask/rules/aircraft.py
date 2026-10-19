"""Aircraft-unserviceable rule: hot-swap the affected sortie onto a ground spare."""

from __future__ import annotations

from app.domain import (
    Aircraft,
    AircraftStatus,
    AircraftUnserviceablePayload,
    Change,
    ChangeKind,
    Mission,
    OpsEvent,
    RunwayStatus,
)
from app.retask import eligibility
from app.retask.rules.common import CandidatePlan, is_p1_or_p2
from app.state.store import StateStore


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, AircraftUnserviceablePayload):
        return CandidatePlan(profile=profile, failure="event is not an aircraft unserviceability")

    plan = CandidatePlan(profile=profile)
    for mission_id in impacted:
        mission = state.missions.get(mission_id)
        if mission is None or payload.aircraft_id not in mission.assigned.aircraft_ids:
            continue
        candidates = [
            airframe
            for airframe in eligibility.eligible_aircraft(state, mission)
            if airframe.id != payload.aircraft_id
            and airframe.status is AircraftStatus.SERVICEABLE
        ]
        if not candidates:
            if is_p1_or_p2(mission):
                return CandidatePlan(
                    profile=profile,
                    failure=(
                        f"{mission.id} ({_priority_label(mission)}) has no serviceable "
                        f"{mission.required_aircraft_type.value} spare after "
                        f"{payload.aircraft_id} went unserviceable."
                    ),
                )
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.CANCEL,
                    before=mission.status.value,
                    after="cancelled",
                    note=f"no compatible spare for {payload.aircraft_id}",
                )
            )
            plan.relaxed.append(
                f"{mission.id} ({_priority_label(mission)}) is cancelled: no serviceable "
                f"{mission.required_aircraft_type.value} spare is available."
            )
            continue

        chosen = _choose(candidates, mission, profile)
        plan.changes.append(
            Change(
                mission_id=mission.id,
                kind=ChangeKind.AIRCRAFT_SWAP,
                before=payload.aircraft_id,
                after=chosen.id,
                note=(
                    f"{chosen.tail_number} is a serviceable "
                    f"{chosen.type.value} at {chosen.base_id}"
                ),
            )
        )
        plan.explanations.append(
            f"{mission.id} {mission.name} loses {payload.aircraft_id} "
            f"({payload.reason}); {chosen.id} {chosen.tail_number} "
            f"({chosen.type.value}, {chosen.fuel_pct:.0f}% fuel, {chosen.base_id}) "
            "takes the sortie."
        )
        if chosen.base_id != mission.launch_base_id:
            plan.relaxed.append(
                f"{chosen.id} is based at {chosen.base_id}, not "
                f"{mission.launch_base_id}; a ferry leg is assumed."
            )
        base = state.bases.get(chosen.base_id)
        if base is not None and base.runway_status is not RunwayStatus.OPEN:
            plan.relaxed.append(
                f"{chosen.id} is parked at {chosen.base_id}, whose runway is "
                f"{base.runway_status.value}; the swap assumes it can be recovered "
                "or ferried before launch."
            )

    if not plan.changes and not plan.relaxed:
        plan.explanations.append(
            f"{payload.aircraft_id} is not assigned to an active sortie; no swap required."
        )
    return plan


def _choose(candidates: list[Aircraft], mission: Mission, profile: str) -> Aircraft:
    same_base_first = sorted(
        candidates,
        key=lambda airframe: (
            0 if airframe.base_id == mission.launch_base_id else 1,
            airframe.id,
        ),
    )
    if profile == "min_risk":
        return min(
            same_base_first,
            key=lambda airframe: (
                airframe.flight_hours_to_next_service,
                -airframe.fuel_pct,
                airframe.id,
            ),
        )
    if profile == "max_coverage":
        return min(
            same_base_first,
            key=lambda airframe: (-airframe.fuel_pct, airframe.id),
        )
    return min(same_base_first, key=lambda airframe: (-airframe.fuel_pct, airframe.id))


def _priority_label(mission: Mission) -> str:
    return f"P{int(mission.priority)}"
