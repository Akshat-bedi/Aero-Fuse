import React from 'react';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useUiStore } from '@/store/uiStore';
import { dataService } from '@/services';
import {
  Check,
  X,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const RecommendationPreviewCard: React.FC = () => {
  const recommendations = useRecommendationsStore((s) => s.recommendations);
  const { mapPlanView, setMapPlanView, addToast } = useUiStore();

  // Find the latest pending recommendation
  const pendingRecs = Object.values(recommendations)
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rec = pendingRecs[0];

  if (!rec) {
    return null;
  }

  const handleApprove = async () => {
    try {
      await dataService.decideRecommendation(rec.id, 'approved', undefined, 'Commander approved via COP');
      addToast({
        type: 'nominal',
        title: 'Retasking Plan Approved',
        message: `Plan ${rec.id} approved and committed to master ATO sortie schedule.`,
      });
    } catch {
      addToast({
        type: 'critical',
        title: 'Approval Failed',
        message: 'Could not communicate decision to operational authority.',
      });
    }
  };

  const handleReject = async () => {
    try {
      await dataService.decideRecommendation(rec.id, 'rejected', undefined, 'Commander rejected via COP');
      addToast({
        type: 'warning',
        title: 'Retasking Plan Rejected',
        message: `Plan ${rec.id} rejected. Retaining current operational baseline.`,
      });
    } catch {
      addToast({
        type: 'critical',
        title: 'Rejection Failed',
        message: 'Could not communicate decision.',
      });
    }
  };

  return (
    <div className="absolute bottom-6 right-6 z-30 w-96 max-w-[calc(100vw-3rem)] bg-ops-surface-panel/95 backdrop-blur-md border border-cyan-500/60 rounded-lg p-4 shadow-2xl shadow-cyan-950/50 text-white animate-in fade-in slide-in-from-right-4 duration-300 pointer-events-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-ops-border/60 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-950 border border-cyan-400 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-cyan-400">{rec.id}</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-500/40 font-mono">
                {rec.score}% OPTIMAL
              </span>
            </div>
          </div>
        </div>

        <span className="text-[10px] font-mono text-ops-text-muted">
          TRIGGER: {rec.triggerEventId}
        </span>
      </div>

      {/* Summary Description */}
      <p className="text-xs text-slate-100 font-medium leading-relaxed mb-3">
        {rec.summary}
      </p>

      {/* Key Tradeoffs */}
      {rec.tradeoffs && rec.tradeoffs.length > 0 && (
        <div className="mb-3 space-y-1.5 bg-ops-surface-base/80 p-2.5 rounded border border-ops-border/60">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ops-text-muted flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-ops-accent" />
            <span>Operational Trade-offs</span>
          </div>
          {rec.tradeoffs.slice(0, 3).map((to, i) => (
            <div key={i} className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 truncate text-[11px]">{to.label}</span>
              <span
                className={`flex items-center gap-0.5 font-bold ${
                  to.direction === 'good' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {to.direction === 'good' ? (
                  <TrendingDown className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-amber-400" />
                )}
                {to.delta > 0 ? `+${to.delta}` : to.delta} {to.unit}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Constraints Satisfied Pill */}
      {rec.constraintsSatisfied && rec.constraintsSatisfied.length > 0 && (
        <div className="mb-3 flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{rec.constraintsSatisfied[0]}</span>
        </div>
      )}

      {/* Action Buttons: Plan View Toggle, Reject, Approve */}
      <div className="flex items-center gap-2 pt-2 border-t border-ops-border/60">
        <button
          type="button"
          onClick={() => setMapPlanView(mapPlanView === 'after' ? 'before' : 'after')}
          className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono border transition-all ${
            mapPlanView === 'after'
              ? 'bg-cyan-900/60 border-cyan-400 text-cyan-200'
              : 'bg-ops-surface-base border-ops-border text-slate-300 hover:border-slate-500'
          }`}
          title="Toggle BEFORE and AFTER plan overlay on tactical map"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{mapPlanView === 'after' ? 'Exit Compare' : 'Compare Routes'}</span>
        </button>

        <Button
          variant="danger"
          size="sm"
          onClick={handleReject}
          className="px-2.5 py-1 text-xs font-mono"
        >
          <X className="w-3.5 h-3.5 mr-0.5" />
          <span>Reject</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handleApprove}
          className="px-3 py-1 text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-950/40"
        >
          <Check className="w-3.5 h-3.5 mr-0.5" />
          <span>Approve Retask</span>
        </Button>
      </div>
    </div>
  );
};
