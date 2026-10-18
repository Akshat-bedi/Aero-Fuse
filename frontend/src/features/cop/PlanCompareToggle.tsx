import React from 'react';
import { useUiStore } from '@/store/uiStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { Layers, ArrowRightLeft, Target } from 'lucide-react';

export const PlanCompareToggle: React.FC = () => {
  const { mapPlanView, setMapPlanView } = useUiStore();
  const recommendations = useRecommendationsStore((s) => s.recommendations);

  // Check if there are any pending recommendations with reroutes or changes
  const pendingRecs = Object.values(recommendations).filter((r) => r.status === 'pending');
  const hasPendingChanges = pendingRecs.some((r) => r.changes && r.changes.length > 0);

  return (
    <div className="flex items-center bg-command-panel border border-command-border rounded-[2px] p-0.5 pointer-events-auto">
      <div className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono font-medium text-command-muted border-r border-command-border mr-1">
        <Layers className="w-3.5 h-3.5 text-command-primary" />
        <span className="hidden sm:inline">PLAN:</span>
      </div>

      <div className="flex items-center rounded-[1px] bg-command-bg p-0.5 border border-command-border">
        <button
          type="button"
          onClick={() => setMapPlanView('before')}
          className={`px-2 py-0.5 text-xs font-mono rounded-[1px] transition-none flex items-center gap-1 ${
            mapPlanView === 'before'
              ? 'bg-command-raised text-command-heading font-semibold border border-command-border'
              : 'text-command-muted hover:text-command-text'
          }`}
        >
          <span>CURRENT</span>
          <span className="text-[10px] opacity-75">(BEFORE)</span>
        </button>

        <button
          type="button"
          onClick={() => setMapPlanView('after')}
          className={`px-2 py-0.5 text-xs font-mono rounded-[1px] transition-none flex items-center gap-1 relative ${
            mapPlanView === 'after'
              ? 'bg-command-primary text-black font-semibold'
              : 'text-command-muted hover:text-command-primary'
          }`}
        >
          <Target className="w-3 h-3" />
          <span>PROPOSED</span>
          <span className="text-[10px] opacity-80">(AFTER)</span>
        </button>
      </div>

      {hasPendingChanges && (
        <div className="hidden lg:flex items-center gap-1 pl-2 text-[10px] text-command-primary font-mono">
          <ArrowRightLeft className="w-3 h-3 text-command-primary" />
          <span>PROPOSED REPLAN READY</span>
        </div>
      )}
    </div>
  );
};
