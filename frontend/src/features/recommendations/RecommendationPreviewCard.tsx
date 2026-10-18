import React from 'react';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useUiStore } from '@/store/uiStore';
import { dataService } from '@/services';
import {
  Check,
  X,
  Layers,
  Target,
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
    <div className="absolute bottom-4 right-4 z-30 w-96 max-w-[calc(100vw-3rem)] bg-command-panel border border-command-border rounded-[2px] p-3 text-command-text pointer-events-auto font-mono">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-command-border mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[1px] bg-command-raised border border-command-border flex items-center justify-center text-command-primary">
            <Target className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-command-primary">{rec.id}</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.2 rounded-[1px] bg-command-bg text-command-primary border border-command-border font-mono">
                {rec.score}% OPT
              </span>
            </div>
          </div>
        </div>

        <span className="text-[10px] font-mono text-command-muted">
          TRIGGER: {rec.triggerEventId}
        </span>
      </div>

      {/* Summary Description */}
      <p className="text-xs text-command-heading font-mono leading-relaxed mb-2.5">
        {rec.summary}
      </p>

      {/* Key Tradeoffs */}
      {rec.tradeoffs && rec.tradeoffs.length > 0 && (
        <div className="mb-2.5 space-y-1 bg-command-bg p-2 rounded-[1px] border border-command-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-command-muted flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-command-warning" />
            <span>OPERATIONAL TRADE-OFFS</span>
          </div>
          {rec.tradeoffs.slice(0, 3).map((to, i) => (
            <div key={i} className="flex items-center justify-between text-xs font-mono">
              <span className="text-command-muted truncate text-[11px]">{to.label}</span>
              <span
                className={`flex items-center gap-0.5 font-bold ${
                  to.direction === 'good' ? 'text-command-nominal' : 'text-command-warning'
                }`}
              >
                {to.direction === 'good' ? (
                  <TrendingDown className="w-3 h-3 text-command-nominal" />
                ) : (
                  <TrendingUp className="w-3 h-3 text-command-warning" />
                )}
                {to.delta > 0 ? `+${to.delta}` : to.delta} {to.unit}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Constraints Satisfied Pill */}
      {rec.constraintsSatisfied && rec.constraintsSatisfied.length > 0 && (
        <div className="mb-2.5 flex items-center gap-1 text-[10px] text-command-nominal font-mono">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{rec.constraintsSatisfied[0]}</span>
        </div>
      )}

      {/* Action Buttons: Plan View Toggle, Reject, Approve */}
      <div className="flex items-center gap-2 pt-2 border-t border-command-border">
        <button
          type="button"
          onClick={() => setMapPlanView(mapPlanView === 'after' ? 'before' : 'after')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-[1px] text-xs font-mono border transition-none ${
            mapPlanView === 'after'
              ? 'bg-command-raised border-command-primary text-command-primary'
              : 'bg-command-bg border-command-border text-command-text hover:bg-command-raised'
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
          className="px-2 py-1 text-xs font-mono"
        >
          <X className="w-3.5 h-3.5 mr-0.5" />
          <span>Reject</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handleApprove}
          className="px-2.5 py-1 text-xs font-mono font-bold"
        >
          <Check className="w-3.5 h-3.5 mr-0.5" />
          <span>Approve Plan</span>
        </Button>
      </div>
    </div>
  );
};
