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
      className="absolute top-12 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-4xl pointer-events-auto"
    >
      <div className="bg-command-panel border border-command-critical-border rounded-[2px] p-2.5 text-command-text flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        {/* Left: Icon & Impact details */}
        <div className="flex items-start md:items-center gap-2.5">
          <div className="w-8 h-8 rounded-[1px] bg-command-critical-bg border border-command-critical-border flex items-center justify-center shrink-0 text-command-critical">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-command-critical flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                TACTICAL IMPACT ALERT
              </span>
              <span className="text-xs text-command-muted">/</span>
              <span className="text-xs font-medium text-command-heading font-mono">
                {activeImpact?.impactedMissionIds.length || impactedMissionIds.length} mission(s) at risk
              </span>
            </div>
            <div className="text-xs font-semibold text-command-heading mt-0.5 flex items-center gap-2 flex-wrap font-mono">
              {impactedList.length > 0 ? (
                impactedList.map((m) => (
                  <span
                    key={m.id}
                    onClick={() => selectMission(m.id)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[1px] bg-command-raised hover:bg-command-raised-hover border border-command-border cursor-pointer text-xs text-command-critical"
                    title={`Click to inspect ${m.name}`}
                  >
                    <span>{m.id}</span>
                    <span className="text-command-muted font-mono font-normal">({m.name} - P{m.priority})</span>
                    <ChevronRight className="w-3 h-3 text-command-muted" />
                  </span>
                ))
              ) : (
                <span className="text-xs text-command-muted">
                  {impactedMissionIds.join(', ')}
                </span>
              )}
            </div>
            {activeImpact?.reasons && activeImpact.reasons.length > 0 && (
              <p className="text-[11px] text-command-muted mt-0.5 max-w-xl truncate font-mono">
                {activeImpact.reasons[0]}
              </p>
            )}
          </div>
        </div>

        {/* Right: Countdown Timer & Actions */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-warning-border text-command-warning font-mono text-xs">
            <Clock className="w-3 h-3" />
            <span className="text-[9px] uppercase text-command-muted font-mono">DECISION:</span>
            <span className="font-bold text-command-warning text-xs tracking-wider tabular-nums">{timerFormatted}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={clearImpact}
            className="text-command-muted hover:text-command-heading p-1 h-7 w-7"
            title="Acknowledge & Dismiss Banner"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
};
