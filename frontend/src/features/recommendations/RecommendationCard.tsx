import React, { useState, useEffect } from 'react';
import { Recommendation, Change, Tradeoff, Aircraft, Crew } from '@/types';
import { dataService } from '@/services';
import { useUiStore } from '@/store/uiStore';
import { formatTimeZulu } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { OptionsComparisonChart } from './OptionsComparisonChart';
import {
  Check,
  X,
  Layers,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  RefreshCw,
  FileQuestion,
  ShieldAlert,
  Plane,
  Users,
} from 'lucide-react';

interface RecommendationCardProps {
  recommendation: Recommendation;
  compact?: boolean;
  onDecisionComplete?: (rec: Recommendation) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  compact = false,
  onDecisionComplete,
}) => {
  const { mapPlanView, setMapPlanView, addToast } = useUiStore();

  // Active view tab: 'overview' | 'alternatives'
  const [activeTab, setActiveTab] = useState<'overview' | 'alternatives'>('overview');
  const [selectedOptionId, setSelectedOptionId] = useState<string>(recommendation.id);

  // Modals & HITL State
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('Tactical priorities superseded');
  const [rejectCustomText, setRejectCustomText] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Modification State
  const [targetMissionId, setTargetMissionId] = useState<string>(
    recommendation.changes[0]?.missionId || recommendation.impactedMissionIds[0] || 'M-04',
  );
  const [eligibleAircraft, setEligibleAircraft] = useState<Aircraft[]>([]);
  const [eligibleCrew, setEligibleCrew] = useState<Crew[]>([]);
  const [selectedAircraftSwap, setSelectedAircraftSwap] = useState<string>('');
  const [selectedCrewSwap, setSelectedCrewSwap] = useState<string>('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    conflicts: string[];
    score: number;
    tradeoffs: Tradeoff[];
  } | null>(null);

  // Load eligible resources when entering modify mode
  useEffect(() => {
    if (isModifying && targetMissionId) {
      dataService.getEligibleResources?.(targetMissionId).then((res) => {
        setEligibleAircraft(res.aircraft);
        setEligibleCrew(res.crew);
      }).catch(() => {});
    }
  }, [isModifying, targetMissionId]);

  // Live validation on modification changes
  useEffect(() => {
    if (isModifying && (selectedAircraftSwap || selectedCrewSwap)) {
      const mods: Record<string, unknown> = {};
      if (selectedAircraftSwap) {
        mods.aircraftSwap = { missionId: targetMissionId, newAircraftId: selectedAircraftSwap };
      }
      if (selectedCrewSwap) {
        mods.crewSwap = { missionId: targetMissionId, newCrewId: selectedCrewSwap };
      }

      dataService.validateModification?.(recommendation.id, mods).then((val) => {
        setValidationResult({
          valid: val.valid ?? (val.conflicts.length === 0),
          conflicts: val.conflicts,
          score: val.score,
          tradeoffs: val.tradeoffs,
        });
      }).catch(() => {});
    } else {
      setValidationResult(null);
    }
  }, [isModifying, targetMissionId, selectedAircraftSwap, selectedCrewSwap, recommendation.id]);

  // Handlers
  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const updated = await dataService.decideRecommendation(
        recommendation.id,
        'approved',
        undefined,
        'Commander confirmed and executed retask plan via DSS interface.',
        'COMMANDER_OPS',
      );
      setIsApproveOpen(false);
      addToast({
        type: 'nominal',
        title: 'Retasking Plan Approved',
        message: `Plan ${recommendation.id} committed to master ATO sortie schedule. Master tactical picture updated.`,
      });
      onDecisionComplete?.(updated);
    } catch {
      addToast({
        type: 'critical',
        title: 'Decision Dispatch Failed',
        message: 'Could not communicate approval decision to operational authority.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      const finalReason = rejectReason === 'Other' ? rejectCustomText || 'Commander override' : rejectReason;
      const updated = await dataService.decideRecommendation(
        recommendation.id,
        'rejected',
        undefined,
        finalReason,
        'COMMANDER_OPS',
      );
      setIsRejectOpen(false);
      addToast({
        type: 'warning',
        title: 'Retasking Plan Rejected',
        message: `Plan ${recommendation.id} rejected. Master plan retained without modification.`,
      });
      onDecisionComplete?.(updated);
    } catch {
      addToast({
        type: 'critical',
        title: 'Decision Dispatch Failed',
        message: 'Could not communicate rejection to operational authority.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveModified = async () => {
    setIsSubmitting(true);
    try {
      const mods: Record<string, unknown> = {};
      if (selectedAircraftSwap) {
        mods.aircraftSwap = { missionId: targetMissionId, newAircraftId: selectedAircraftSwap };
      }
      if (selectedCrewSwap) {
        mods.crewSwap = { missionId: targetMissionId, newCrewId: selectedCrewSwap };
      }

      const updated = await dataService.decideRecommendation(
        recommendation.id,
        'modified',
        mods,
        `Commander modified assignments on mission ${targetMissionId}: ${selectedAircraftSwap ? `Aircraft -> ${selectedAircraftSwap}` : ''} ${selectedCrewSwap ? `Crew -> ${selectedCrewSwap}` : ''}`,
        'COMMANDER_OPS',
      );
      setIsModifying(false);
      addToast({
        type: 'nominal',
        title: 'Modified Retask Plan Approved',
        message: `Custom modifications for ${recommendation.id} approved and merged into master schedule.`,
      });
      onDecisionComplete?.(updated);
    } catch {
      addToast({
        type: 'critical',
        title: 'Modification Failed',
        message: 'Failed to commit modified plan.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Derive score to display (either validated modified score or rec score)
  const displayScore = validationResult ? validationResult.score : recommendation.score;
  const isStale = recommendation.status === 'stale' || recommendation.status === 'expired';
  const isDecided = recommendation.status === 'approved' || recommendation.status === 'rejected' || recommendation.status === 'modified';

  // Alternatives from recommendation
  const alternatives = recommendation.alternatives || [];

  // Active option being inspected (if alternative selected)
  const activeOption =
    selectedOptionId === recommendation.id
      ? recommendation
      : alternatives.find((a) => a.id === selectedOptionId) || recommendation;

  return (
    <div className="bg-command-panel border border-command-border rounded-[2px] p-3 text-command-text font-mono relative space-y-3">
      {/* 1. Mandatory Military Compliance Banner */}
      <div className="flex items-center justify-between px-2.5 py-1 bg-command-warning-bg border border-command-warning-border rounded-[1px] text-[10px] font-bold text-command-warning tracking-wider">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>RECOMMENDATION ONLY - REQUIRES COMMANDER APPROVAL</span>
        </div>
        <span className="text-[9px] uppercase opacity-85">NATO STANAG / DSS HITL</span>
      </div>

      {/* Stale / Expired Warning Callout */}
      {isStale && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-command-critical-bg border border-command-critical-border rounded-[1px] text-xs text-command-critical font-bold">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>UNDERLYING OPERATIONAL BASELINE MODIFIED — RECOMMENDATION STALE — RE-EVALUATION REQUIRED</span>
        </div>
      )}

      {/* 2. Card Header: Summary, Ring Gauge Score, Trigger, Zulu Timestamp */}
      <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-command-border/70">
        <div className="space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-command-primary tracking-wide">
              {recommendation.id}
            </span>
            <span className="text-[10px] text-command-muted">/</span>
            <span className="text-[10px] uppercase tracking-wider text-command-muted">
              TRIGGER: <span className="text-command-heading font-bold">{recommendation.triggerEventId}</span>
            </span>
            <span className="text-[10px] text-command-muted">•</span>
            <span className="text-[10px] text-command-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatTimeZulu(recommendation.createdAt)}</span>
            </span>
            <span
              className={`px-1.5 py-0.2 rounded-[1px] text-[9px] uppercase font-bold border ${
                recommendation.status === 'approved'
                  ? 'bg-command-nominal-bg text-command-nominal border-command-nominal-border'
                  : recommendation.status === 'rejected'
                  ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                  : recommendation.status === 'modified'
                  ? 'bg-command-raised text-command-primary border-command-primary'
                  : isStale
                  ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                  : 'bg-command-bg text-command-primary border-command-border'
              }`}
            >
              {recommendation.status.toUpperCase()}
            </span>
          </div>

          <h3 className="text-xs sm:text-sm font-bold text-command-heading leading-snug">
            {activeOption.summary}
          </h3>

          <div className="flex flex-wrap items-center gap-3 text-[10px] text-command-muted pt-0.5">
            <span>
              Confidence: <strong className="text-command-nominal">{(recommendation.confidence * 100).toFixed(0)}%</strong>
            </span>
            <span>•</span>
            <span>
              Data Freshness: <strong className="text-command-text">{recommendation.dataFreshnessSec}s ago</strong>
            </span>
            <span>•</span>
            <span>
              State Version: <strong className="text-command-text">v{recommendation.stateVersion}</strong>
            </span>
          </div>
        </div>

        {/* 0-100 Radial Ring Gauge Score */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              {/* Background ring */}
              <path
                className="text-command-border"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              {/* Value stroke */}
              <path
                className={
                  displayScore >= 85
                    ? 'text-command-primary'
                    : displayScore >= 70
                    ? 'text-command-warning'
                    : 'text-command-critical'
                }
                strokeDasharray={`${displayScore}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold text-command-heading leading-none">
                {Math.round(displayScore)}
              </span>
              <span className="text-[7px] text-command-muted uppercase tracking-tighter">
                % OPT
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs: Overview vs Alternatives Comparison */}
      {!compact && alternatives.length > 0 && (
        <div className="flex items-center gap-1 border-b border-command-border/60 pb-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              setSelectedOptionId(recommendation.id);
            }}
            className={`px-2 py-1 rounded-[1px] text-[11px] font-mono transition-none border ${
              activeTab === 'overview'
                ? 'bg-command-raised border-command-primary text-command-primary font-bold'
                : 'bg-command-bg border-command-border text-command-muted hover:text-command-text'
            }`}
          >
            Recommended Plan ({Math.round(recommendation.score)}%)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alternatives')}
            className={`px-2 py-1 rounded-[1px] text-[11px] font-mono transition-none border flex items-center gap-1 ${
              activeTab === 'alternatives'
                ? 'bg-command-raised border-command-primary text-command-primary font-bold'
                : 'bg-command-bg border-command-border text-command-muted hover:text-command-text'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Compare Alternatives ({alternatives.length})</span>
          </button>
        </div>
      )}

      {/* Tab 2: Alternatives Radar / Comparative View */}
      {activeTab === 'alternatives' && (
        <div className="p-3 bg-command-bg rounded-[1px] border border-command-border space-y-3">
          <OptionsComparisonChart
            primary={recommendation}
            alternatives={alternatives}
            selectedOptionId={selectedOptionId}
            onSelectOption={(id) => setSelectedOptionId(id)}
          />
        </div>
      )}

      {/* 3. "Proposed changes" list with clear diff & before/after styling */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-command-muted font-bold">
          <span>Proposed Master Sortie Changes ({activeOption.changes.length})</span>
          <span className="text-command-subdued">Diff Inspection</span>
        </div>

        <div className="space-y-1">
          {activeOption.changes.map((change: Change, idx: number) => {
            const beforeStr = String(change.before || 'DEFAULT');
            const afterStr = String(change.after || 'MODIFIED');

            return (
              <div
                key={idx}
                className="p-2 rounded-[1px] bg-command-bg border border-command-border/80 flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-command-primary px-1 py-0.2 rounded-[1px] bg-command-panel border border-command-border text-[10px]">
                      {change.missionId}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-[1px] text-[9px] uppercase font-bold bg-command-raised text-command-secondary border border-command-border">
                      {change.kind.replace('_', ' ')}
                    </span>
                  </div>
                  {change.note && (
                    <span className="text-[10px] text-command-muted truncate max-w-xs" title={change.note}>
                      {change.note}
                    </span>
                  )}
                </div>

                {/* Diff Readout */}
                <div className="flex items-center gap-2 text-[11px] pt-0.5">
                  <span className="px-1.5 py-0.5 rounded-[1px] bg-command-critical-bg text-red-300 line-through border border-command-critical-border/50 text-[10px] truncate max-w-[140px]">
                    {beforeStr}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-command-muted shrink-0" />
                  <span className="px-1.5 py-0.5 rounded-[1px] bg-command-nominal-bg text-command-nominal font-bold border border-command-nominal-border/50 text-[10px] truncate max-w-[160px]">
                    {afterStr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. "Trade-offs" mini-table */}
      {activeOption.tradeoffs && activeOption.tradeoffs.length > 0 && (
        <div className="space-y-1.5 bg-command-bg p-2.5 rounded-[1px] border border-command-border">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-command-muted font-bold">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-command-primary" />
              <span>Operational Trade-Offs & Impact</span>
            </span>
            <span className="text-command-subdued">Equilibrium Delta</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {activeOption.tradeoffs.map((to: Tradeoff, i: number) => {
              const isGood = to.direction === 'good';
              const isBad = to.direction === 'bad';

              return (
                <div
                  key={i}
                  className={`p-1.5 rounded-[1px] border flex flex-col justify-between ${
                    isGood
                      ? 'border-command-nominal-border/60 bg-command-nominal-bg/20'
                      : isBad
                      ? 'border-command-warning-border/60 bg-command-warning-bg/20'
                      : 'border-command-border bg-command-panel'
                  }`}
                >
                  <span className="text-[10px] text-command-muted truncate" title={to.label}>
                    {to.label}
                  </span>
                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`font-bold text-xs flex items-center gap-0.5 ${
                        isGood
                          ? 'text-command-nominal'
                          : isBad
                          ? 'text-command-warning'
                          : 'text-command-text'
                      }`}
                    >
                      {isGood ? (
                        <TrendingDown className="w-3.5 h-3.5 text-command-nominal" />
                      ) : isBad ? (
                        <TrendingUp className="w-3.5 h-3.5 text-command-warning" />
                      ) : null}
                      <span>
                        {to.delta > 0 ? `+${to.delta}` : to.delta} {to.unit}
                      </span>
                    </span>
                    <span className="text-[9px] uppercase text-command-subdued">
                      {to.direction}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. "Why this recommendation" section */}
      <div className="space-y-2 p-2.5 rounded-[1px] bg-command-panel border border-command-border/80 text-[11px]">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-command-primary tracking-wider">
          <FileQuestion className="w-3.5 h-3.5" />
          <span>Why This Recommendation (Solver Rationale)</span>
        </div>

        {/* Plain Language Explanations */}
        {activeOption.explanation && (
          <ul className="space-y-1 list-disc list-inside text-command-text/90 font-sans text-xs">
            {activeOption.explanation.map((exp: string, idx: number) => (
              <li key={idx} className="leading-relaxed">
                {exp}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
          {/* Constraints Satisfied (Green Checks) */}
          <div className="p-2 rounded-[1px] bg-command-bg border border-command-nominal-border/40 space-y-1">
            <span className="text-command-nominal font-bold uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Constraints Satisfied</span>
            </span>
            <div className="space-y-0.5">
              {activeOption.constraintsSatisfied?.map((c: string, idx: number) => (
                <div key={idx} className="flex items-start gap-1 text-command-text/90">
                  <Check className="w-3 h-3 text-command-nominal shrink-0 mt-0.5" />
                  <span className="truncate">{c}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Constraints Relaxed (Amber Warnings - Must be prominent!) */}
          <div className="p-2 rounded-[1px] bg-command-warning-bg/40 border border-command-warning-border space-y-1">
            <span className="text-command-warning font-bold uppercase tracking-wider flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-command-warning" />
              <span>Constraints Relaxed (Warning)</span>
            </span>
            <div className="space-y-0.5">
              {activeOption.constraintsRelaxed && activeOption.constraintsRelaxed.length > 0 ? (
                activeOption.constraintsRelaxed.map((c: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-1 text-amber-200">
                    <AlertTriangle className="w-3 h-3 text-command-warning shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </div>
                ))
              ) : (
                <span className="text-command-subdued">Zero constraints relaxed. All hard tolerances strictly held.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Inline Assignment Modification Interface */}
      {isModifying && (
        <div className="p-3 rounded-[1px] bg-command-bg border border-command-primary space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-command-border pb-1.5">
            <span className="text-[11px] font-bold text-command-primary uppercase flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Manual Assignment Swap & Instant Re-validation</span>
            </span>
            <button
              type="button"
              onClick={() => setIsModifying(false)}
              className="text-command-muted hover:text-command-text text-[10px] underline"
            >
              Cancel Edit
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {/* Target Mission */}
            <div className="space-y-1">
              <label className="text-[10px] text-command-muted uppercase">Target Mission</label>
              <select
                aria-label="Target Mission"
                value={targetMissionId}
                onChange={(e) => setTargetMissionId(e.target.value)}
                className="w-full bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
              >
                {recommendation.impactedMissionIds.map((mId) => (
                  <option key={mId} value={mId}>
                    Mission {mId}
                  </option>
                ))}
              </select>
            </div>

            {/* Aircraft Swap Dropdown (Filtered by Feasibility) */}
            <div className="space-y-1">
              <label className="text-[10px] text-command-muted uppercase flex items-center gap-1">
                <Plane className="w-3 h-3" />
                <span>Substitute Aircraft</span>
              </label>
              <select
                aria-label="Substitute Aircraft"
                value={selectedAircraftSwap}
                onChange={(e) => setSelectedAircraftSwap(e.target.value)}
                className="w-full bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
              >
                <option value="">Retain Planned Aircraft</option>
                {eligibleAircraft.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tailNumber} ({ac.type}) - {ac.baseId} [{ac.fuelPct}% fuel]
                  </option>
                ))}
              </select>
            </div>

            {/* Crew Swap Dropdown (Filtered by Feasibility) */}
            <div className="space-y-1">
              <label className="text-[10px] text-command-muted uppercase flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span>Substitute Aircrew</span>
              </label>
              <select
                aria-label="Substitute Aircrew"
                value={selectedCrewSwap}
                onChange={(e) => setSelectedCrewSwap(e.target.value)}
                className="w-full bg-command-panel border border-command-border px-2 py-1 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
              >
                <option value="">Retain Planned Aircrew</option>
                {eligibleCrew.map((cr) => (
                  <option key={cr.id} value={cr.id}>
                    {cr.callsign} ({cr.role}) - Fatigue: {cr.fatigueIndex}/100
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Validation Feedback */}
          {validationResult && (
            <div className="p-2 rounded-[1px] border bg-command-panel text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  {validationResult.valid ? (
                    <Check className="w-3.5 h-3.5 text-command-nominal" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-command-critical" />
                  )}
                  <span className={validationResult.valid ? 'text-command-nominal' : 'text-command-critical'}>
                    {validationResult.valid ? 'FEASIBILITY VERIFIED // NO CONFLICTS' : 'CONFLICTS DETECTED // REVIEW REQUIRED'}
                  </span>
                </span>
                <span className="text-[10px] text-command-primary font-bold">
                  PROJECTED SCORE: {validationResult.score}%
                </span>
              </div>

              {validationResult.conflicts.length > 0 && (
                <ul className="list-disc list-inside text-[11px] text-command-critical space-y-0.5">
                  {validationResult.conflicts.map((conf, i) => (
                    <li key={i}>{conf}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Modify Actions */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-command-border/50">
            <button
              type="button"
              onClick={() => setIsModifying(false)}
              className="px-2.5 py-1 rounded-[1px] border border-command-border text-xs hover:bg-command-raised"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || (validationResult !== null && !validationResult.valid)}
              onClick={handleApproveModified}
              className="px-3 py-1 rounded-[1px] bg-command-primary text-black font-bold text-xs hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Committing...' : 'Approve Modified Plan'}
            </button>
          </div>
        </div>
      )}

      {/* 7. Action Controls: Compare Routes, Modify, Reject, Approve */}
      {!isDecided && !isModifying && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-command-border">
          {/* Map Compare Toggle */}
          <button
            type="button"
            onClick={() => setMapPlanView(mapPlanView === 'after' ? 'before' : 'after')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-[1px] text-xs font-mono border transition-none ${
              mapPlanView === 'after'
                ? 'bg-command-raised border-command-primary text-command-primary font-bold'
                : 'bg-command-bg border-command-border text-command-text hover:bg-command-raised'
            }`}
            title="Toggle BEFORE and AFTER plan overlay on tactical map"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{mapPlanView === 'after' ? 'Exit Compare' : 'Compare Routes'}</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Modify Button */}
            <button
              type="button"
              onClick={() => setIsModifying(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[1px] text-xs font-mono border border-command-border bg-command-bg text-command-text hover:border-command-primary hover:text-command-primary"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Modify</span>
            </button>

            {/* Reject Button */}
            <button
              type="button"
              onClick={() => setIsRejectOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[1px] text-xs font-mono border border-command-critical-border bg-command-critical-bg text-command-critical hover:opacity-90"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>

            {/* Approve Button */}
            <button
              type="button"
              onClick={() => setIsApproveOpen(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-[1px] text-xs font-mono font-bold border border-command-primary bg-command-primary text-black hover:opacity-90"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve Plan</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Approve Retask Plan */}
      <Modal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        title="COMMANDER DIRECTIVE: APPROVE RETASK PLAN"
        subtitle={`AUTHORIZE COMMIT TO MASTER AIR TASKING ORDER // ${recommendation.id}`}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsApproveOpen(false)}
              className="px-3 py-1 rounded-[1px] border border-command-border text-xs text-command-muted hover:text-command-text"
              disabled={isSubmitting}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="px-3 py-1 rounded-[1px] bg-command-primary text-black font-bold text-xs hover:opacity-90 flex items-center gap-1"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>CONFIRM & EXECUTE RETASK</span>
            </button>
          </>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <p className="text-command-text leading-relaxed">
            Approving this recommendation will commit all proposed changes directly to the active Air Tasking Order. All aircraft, aircrew, routes, and timeline schedules will immediately update across the Common Operational Picture.
          </p>

          <div className="p-2.5 rounded-[1px] bg-command-bg border border-command-border space-y-1.5">
            <span className="text-[10px] text-command-muted uppercase font-bold">Planned Sortie Retask:</span>
            <div className="text-command-heading font-bold">{recommendation.summary}</div>
            <div className="text-[11px] text-command-nominal flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Optimisation Score: {Math.round(recommendation.score)}% // Confidence: {(recommendation.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="text-[10px] text-command-muted uppercase">
            OPERATOR CALLSIGN: <strong className="text-command-text">COMMANDER_OPS</strong> // ACTION LOGGED TO CRYPTOGRAPHIC AUDIT TRAIL
          </div>
        </div>
      </Modal>

      {/* Rejection Modal with Mandatory Reason Selection */}
      <Modal
        isOpen={isRejectOpen}
        onClose={() => setIsRejectOpen(false)}
        title="COMMANDER DIRECTIVE: REJECT RETASK PLAN"
        subtitle={`DISMISS OPTIMISER PROPOSAL // ${recommendation.id}`}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsRejectOpen(false)}
              className="px-3 py-1 rounded-[1px] border border-command-border text-xs text-command-muted hover:text-command-text"
              disabled={isSubmitting}
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isSubmitting}
              className="px-3 py-1 rounded-[1px] bg-command-critical text-white font-bold text-xs hover:opacity-90 flex items-center gap-1"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              <span>CONFIRM REJECTION</span>
            </button>
          </>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <p className="text-command-text leading-relaxed">
            Rejecting this plan maintains the current operational baseline without modification. Select an operational rationale for the audit record.
          </p>

          <div className="space-y-1">
            <label className="text-[10px] text-command-muted uppercase">Operational Rationale:</label>
            <select
              aria-label="Rejection Reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full bg-command-bg border border-command-border px-2.5 py-1.5 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
            >
              <option value="Tactical priorities superseded">Tactical priorities superseded</option>
              <option value="Threat envelope unacceptable">Threat envelope unacceptable</option>
              <option value="Asset reserved for theater contingency">Asset reserved for theater contingency</option>
              <option value="Weather minima incompatible with payload">Weather minima incompatible with payload</option>
              <option value="Manual commander intervention planned">Manual commander intervention planned</option>
              <option value="Other">Other (Specify below)</option>
            </select>
          </div>

          {rejectReason === 'Other' && (
            <div className="space-y-1">
              <label className="text-[10px] text-command-muted uppercase">Custom Operational Justification:</label>
              <textarea
                rows={2}
                placeholder="Enter commander reason..."
                value={rejectCustomText}
                onChange={(e) => setRejectCustomText(e.target.value)}
                className="w-full bg-command-bg border border-command-border p-2 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
              />
            </div>
          )}

          <div className="text-[10px] text-command-muted uppercase">
            OPERATOR CALLSIGN: <strong className="text-command-text">COMMANDER_OPS</strong> // IMMUTABLE AUDIT LOG ENTRY GENERATED
          </div>
        </div>
      </Modal>
    </div>
  );
};
