"""Commander decision handling, validation and the B8b approval seam (B8a).

Approve/modify applies the recommendation's ``Change`` list (plus any manual
swaps) to a deep copy, re-validates it against the *current* live state, then
commits the result exactly once through the store. Reject never touches the
plan. Every decision is written to the hash-chained audit log.

The approval gate is a narrow protocol so B8b can mount RBAC/JWT without this
module importing ``app.security``. With authentication disabled the default
gate allows every resolved operator.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal, Protocol

from app.domain import (
    Change,
    ChangeKind,
    DecisionRequest,
    ImpactAnalysis,
    Mission,
    ModificationsRequest,
    ModificationValidationResult,
    Recommendation,
    RecommendationStatus,
)
from app.retask.apply import PlanApplicationError, apply_changes
from app.retask.engine import _metrics, _tradeoffs
from app.retask.validate import check_plan_lite

if TYPE_CHECKING:
    from app.runtime import SimRuntime

DEFAULT_OPERATOR = "demo-commander"
STALE_PROBLEM_TYPE = "https://airops.dss/errors/stale-recommendation"
ALREADY_DECIDED_PROBLEM_TYPE = "https://airops.dss/errors/recommendation-already-decided"
PENDING_APPROVAL_PROBLEM_TYPE = "https://airops.dss/errors/approval-pending"
RESET_PROBLEM_TYPE = "https://airops.dss/errors/decision-cancelled-by-reset"


@dataclass(frozen=True)
class Identity:
    """Resolved caller identity passed to the approval gate."""

    operator: str


@dataclass(frozen=True)
class GateResult:
    """Outcome of the B8b approval gate."""

    outcome: Literal["allow", "deny", "pending"]
    code: str = ""
    message: str = ""

    @classmethod
    def allow(cls) -> GateResult:
        return cls("allow")

    @classmethod
    def deny(cls, code: str, message: str) -> GateResult:
        return cls("deny", code=code, message=message)

    @classmethod
    def pending(cls, code: str, message: str) -> GateResult:
        return cls("pending", code=code, message=message)


class ApprovalGate(Protocol):
    """B8b seam: authorise or stage a commander decision."""

    def authorise(
        self, identity: Identity, recommendation: Recommendation, decision: str
    ) -> GateResult: ...


class AllowAllGate:
    """Default gate used while ``AUTH_ENABLED`` is false."""

    def authorise(
        self, identity: Identity, recommendation: Recommendation, decision: str
    ) -> GateResult:
        del identity, recommendation, decision
        return GateResult.allow()


def resolve_operator(body_operator: str | None) -> str:
    """Use the request operator when present, else the demo commander."""
    if body_operator is None:
        return DEFAULT_OPERATOR
    stripped = body_operator.strip()
    return stripped or DEFAULT_OPERATOR


class DecisionError(Exception):
    """A decision/validation failure carrying an RFC 7807 problem body."""

    def __init__(
        self,
        status_code: int,
        problem_type: str,
        title: str,
        detail: str,
        *,
        violations: list[dict[str, str]] | None = None,
        extensions: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.problem_type = problem_type
        self.title = title
        self.detail = detail
        self.violations = violations or []
        self.extensions = extensions or {}


class DecisionService:
    """Approve/reject/modify and validate-modification implementation."""

    def __init__(self, runtime: SimRuntime, gate: ApprovalGate | None = None) -> None:
        self.runtime = runtime
        self.gate: ApprovalGate = gate or AllowAllGate()
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    async def decide(self, recommendation_id: str, request: DecisionRequest) -> Recommendation:
        lock = await self._lock_for(recommendation_id)
        async with lock:
            recommendation = self._require(recommendation_id)
            desired = _desired_status(request.decision)
            if recommendation.status is not RecommendationStatus.PENDING:
                if recommendation.status is desired:
                    return recommendation
                if not (
                    desired is RecommendationStatus.REJECTED
                    and recommendation.status
                    in {RecommendationStatus.STALE, RecommendationStatus.EXPIRED}
                ):
                    if recommendation.status in {
                        RecommendationStatus.STALE,
                        RecommendationStatus.EXPIRED,
                    }:
                        raise _stale_error(recommendation, self.runtime.store.version)
                    raise DecisionError(
                        409,
                        ALREADY_DECIDED_PROBLEM_TYPE,
                        "Recommendation already decided",
                        (
                            f"{recommendation.id} is {recommendation.status.value}; "
                            f"it cannot be {request.decision}."
                        ),
                        extensions={"currentStatus": recommendation.status.value},
                    )

            reason = (request.reason or "").strip()
            if request.decision == "reject" and not reason:
                raise DecisionError(
                    422,
                    "https://airops.dss/errors/reason-required",
                    "Rejection reason required",
                    "A commander rejection must include a non-empty reason.",
                    violations=[
                        {
                            "code": "REASON_REQUIRED",
                            "message": "reason is required when decision is 'reject'",
                        }
                    ],
                )

            identity = Identity(operator=resolve_operator(request.operator))
            gate_result = self.gate.authorise(identity, recommendation, request.decision)
            if gate_result.outcome != "allow":
                action = (
                    "DECISION_DENIED"
                    if gate_result.outcome == "deny"
                    else "DECISION_PENDING"
                )
                await self.runtime.append_audit(
                    operator=identity.operator,
                    action=action,
                    target_id=recommendation.id,
                    details=gate_result.message or f"{request.decision} not authorised.",
                    state_version=self.runtime.store.version,
                )
                if gate_result.outcome == "deny":
                    raise DecisionError(
                        403,
                        "https://airops.dss/errors/approval-denied",
                        "Decision denied",
                        gate_result.message or "The approval gate denied this decision.",
                        extensions={"gateCode": gate_result.code},
                    )
                raise DecisionError(
                    409,
                    PENDING_APPROVAL_PROBLEM_TYPE,
                    "Second approval required",
                    gate_result.message or "A second approver must confirm this decision.",
                    extensions={"gateCode": gate_result.code},
                )

            epoch = self.runtime.decision_epoch
            if request.decision == "reject":
                return await self._reject(recommendation, request)

            manual, manual_conflicts = _manual_changes(
                self.runtime.store.missions, request.modifications
            )
            if manual_conflicts:
                raise DecisionError(
                    422,
                    "https://airops.dss/errors/modification-invalid",
                    "Modification invalid",
                    "The manual assignment cannot be applied.",
                    violations=[
                        {"code": "MODIFICATION_INVALID", "message": item}
                        for item in manual_conflicts
                    ],
                )

            changes = [*recommendation.changes, *manual]
            try:
                violations = check_plan_lite(self.runtime.store, changes)
            except PlanApplicationError as exc:
                violations = [str(exc)]
            if violations:
                if request.decision == "approve":
                    await self._mark_stale(
                        recommendation,
                        "Approval re-validation failed: " + "; ".join(violations),
                    )
                    raise _stale_error(recommendation, self.runtime.store.version)
                raise DecisionError(
                    422,
                    "https://airops.dss/errors/modification-invalid",
                    "Modification invalid",
                    "The modified plan violates hard constraints.",
                    violations=[
                        {"code": "PLAN_VIOLATION", "message": item}
                        for item in violations
                    ],
                )

            if self.runtime.decision_epoch != epoch:
                raise DecisionError(
                    409,
                    RESET_PROBLEM_TYPE,
                    "Decision cancelled by reset",
                    "The simulation was reset while this decision was being processed.",
                )

            planned = apply_changes(self.runtime.store, changes)
            if request.decision == "approve":
                recommendation.status = RecommendationStatus.APPROVED
                recommendation.modifications = None
            else:
                recommendation.status = RecommendationStatus.MODIFIED
                recommendation.modifications = (
                    request.modifications.model_dump(
                        by_alias=True, exclude_none=True
                    )
                    if request.modifications is not None
                    else {}
                )
            old_version = self.runtime.store.version
            change = self.runtime.store.apply_planned(planned)
            version = change.version if change is not None else self.runtime.store.version
            self.runtime.staleness.forget(recommendation.id)
            self.runtime.broadcast_recommendation(recommendation, version)

            if recommendation.status is RecommendationStatus.APPROVED:
                details = (
                    f"Approved {recommendation.id}: {recommendation.summary} "
                    f"(score {recommendation.score:.0f}; state v{old_version} -> v{version})."
                )
                action = "DECISION_APPROVED"
            else:
                swaps = _describe_manual(request.modifications)
                details = (
                    f"Modified {recommendation.id}: {recommendation.summary}"
                    + (f" Manual changes: {swaps}." if swaps else ".")
                )
                action = "DECISION_MODIFIED"
            await self.runtime.append_audit(
                operator=identity.operator,
                action=action,
                target_id=recommendation.id,
                details=details,
                state_version=version,
            )
            return recommendation

    async def validate_modification(
        self, recommendation_id: str, modifications: ModificationsRequest
    ) -> ModificationValidationResult:
        """Recompute conflicts/score/trade-offs without applying anything."""
        recommendation = self._require(recommendation_id)
        manual, manual_conflicts = _manual_changes(
            self.runtime.store.missions, modifications
        )
        changes = [*recommendation.changes, *manual]
        try:
            conflicts = check_plan_lite(self.runtime.store, changes)
        except PlanApplicationError as exc:
            conflicts = [str(exc)]
        conflicts = [*manual_conflicts, *conflicts]
        try:
            planned = apply_changes(self.runtime.store, changes)
        except PlanApplicationError:
            return ModificationValidationResult(
                conflicts=conflicts,
                score=recommendation.score,
                tradeoffs=list(recommendation.tradeoffs),
                valid=False,
            )

        event = self.runtime.event_by_id(recommendation.trigger_event_id)
        impact = ImpactAnalysis(
            event_id=recommendation.trigger_event_id,
            event_type=event.type if event is not None else None,
            impacted_mission_ids=list(recommendation.impacted_mission_ids),
            time_to_decision_min=5.0,
        )
        metrics = _metrics(self.runtime.store, planned, impact, event)
        return ModificationValidationResult(
            conflicts=conflicts,
            score=metrics.score,
            tradeoffs=_tradeoffs(self.runtime.store, planned, changes),
            valid=not conflicts,
        )

    # -------------------------------------------------------------- internals

    async def _reject(
        self, recommendation: Recommendation, request: DecisionRequest
    ) -> Recommendation:
        identity = Identity(operator=resolve_operator(request.operator))
        recommendation.status = RecommendationStatus.REJECTED
        version = self.runtime.store.version
        self.runtime.staleness.forget(recommendation.id)
        self.runtime.broadcast_recommendation(recommendation, version)
        reason = (request.reason or "").strip()
        await self.runtime.append_audit(
            operator=identity.operator,
            action="DECISION_REJECTED",
            target_id=recommendation.id,
            details=f"Rejected {recommendation.id}: {reason}",
            state_version=version,
        )
        return recommendation

    async def _mark_stale(self, recommendation: Recommendation, reason: str) -> None:
        if recommendation.status is not RecommendationStatus.PENDING:
            return
        recommendation.status = RecommendationStatus.STALE
        version = self.runtime.store.version
        self.runtime.staleness.forget(recommendation.id)
        self.runtime.broadcast_recommendation(recommendation, version)
        await self.runtime.append_audit(
            operator="SYSTEM",
            action="RECOMMENDATION_STALE",
            target_id=recommendation.id,
            details=reason,
            state_version=version,
        )

    def _require(self, recommendation_id: str) -> Recommendation:
        recommendation = self.runtime.store.recommendations.get(recommendation_id)
        if recommendation is None:
            raise DecisionError(
                404,
                "about:blank",
                "Recommendation not found",
                f"unknown recommendation: {recommendation_id}",
            )
        return recommendation

    async def _lock_for(self, recommendation_id: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._locks.get(recommendation_id)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[recommendation_id] = lock
            return lock


def _desired_status(decision: str) -> RecommendationStatus:
    if decision == "approve":
        return RecommendationStatus.APPROVED
    if decision == "reject":
        return RecommendationStatus.REJECTED
    return RecommendationStatus.MODIFIED


def _stale_error(recommendation: Recommendation, current_version: int) -> DecisionError:
    return DecisionError(
        409,
        STALE_PROBLEM_TYPE,
        "Recommendation is stale",
        (
            f"{recommendation.id} was computed at state v{recommendation.state_version}; "
            f"the current state is v{current_version}. Re-evaluate before deciding."
        ),
        extensions={
            "recommendationStateVersion": recommendation.state_version,
            "currentStateVersion": current_version,
        },
    )


def _manual_changes(
    missions: dict[str, Mission], modifications: ModificationsRequest | None
) -> tuple[list[Change], list[str]]:
    """Translate the Modify UI's swap objects into ordered ``Change`` entries."""
    if modifications is None:
        return [], []
    changes: list[Change] = []
    conflicts: list[str] = []

    if modifications.aircraft_swap is not None:
        aircraft_swap = modifications.aircraft_swap
        mission = missions.get(aircraft_swap.mission_id)
        if mission is None:
            conflicts.append(f"{aircraft_swap.mission_id}: unknown mission.")
        elif mission.assigned.aircraft_ids:
            changes.append(
                Change(
                    mission_id=aircraft_swap.mission_id,
                    kind=ChangeKind.AIRCRAFT_SWAP,
                    before=mission.assigned.aircraft_ids[0],
                    after=aircraft_swap.new_aircraft_id,
                    note=(
                        "Commander manual airframe swap to "
                        f"{aircraft_swap.new_aircraft_id}"
                    ),
                )
            )
        elif mission.required_aircraft_type is not None:
            changes.append(
                Change(
                    mission_id=aircraft_swap.mission_id,
                    kind=ChangeKind.NEW_ASSIGNMENT,
                    before=None,
                    after={
                        "aircraftIds": [aircraft_swap.new_aircraft_id],
                        "crewIds": list(mission.assigned.crew_ids),
                    },
                    note=(
                        "Commander manual airframe assignment "
                        f"{aircraft_swap.new_aircraft_id}"
                    ),
                )
            )

    if modifications.crew_swap is not None:
        crew_swap = modifications.crew_swap
        mission = missions.get(crew_swap.mission_id)
        if mission is None:
            conflicts.append(f"{crew_swap.mission_id}: unknown mission.")
        elif mission.assigned.crew_ids:
            changes.append(
                Change(
                    mission_id=crew_swap.mission_id,
                    kind=ChangeKind.CREW_SWAP,
                    before=mission.assigned.crew_ids[0],
                    after=crew_swap.new_crew_id,
                    note=f"Commander manual crew swap to {crew_swap.new_crew_id}",
                )
            )
        else:
            changes.append(
                Change(
                    mission_id=crew_swap.mission_id,
                    kind=ChangeKind.NEW_ASSIGNMENT,
                    before=None,
                    after={
                        "aircraftIds": list(mission.assigned.aircraft_ids),
                        "crewIds": [crew_swap.new_crew_id],
                    },
                    note=(
                        "Commander manual crew assignment "
                        f"{crew_swap.new_crew_id}"
                    ),
                )
            )

    for assignment in modifications.assignments or []:
        mission = missions.get(assignment.mission_id)
        if mission is None:
            conflicts.append(f"{assignment.mission_id}: unknown mission.")
            continue
        changes.append(
            Change(
                mission_id=assignment.mission_id,
                kind=ChangeKind.NEW_ASSIGNMENT,
                before={
                    "aircraftIds": list(mission.assigned.aircraft_ids),
                    "crewIds": list(mission.assigned.crew_ids),
                },
                after={
                    "aircraftIds": (
                        list(assignment.aircraft_ids)
                        if assignment.aircraft_ids is not None
                        else list(mission.assigned.aircraft_ids)
                    ),
                    "crewIds": (
                        list(assignment.crew_ids)
                        if assignment.crew_ids is not None
                        else list(mission.assigned.crew_ids)
                    ),
                },
                note="Commander assignment update",
            )
        )

    return changes, conflicts


def _describe_manual(modifications: ModificationsRequest | None) -> str:
    if modifications is None:
        return ""
    parts: list[str] = []
    if modifications.aircraft_swap is not None:
        aircraft_swap = modifications.aircraft_swap
        parts.append(
            f"{aircraft_swap.mission_id} aircraft -> {aircraft_swap.new_aircraft_id}"
        )
    if modifications.crew_swap is not None:
        crew_swap = modifications.crew_swap
        parts.append(f"{crew_swap.mission_id} crew -> {crew_swap.new_crew_id}")
    for assignment in modifications.assignments or []:
        parts.append(f"{assignment.mission_id} assignment updated")
    return "; ".join(parts)


__all__ = [
    "AllowAllGate",
    "ApprovalGate",
    "DecisionError",
    "DecisionService",
    "GateResult",
    "Identity",
    "resolve_operator",
]
