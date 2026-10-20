"""Commander decision handling, validation and the B8b approval flow.

Approve/modify applies the recommendation's ``Change`` list (plus any manual
swaps) to a deep copy, re-validates it against the *current* live state, then
commits the result exactly once through the store. Reject never touches the
plan. Every decision is written to the hash-chained audit log.

With ``AUTH_ENABLED=true`` decisions pass through the security package's
two-person approval state machine: high-impact recommendations need two
distinct commanders, every decision needs a fresh step-up, separation of duties
blocks the triggering operator, and modifications are staged until a second
commander approves them. Demo mode keeps the original one-step behaviour.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

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
from app.security.approvals import (
    ApprovalOutcome,
    ApprovalState,
    DenialReason,
    evaluate_approval,
    evaluate_rejection,
    initial_state,
    revoke_approval,
)
from app.security.audit_events import (
    SecurityAuditAction,
    approval_event,
    make_event,
)
from app.security.deps import (
    StepUpRequiredError,
    approval_denial_exception,
)
from app.security.policy import Identity as SecurityIdentity

if TYPE_CHECKING:
    from app.runtime import SimRuntime

DEFAULT_OPERATOR = "demo-commander"
STALE_PROBLEM_TYPE = "https://airops.dss/errors/stale-recommendation"
ALREADY_DECIDED_PROBLEM_TYPE = "https://airops.dss/errors/recommendation-already-decided"
PENDING_APPROVAL_PROBLEM_TYPE = "https://airops.dss/errors/approval-pending"
APPROVAL_DENIED_PROBLEM_TYPE = "https://airops.dss/errors/approval-denied"
RESET_PROBLEM_TYPE = "https://airops.dss/errors/decision-cancelled-by-reset"


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

    def __init__(self, runtime: SimRuntime) -> None:
        self.runtime = runtime
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    async def decide(
        self,
        recommendation_id: str,
        request: DecisionRequest,
        *,
        identity: SecurityIdentity | None = None,
        operator: str | None = None,
    ) -> Recommendation:
        lock = await self._lock_for(recommendation_id)
        async with lock:
            recommendation = self._require(recommendation_id)
            actor = operator or resolve_operator(request.operator)
            flow = self.runtime.approval_flow_enabled
            desired = _desired_status(request.decision)

            if recommendation.status is not RecommendationStatus.PENDING:
                if recommendation.status is desired:
                    return recommendation
                if not (
                    desired is RecommendationStatus.REJECTED
                    and not flow
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

            if flow:
                if identity is None or self.runtime.security is None:
                    raise DecisionError(
                        403,
                        APPROVAL_DENIED_PROBLEM_TYPE,
                        "Decision denied",
                        "Authenticated commander identity is required.",
                    )
                return await self._secure_decision(
                    recommendation,
                    request,
                    identity=identity,
                    actor=actor,
                    reason=reason,
                )

            epoch = self.runtime.decision_epoch
            if request.decision == "reject":
                return await self._reject(recommendation, actor, reason)

            modifications = request.modifications
            manual, manual_conflicts = _manual_changes(self.runtime.store.missions, modifications)
            if manual_conflicts:
                raise _modification_error(manual_conflicts)

            changes = [*recommendation.changes, *manual]
            violations = _plan_violations(self.runtime.store, changes)
            if violations:
                if request.decision == "approve":
                    await self._mark_stale(
                        recommendation,
                        "Approval re-validation failed: " + "; ".join(violations),
                    )
                    raise _stale_error(recommendation, self.runtime.store.version)
                raise _plan_violation_error(violations)

            if self.runtime.decision_epoch != epoch:
                raise _reset_error()

            planned = apply_changes(self.runtime.store, changes)
            modified = request.decision == "modify"
            return await self._commit_plan(
                recommendation,
                planned,
                actor=actor,
                modifications=modifications,
                modified=modified,
                keep_approval_fields=False,
            )

    async def _secure_decision(
        self,
        recommendation: Recommendation,
        request: DecisionRequest,
        *,
        identity: SecurityIdentity,
        actor: str,
        reason: str,
    ) -> Recommendation:
        security = self.runtime.security
        assert security is not None  # guarded by approval_flow_enabled
        state = self._approval_state(recommendation)
        trigger = self._trigger_operator(recommendation)

        if request.decision == "reject":
            outcome = evaluate_rejection(
                state,
                identity,
                now=security.clock(),
                trigger_operator=trigger,
                settings=security.settings,
                reason=reason,
                require_step_up=True,
            )
            self._raise_denial(outcome, recommendation, actor, "reject")
            self._save_approval_state(recommendation, outcome.state)
            return await self._reject(recommendation, actor, reason)

        modifications = request.modifications
        modifier = self.runtime.approval_modifiers.get(recommendation.id)
        if request.decision == "modify" and modifications is not None:
            modifier = actor
        elif recommendation.id in self.runtime.staged_modifications:
            modifications = self.runtime.staged_modifications[recommendation.id]

        manual, manual_conflicts = _manual_changes(self.runtime.store.missions, modifications)
        if manual_conflicts:
            raise _modification_error(manual_conflicts)
        staged_changes = [*recommendation.changes, *manual]
        violations = _plan_violations(self.runtime.store, staged_changes)
        if violations:
            raise _plan_violation_error(violations)

        previous_count = len(state.approvals)
        outcome = evaluate_approval(
            state,
            identity,
            now=security.clock(),
            high_impact=self.runtime.approval_high_impact.get(recommendation.id, False),
            trigger_operator=trigger,
            settings=security.settings,
            modifier_operator=modifier,
            require_step_up=True,
        )
        self._raise_denial(outcome, recommendation, actor, request.decision)

        if request.decision == "modify" and modifications is not None:
            self.runtime.staged_modifications[recommendation.id] = modifications
            self.runtime.approval_modifiers[recommendation.id] = actor

        self._save_approval_state(recommendation, outcome.state)
        if len(outcome.state.approvals) > previous_count:
            self._audit_approval(
                SecurityAuditAction.APPROVAL_RECORDED,
                recommendation,
                actor,
                identity.role.value,
                outcome.state,
            )
        if not outcome.apply_plan:
            self.runtime.broadcast_recommendation(recommendation, self.runtime.store.version)
            return recommendation

        planned = apply_changes(self.runtime.store, staged_changes)
        modified = request.decision == "modify" or modifications is not None
        return await self._commit_plan(
            recommendation,
            planned,
            actor=actor,
            modifications=modifications,
            modified=modified,
            keep_approval_fields=True,
        )

    async def revoke(
        self,
        recommendation_id: str,
        *,
        identity: SecurityIdentity,
        operator: str | None = None,
    ) -> Recommendation:
        """Retract the acting commander's own pending approval."""
        lock = await self._lock_for(recommendation_id)
        async with lock:
            recommendation = self._require(recommendation_id)
            if not self.runtime.approval_flow_enabled or self.runtime.security is None:
                raise DecisionError(
                    409,
                    PENDING_APPROVAL_PROBLEM_TYPE,
                    "No approval to revoke",
                    "The two-person approval flow is not active.",
                )
            if recommendation.status is not RecommendationStatus.PENDING:
                raise DecisionError(
                    409,
                    ALREADY_DECIDED_PROBLEM_TYPE,
                    "Recommendation already decided",
                    f"{recommendation.id} is {recommendation.status.value}.",
                )
            actor = operator or resolve_operator(None)
            state = self._approval_state(recommendation)
            outcome = revoke_approval(
                state,
                identity,
                settings=self.runtime.security.settings,
            )
            self._raise_denial(outcome, recommendation, actor, "revoke")
            self._save_approval_state(recommendation, outcome.state)
            self._audit_approval(
                SecurityAuditAction.APPROVAL_REVOKED,
                recommendation,
                actor,
                identity.role.value,
                outcome.state,
            )
            self.runtime.broadcast_recommendation(recommendation, self.runtime.store.version)
            return recommendation

    async def validate_modification(
        self, recommendation_id: str, modifications: ModificationsRequest
    ) -> ModificationValidationResult:
        """Recompute conflicts/score/trade-offs without applying anything."""
        recommendation = self._require(recommendation_id)
        manual, manual_conflicts = _manual_changes(self.runtime.store.missions, modifications)
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

    def _approval_state(self, recommendation: Recommendation) -> ApprovalState:
        state = self.runtime.approval_states.get(recommendation.id)
        if state is None:
            state = initial_state(recommendation.approvals_required or 1)
            self.runtime.approval_states[recommendation.id] = state
        return state

    def _trigger_operator(self, recommendation: Recommendation) -> str | None:
        event = self.runtime.event_by_id(recommendation.trigger_event_id)
        return event.operator if event is not None else None

    def _save_approval_state(self, recommendation: Recommendation, state: ApprovalState) -> None:
        self.runtime.approval_states[recommendation.id] = state
        self.runtime.sync_approval_fields(recommendation, state)

    def _audit_approval(
        self,
        action: SecurityAuditAction,
        recommendation: Recommendation,
        actor: str,
        role: str,
        state: ApprovalState,
    ) -> None:
        security = self.runtime.security
        if security is None:
            return
        security.audit.record(
            approval_event(
                action,
                operator=actor,
                recommendation_id=recommendation.id,
                role=role,
                approvals_count=len(state.approvals),
                approvals_required=state.required,
                phase=state.phase.value,
                timestamp=security.clock(),
            )
        )

    def _raise_denial(
        self,
        outcome: ApprovalOutcome,
        recommendation: Recommendation,
        actor: str,
        requested_action: str,
    ) -> None:
        if outcome.accepted:
            return
        security = self.runtime.security
        denial = outcome.denial or DenialReason.NOT_COMMANDER
        if security is not None:
            if denial is DenialReason.STEP_UP_REQUIRED:
                security.audit.record(
                    make_event(
                        SecurityAuditAction.STEP_UP_FAILURE,
                        operator=actor,
                        target_id=recommendation.id,
                        timestamp=security.clock(),
                        details={"action": requested_action},
                    )
                )
            else:
                security.audit.record(
                    make_event(
                        SecurityAuditAction.ACCESS_DENIED,
                        operator=actor,
                        target_id=recommendation.id,
                        timestamp=security.clock(),
                        details={
                            "action": requested_action,
                            "denial": denial.value,
                            "role": "commander",
                        },
                    )
                )
        if denial is DenialReason.STEP_UP_REQUIRED:
            raise StepUpRequiredError()
        error = approval_denial_exception(outcome)
        assert error is not None
        problem_type = (
            APPROVAL_DENIED_PROBLEM_TYPE
            if error.status_code == 403
            else ALREADY_DECIDED_PROBLEM_TYPE
            if error.status_code == 409
            else "https://airops.dss/errors/reason-required"
        )
        raise DecisionError(
            error.status_code,
            problem_type,
            "Decision not permitted",
            str(error.detail),
            extensions={"gateCode": denial.value},
        )

    async def _commit_plan(
        self,
        recommendation: Recommendation,
        planned: Any,
        *,
        actor: str,
        modifications: ModificationsRequest | None,
        modified: bool,
        keep_approval_fields: bool,
    ) -> Recommendation:
        if modified:
            recommendation.status = RecommendationStatus.MODIFIED
            recommendation.modifications = (
                modifications.model_dump(by_alias=True, exclude_none=True)
                if modifications is not None
                else {}
            )
        else:
            recommendation.status = RecommendationStatus.APPROVED
            recommendation.modifications = None
        old_version = self.runtime.store.version
        change = self.runtime.store.apply_planned(planned)
        version = change.version if change is not None else self.runtime.store.version
        self.runtime.staleness.forget(recommendation.id)
        self.runtime.forget_approval(recommendation, clear_fields=not keep_approval_fields)
        self.runtime.broadcast_recommendation(recommendation, version)

        if recommendation.status is RecommendationStatus.APPROVED:
            details = (
                f"Approved {recommendation.id}: {recommendation.summary} "
                f"(score {recommendation.score:.0f}; state v{old_version} -> v{version})."
            )
            action = "DECISION_APPROVED"
        else:
            swaps = _describe_manual(modifications)
            details = f"Modified {recommendation.id}: {recommendation.summary}" + (
                f" Manual changes: {swaps}." if swaps else "."
            )
            action = "DECISION_MODIFIED"
        await self.runtime.append_audit(
            operator=actor,
            action=action,
            target_id=recommendation.id,
            details=details,
            state_version=version,
        )
        return recommendation

    async def _reject(
        self, recommendation: Recommendation, actor: str, reason: str
    ) -> Recommendation:
        recommendation.status = RecommendationStatus.REJECTED
        version = self.runtime.store.version
        self.runtime.staleness.forget(recommendation.id)
        self.runtime.forget_approval(recommendation, clear_fields=False)
        self.runtime.broadcast_recommendation(recommendation, version)
        await self.runtime.append_audit(
            operator=actor,
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
        self.runtime.forget_approval(recommendation)
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


def _modification_error(conflicts: list[str]) -> DecisionError:
    return DecisionError(
        422,
        "https://airops.dss/errors/modification-invalid",
        "Modification invalid",
        "The manual assignment cannot be applied.",
        violations=[{"code": "MODIFICATION_INVALID", "message": item} for item in conflicts],
    )


def _plan_violation_error(violations: list[str]) -> DecisionError:
    return DecisionError(
        422,
        "https://airops.dss/errors/modification-invalid",
        "Modification invalid",
        "The modified plan violates hard constraints.",
        violations=[{"code": "PLAN_VIOLATION", "message": item} for item in violations],
    )


def _reset_error() -> DecisionError:
    return DecisionError(
        409,
        RESET_PROBLEM_TYPE,
        "Decision cancelled by reset",
        "The simulation was reset while this decision was being processed.",
    )


def _plan_violations(store: Any, changes: list[Change]) -> list[str]:
    try:
        return check_plan_lite(store, changes)
    except PlanApplicationError as exc:
        return [str(exc)]


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
                    note=(f"Commander manual airframe swap to {aircraft_swap.new_aircraft_id}"),
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
                    note=(f"Commander manual airframe assignment {aircraft_swap.new_aircraft_id}"),
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
                    note=(f"Commander manual crew assignment {crew_swap.new_crew_id}"),
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
        parts.append(f"{aircraft_swap.mission_id} aircraft -> {aircraft_swap.new_aircraft_id}")
    if modifications.crew_swap is not None:
        crew_swap = modifications.crew_swap
        parts.append(f"{crew_swap.mission_id} crew -> {crew_swap.new_crew_id}")
    for assignment in modifications.assignments or []:
        parts.append(f"{assignment.mission_id} assignment updated")
    return "; ".join(parts)


__all__ = [
    "DecisionError",
    "DecisionService",
    "resolve_operator",
]
