import React from 'react';
import { useUiStore } from '@/store/uiStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { Layers, ArrowRightLeft, Sparkles } from 'lucide-react';

export const PlanCompareToggle: React.FC = () => {
  const { mapPlanView, setMapPlanView } = useUiStore();
  const recommendations = useRecommendationsStore((s) => s.recommendations);

  // Check if there are any pending recommendations with reroutes or changes
  const pendingRecs = Object.values(recommendations).filter((r) => r.status === 'pending');
  const hasPendingChanges = pendingRecs.some((r) => r.changes && r.changes.length > 0);

  return (
    <div className="flex items-center bg-ops-surface-panel/90 backdrop-blur-md border border-ops-border rounded-lg p-1 shadow-lg pointer-events-auto">
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono font-medium text-ops-text-muted border-r border-ops-border/60 mr-1">
        <Layers className="w-3.5 h-3.5 text-ops-accent" />
        <span className="hidden sm:inline">PLAN:</span>
      </div>

      <div className="flex items-center rounded-md bg-ops-surface-base/80 p-0.5 border border-ops-border/40">
        <button
          type="button"
          onClick={() => setMapPlanView('before')}
          className={`px-2.5 py-1 text-xs font-mono rounded transition-all flex items-center gap-1 ${
            mapPlanView === 'before'
              ? 'bg-slate-700 text-white font-semibold shadow-sm'
              : 'text-ops-text-muted hover:text-slate-200'
          }`}
        >
          <span>CURRENT</span>
          <span className="text-[10px] opacity-75">(BEFORE)</span>
        </button>

        <button
          type="button"
          onClick={() => setMapPlanView('after')}
          className={`px-2.5 py-1 text-xs font-mono rounded transition-all flex items-center gap-1 relative ${
            mapPlanView === 'after'
              ? 'bg-cyan-600 text-white font-semibold shadow-sm shadow-cyan-900/40'
              : 'text-ops-text-muted hover:text-cyan-300'
          }`}
        >
          {hasPendingChanges && mapPlanView !== 'after' && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          )}
          <Sparkles className="w-3 h-3 text-cyan-300" />
          <span>PROPOSED</span>
          <span className="text-[10px] opacity-80">(AFTER)</span>
        </button>
      </div>

      {hasPendingChanges && (
        <div className="hidden lg:flex items-center gap-1 pl-2 text-[11px] text-cyan-400 font-sans">
          <ArrowRightLeft className="w-3 h-3 text-cyan-400" />
          <span>AI Bypass Plan Ready</span>
        </div>
      )}
    </div>
  );
};
