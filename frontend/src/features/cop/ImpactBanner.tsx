import React, { useEffect, useState } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useEntitiesStore } from '@/store/entitiesStore';
import { AlertTriangle, Clock, X, ChevronRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const ImpactBanner: React.FC = () => {
  const { activeImpact, impactedMissionIds, clearImpact, selectMission } = useUiStore();
  const missions = useEntitiesStore((s) => s.missions);

  // Time-to-decision countdown (starts at timeToDecisionMin * 60, defaults to 5 min = 300s)
  const initialSeconds = (activeImpact?.timeToDecisionMin || 5) * 60;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(initialSeconds);

  useEffect(() => {
    if (!activeImpact) {
      setSecondsRemaining(initialSeconds);
      return;
    }
    setSecondsRemaining((activeImpact.timeToDecisionMin || 5) * 60);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [activeImpact, initialSeconds]);

  if (!activeImpact && impactedMissionIds.length === 0) {
    return null;
  }

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timerFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const impactedList = impactedMissionIds.map((id) => missions[id]).filter(Boolean);

  return (
    <aside
      aria-label="Operational Impact Advisory"
      className="absolute top-16 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-4xl animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="bg-ops-surface-base/95 backdrop-blur-md border border-red-500/60 shadow-2xl shadow-red-950/40 rounded-lg p-3 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Icon & Impact details */}
        <div className="flex items-start md:items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-red-950/80 border border-red-500/80 flex items-center justify-center shrink-0 animate-pulse text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                TACTICAL IMPACT ALERT
              </span>
              <span className="text-xs text-ops-text-muted">|</span>
              <span className="text-xs font-medium text-slate-200">
                {activeImpact?.impactedMissionIds.length || impactedMissionIds.length} mission(s) at risk
              </span>
            </div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-2 flex-wrap">
              {impactedList.length > 0 ? (
                impactedList.map((m) => (
                  <span
                    key={m.id}
                    onClick={() => selectMission(m.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/60 border border-red-500/40 cursor-pointer font-mono text-xs text-red-200 transition-colors"
                    title={`Click to inspect ${m.name}`}
                  >
                    <span>{m.id}</span>
                    <span className="text-slate-300 font-sans font-normal">({m.name} - P{m.priority})</span>
                    <ChevronRight className="w-3 h-3 text-red-400" />
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-300">
                  {impactedMissionIds.join(', ')}
                </span>
              )}
            </div>
            {activeImpact?.reasons && activeImpact.reasons.length > 0 && (
              <p className="text-xs text-slate-300 mt-1 max-w-xl truncate">
                {activeImpact.reasons[0]}
              </p>
            )}
          </div>
        </div>

        {/* Right: Countdown Timer & Actions */}
        <div className="flex items-center gap-3 self-end md:self-center shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-ops-surface-panel border border-amber-500/40 text-amber-300 font-mono text-xs">
            <Clock className="w-3.5 h-3.5 animate-spin-slow" />
            <span className="text-[10px] uppercase text-ops-text-muted font-sans font-medium">Decision Window:</span>
            <span className="font-bold text-amber-400 text-sm tracking-wider">{timerFormatted}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={clearImpact}
            className="text-ops-text-muted hover:text-white p-1 h-8 w-8"
            title="Acknowledge & Dismiss Banner"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
};
