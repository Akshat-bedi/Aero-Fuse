"""Crew-unavailable rule: re-pair the sortie with a rested qualified crew."""

from __future__ import annotations

from app.domain import (
    Change,
    ChangeKind,
    Crew,
    CrewStatus,
    CrewUnavailablePayload,
    Mission,
    OpsEvent,
)
from app.retask import eligibility
from app.retask.rules.common import CandidatePlan, is_p1_or_p2
from app.state.store import StateStore


def build(
    state: StateStore, event: OpsEvent, impacted: list[str], profile: str
) -> CandidatePlan:
    payload = event.payload
    if not isinstance(payload, CrewUnavailablePayload):
        return CandidatePlan(profile=profile, failure="event is not a crew unavailability")

    plan = CandidatePlan(profile=profile)
    for mission_id in impacted:
        mission = state.missions.get(mission_id)
        if mission is None or payload.crew_id not in mission.assigned.crew_ids:
            continue
        candidates = [
            member
            for member in eligibility.eligible_crew(state, mission)
            if member.id != payload.crew_id and member.status is CrewStatus.AVAILABLE
        ]
        if not candidates:
            if is_p1_or_p2(mission):
                return CandidatePlan(
                    profile=profile,
                    failure=(
                        f"{mission.id} (P{int(mission.priority)}) has no rested, qualified "
                        f"replacement for {payload.crew_id}."
                    ),
                )
            plan.changes.append(
                Change(
                    mission_id=mission.id,
                    kind=ChangeKind.CANCEL,
                    before=mission.status.value,
                    after="cancelled",
                    note=f"no qualified replacement for {payload.crew_id}",
                )
            )
            plan.relaxed.append(
                f"{mission.id} (P{int(mission.priority)}) is cancelled: no rested, "
                "qualified crew is available."
            )
            continue

        chosen = _choose(candidates, mission, profile)
        plan.changes.append(
            Change(
                mission_id=mission.id,
                kind=ChangeKind.CREW_SWAP,
                before=payload.crew_id,
                after=chosen.id,
                note=(
                    f"{chosen.callsign} is rested (fatigue {chosen.fatigue_index:.0f}) "
                    f"and qualified at {chosen.base_id}"
                ),
            )
        )
        plan.explanations.append(
            f"{mission.id} {mission.name} loses {payload.crew_id} ({payload.reason}); "
            f"{chosen.id} {chosen.callsign} (fatigue {chosen.fatigue_index:.0f}, "
            f"duty {chosen.duty_hours_last24h:.1f} h) takes the crew station."
        )
        if chosen.base_id != mission.launch_base_id:
            plan.relaxed.append(
                f"{chosen.id} is based at {chosen.base_id}, not {mission.launch_base_id}; "
                "crew transport is assumed."
            )

    if not plan.changes and not plan.relaxed:
        plan.explanations.append(
            f"{payload.crew_id} is not assigned to an active sortie; no re-pairing required."
        )
    return plan


def _choose(candidates: list[Crew], mission: Mission, profile: str) -> Crew:
    same_base_first = sorted(
        candidates,
        key=lambda member: (
            0 if member.base_id == mission.launch_base_id else 1,
            member.fatigue_index,
            member.id,
        ),
    )
    if profile == "min_risk":
        return min(
            same_base_first,
            key=lambda member: (member.fatigue_index, member.id),
        )
    if profile == "max_coverage":
        return min(
            same_base_first,
            key=lambda member: (member.duty_hours_last24h, member.id),
        )
    return min(same_base_first, key=lambda member: (member.id,))
