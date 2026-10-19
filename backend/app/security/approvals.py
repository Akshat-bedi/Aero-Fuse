"""Pure approval rules: separation of duties, high-impact classification and
the two-person approval state machine.

Nothing here mutates the live plan. A decision handler consumes the returned
:class:`ApprovalOutcome` and applies the plan only when ``apply_plan`` is true
(the second distinct commander's approval).

The recommendation ``status`` keeps its existing wire enum (``pending``,
``approved``, ``rejected``). ``approvalsRequired`` and ``approvals`` are exposed
as optional fields by :func:`approval_fields`; adding them to the shared
``Recommendation`` model is a contract-change candidate (see
``backend/docs/SECURITY_WIRING.md``).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import Field

from app.domain.base import IsoTimestamp, WireModel
from app.domain.decision import Recommendation
from app.domain.enums import ChangeKind
from app.security.policy import Identity, Role
from app.security.settings import SecuritySettings

_FATIGUE_MARKERS = ("fatigue", "duty", "crew rest")
_NO_PLAN_MARKERS = ("no feasible plan", "infeasible", "no feasible")


class ApprovalPhase(StrEnum):
    """Internal approval phase. Not a wire ``RecommendationStatus``."""

    PENDING = "pending"
    APPLIED = "applied"
    REJECTED = "rejected"


class DenialReason(StrEnum):
    """Internal reasons an approval attempt was rejected. Never shown verbatim."""

    NOT_COMMANDER = "not_commander"
    STEP_UP_REQUIRED = "step_up_required"
    SEPARATION_OF_DUTIES = "separation_of_duties"
    ALREADY_DECIDED = "already_decided"
    REASON_REQUIRED = "reason_required"
    NOTHING_TO_REVOKE = "nothing_to_revoke"


@dataclass(frozen=True)
class ApprovalRecord:
    """One commander approval, stored in order on the recommendation."""

    operator: str
    role: Role
    timestamp: str


@dataclass(frozen=True)
class ApprovalState:
    """Immutable approval state carried by a pending recommendation."""

    required: int = 1
    approvals: tuple[ApprovalRecord, ...] = ()
    phase: ApprovalPhase = ApprovalPhase.PENDING
    rejected_by: str | None = None
    rejection_reason: str | None = None


@dataclass(frozen=True)
class ApprovalOutcome:
    """Result of one approval attempt."""

    state: ApprovalState
    accepted: bool
    apply_plan: bool
    denial: DenialReason | None = None
    detail: str | None = None

    @property
    def next_recommendation_status(self) -> str:
        """The existing wire status the integration should set (if changed)."""
        if self.state.phase is ApprovalPhase.APPLIED:
            return "approved"
        if self.state.phase is ApprovalPhase.REJECTED:
            return "rejected"
        return "pending"


@dataclass(frozen=True)
class ImpactAssessment:
    """High-impact classification with human-readable reasons."""

    high_impact: bool
    reasons: tuple[str, ...]
    impacted_mission_count: int


class ApprovalRecordWire(WireModel):
    """Optional ``approvals`` entry exposed on the recommendation payload."""

    operator: str = Field(min_length=1)
    role: Role
    timestamp: IsoTimestamp


class ApprovalFields(WireModel):
    """Optional security fields for the recommendation payload.

    Merge these into ``Recommendation`` in B8. They are optional so the current
    frontend contract keeps validating.
    """

    approvals_required: int | None = Field(default=None, ge=1)
    approvals: list[ApprovalRecordWire] | None = None


def _same_operator(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return False
    return left.strip().casefold() == right.strip().casefold()


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware")
    return value.isoformat()


def step_up_valid(identity: Identity, now: datetime, window_sec: int) -> bool:
    """Return whether the identity re-entered its PIN within ``window_sec``."""
    if identity.step_up_at is None:
        return False
    if now.tzinfo is None or identity.step_up_at.tzinfo is None:
        raise ValueError("timestamps must be timezone-aware")
    elapsed = (now - identity.step_up_at).total_seconds()
    return 0 <= elapsed <= window_sec


def initial_state(required: int = 1) -> ApprovalState:
    """Create a fresh pending state with ``required`` distinct approvals."""
    return ApprovalState(required=max(1, required))


def required_approvals(
    *,
    high_impact: bool,
    approver_is_modifier: bool,
    settings: SecuritySettings,
) -> int:
    """Return how many distinct commanders must approve.

    High-impact recommendations need two when ``two_person_required`` is on.
    A commander who authored the modification can never be the sole approver,
    so a normal recommendation also needs a second approver in that case.
    """
    if high_impact and settings.two_person_required:
        return 2
    if approver_is_modifier:
        return 2
    return 1


def classify_high_impact(
    recommendation: Recommendation,
    mission_priorities: Mapping[str, int],
    *,
    settings: SecuritySettings,
    no_feasible_plan: bool = False,
) -> ImpactAssessment:
    """Classify a recommendation as high-impact.

    High impact when any of:

    - a change cancels or delays a P1 mission;
    - ``constraintsRelaxed`` mentions a fatigue/duty/rest margin;
    - at least ``settings.high_impact_mission_threshold`` missions are impacted;
    - the optimiser flagged no feasible plan (or the summary says so).
    """
    reasons: list[str] = []

    for change in recommendation.changes:
        if change.kind not in {ChangeKind.CANCEL, ChangeKind.DELAY}:
            continue
        if mission_priorities.get(change.mission_id) == 1:
            reasons.append(f"{change.kind.value} on P1 mission {change.mission_id}")

    for constraint in recommendation.constraints_relaxed:
        text = constraint.casefold()
        if any(marker in text for marker in _FATIGUE_MARKERS):
            reasons.append(f"relaxes fatigue/duty margin: {constraint}")

    impacted = len(set(recommendation.impacted_mission_ids))
    if impacted >= settings.high_impact_mission_threshold:
        reasons.append(
            f"impacts {impacted} missions (threshold {settings.high_impact_mission_threshold})"
        )

    summary = recommendation.summary.casefold()
    if no_feasible_plan or any(marker in summary for marker in _NO_PLAN_MARKERS):
        reasons.append("no feasible plan")

    return ImpactAssessment(
        high_impact=bool(reasons),
        reasons=tuple(reasons),
        impacted_mission_count=impacted,
    )


def evaluate_approval(
    state: ApprovalState,
    identity: Identity,
    now: datetime,
    *,
    high_impact: bool,
    trigger_operator: str | None,
    settings: SecuritySettings,
    modifier_operator: str | None = None,
    require_step_up: bool = True,
) -> ApprovalOutcome:
    """Record one commander's approval, or explain why it was denied.

    The plan is applied only when this call returns ``apply_plan=True``: the
    second distinct commander for a two-person case, or the first (only)
    commander for a normal case.
    """
    if state.phase is ApprovalPhase.APPLIED:
        return ApprovalOutcome(
            state, False, False, DenialReason.ALREADY_DECIDED, "plan already applied"
        )
    if state.phase is ApprovalPhase.REJECTED:
        return ApprovalOutcome(
            state, False, False, DenialReason.ALREADY_DECIDED, "recommendation rejected"
        )
    if identity.role is not Role.COMMANDER:
        return ApprovalOutcome(state, False, False, DenialReason.NOT_COMMANDER)
    if require_step_up and not step_up_valid(identity, now, settings.step_up_window_sec):
        return ApprovalOutcome(state, False, False, DenialReason.STEP_UP_REQUIRED)
    if _same_operator(identity.username, trigger_operator):
        return ApprovalOutcome(
            state,
            False,
            False,
            DenialReason.SEPARATION_OF_DUTIES,
            "the approver injected the triggering event",
        )

    approver_is_modifier = _same_operator(identity.username, modifier_operator)
    required = max(
        state.required,
        required_approvals(
            high_impact=high_impact,
            approver_is_modifier=approver_is_modifier,
            settings=settings,
        ),
    )

    if any(_same_operator(identity.username, item.operator) for item in state.approvals):
        return ApprovalOutcome(
            replace(state, required=required),
            True,
            False,
            detail="duplicate approval ignored",
        )

    record = ApprovalRecord(
        operator=identity.username,
        role=identity.role,
        timestamp=_iso(now),
    )
    approvals = (*state.approvals, record)
    applied = len(approvals) >= required
    phase = ApprovalPhase.APPLIED if applied else ApprovalPhase.PENDING
    return ApprovalOutcome(
        replace(state, required=required, approvals=approvals, phase=phase),
        True,
        applied,
    )


def evaluate_rejection(
    state: ApprovalState,
    identity: Identity,
    now: datetime,
    *,
    trigger_operator: str | None,
    settings: SecuritySettings,
    reason: str | None,
    require_step_up: bool = True,
) -> ApprovalOutcome:
    """Any commander may reject a pending recommendation; that ends it."""
    if state.phase is not ApprovalPhase.PENDING:
        return ApprovalOutcome(state, False, False, DenialReason.ALREADY_DECIDED)
    if identity.role is not Role.COMMANDER:
        return ApprovalOutcome(state, False, False, DenialReason.NOT_COMMANDER)
    if require_step_up and not step_up_valid(identity, now, settings.step_up_window_sec):
        return ApprovalOutcome(state, False, False, DenialReason.STEP_UP_REQUIRED)
    if _same_operator(identity.username, trigger_operator):
        return ApprovalOutcome(
            state,
            False,
            False,
            DenialReason.SEPARATION_OF_DUTIES,
            "the rejecting commander injected the triggering event",
        )
    if reason is None or not reason.strip():
        return ApprovalOutcome(state, False, False, DenialReason.REASON_REQUIRED)

    rejected = replace(
        state,
        phase=ApprovalPhase.REJECTED,
        rejected_by=identity.username,
        rejection_reason=reason.strip(),
    )
    return ApprovalOutcome(rejected, True, False)


def revoke_approval(
    state: ApprovalState,
    identity: Identity,
    *,
    settings: SecuritySettings,
) -> ApprovalOutcome:
    """Revert the acting commander's own approval, returning to pending."""
    if state.phase is not ApprovalPhase.PENDING:
        return ApprovalOutcome(state, False, False, DenialReason.ALREADY_DECIDED)
    if identity.role is not Role.COMMANDER:
        return ApprovalOutcome(state, False, False, DenialReason.NOT_COMMANDER)
    remaining = tuple(
        item for item in state.approvals if not _same_operator(item.operator, identity.username)
    )
    if len(remaining) == len(state.approvals):
        return ApprovalOutcome(state, False, False, DenialReason.NOTHING_TO_REVOKE)
    return ApprovalOutcome(
        replace(state, approvals=remaining, phase=ApprovalPhase.PENDING),
        True,
        False,
    )


def awaiting_second_approver(state: ApprovalState) -> bool:
    """True when the recommendation is pending but one approval is on file."""
    return state.phase is ApprovalPhase.PENDING and 0 < len(state.approvals) < state.required


def approval_fields(state: ApprovalState) -> ApprovalFields:
    """Expose the optional wire fields for the recommendation payload."""
    return ApprovalFields(
        approvals_required=state.required,
        approvals=[
            ApprovalRecordWire(operator=item.operator, role=item.role, timestamp=item.timestamp)
            for item in state.approvals
        ],
    )


def approval_fields_dict(state: ApprovalState) -> dict[str, Any]:
    """``approval_fields`` as a camelCase dictionary ready to merge."""
    return approval_fields(state).model_dump(by_alias=True, exclude_none=False, mode="json")
