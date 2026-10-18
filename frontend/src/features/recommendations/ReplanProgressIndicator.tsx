import React, { useEffect, useState } from 'react';
import { useUiStore } from '@/store/uiStore';
import { RetaskStage } from '@/types';
import { Cpu, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface StageConfig {
  key: RetaskStage;
  label: string;
}

const STAGES: StageConfig[] = [
  { key: 'fusing', label: 'Fusing Data' },
  { key: 'constraints', label: 'Checking Constraints' },
  { key: 'optimising', label: 'Optimising' },
  { key: 'ranking', label: 'Ranking Options' },
];

export const ReplanProgressIndicator: React.FC = () => {
  const { retaskProgress } = useUiStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (retaskProgress?.isReplanActive) {
      setVisible(true);
    } else if (retaskProgress?.stage === 'ready') {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 4000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [retaskProgress?.isReplanActive, retaskProgress?.stage]);

  if (!visible || !retaskProgress) {
    return null;
  }

  const currentStage = retaskProgress.stage;
  const isReady = currentStage === 'ready';

  const getStageIndex = (stage: string | null) => {
    if (stage === 'ready') return 4;
    return STAGES.findIndex((s) => s.key === stage);
  };

  const activeIndex = getStageIndex(currentStage);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-2xl bg-ops-surface-panel/95 backdrop-blur-md border border-cyan-500/50 rounded-lg p-3.5 shadow-2xl shadow-cyan-950/40 text-white animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
    >
      {/* Top Header: Title, Live Message & Elapsed Time */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400">
            {isReady ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Cpu className="w-4 h-4 animate-pulse text-cyan-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                {isReady ? 'DYNAMIC RETASKING READY' : 'AI RETASKING ENGINE ACTIVE'}
              </span>
              <span className="text-[10px] text-ops-text-muted">|</span>
              <span className="text-xs text-slate-300 truncate max-w-sm">
                {retaskProgress.message || 'Evaluating mission constraints & sensor streams...'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Elapsed Time Pill */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-ops-surface-base border border-ops-border text-xs font-mono text-cyan-300 shrink-0">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] text-ops-text-muted">Elapsed:</span>
          <span className="font-bold">{(retaskProgress.elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* 4-Step Progressive Pipeline */}
      <div className="grid grid-cols-4 gap-2 relative">
        {STAGES.map((s, idx) => {
          const isDone = isReady || activeIndex > idx;
          const isCurrent = !isReady && activeIndex === idx;

          return (
            <div
              key={s.key}
              className={`flex flex-col items-center justify-center p-2 rounded border transition-all ${
                isDone
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : isCurrent
                  ? 'bg-cyan-950/50 border-cyan-400 shadow-sm shadow-cyan-500/30 text-cyan-200'
                  : 'bg-ops-surface-base/50 border-ops-border/40 text-slate-500'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-mono font-medium mb-1">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center text-[9px] text-slate-500">
                    {idx + 1}
                  </div>
                )}
                <span className="text-[11px] truncate">{s.label}</span>
              </div>
              <div
                className={`w-full h-1 rounded-full overflow-hidden ${
                  isDone
                    ? 'bg-emerald-500'
                    : isCurrent
                    ? 'bg-cyan-500 animate-pulse'
                    : 'bg-slate-800'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
