import React, { useEffect, useState } from 'react';
import { useUiStore } from '@/store/uiStore';
import { RetaskStage } from '@/types';
import { Cpu, CheckCircle2, Loader2 } from 'lucide-react';

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
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-11/12 max-w-2xl bg-command-panel border border-command-border rounded-[2px] p-2.5 text-command-text pointer-events-auto font-mono"
    >
      {/* Top Header: Title, Live Message & Elapsed Time */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[1px] bg-command-raised border border-command-border flex items-center justify-center text-command-primary">
            {isReady ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-command-nominal" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-command-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-command-primary">
                {isReady ? 'DYNAMIC RETASKING READY' : 'RETASKING ENGINE ACTIVE'}
              </span>
              <span className="text-[10px] text-command-muted">/</span>
              <span className="text-xs text-command-muted truncate max-w-sm">
                {retaskProgress.message || 'Evaluating mission constraints & sensor streams...'}
              </span>
            </div>
          </div>
        </div>

        {/* Live Elapsed Time */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-xs font-mono text-command-heading shrink-0 tabular-nums">
          <span className="text-[10px] text-command-muted">ELAPSED:</span>
          <span className="font-bold">{(retaskProgress.elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* 4-Step Progressive Pipeline */}
      <div className="grid grid-cols-4 gap-1.5 relative">
        {STAGES.map((s, idx) => {
          const isDone = isReady || activeIndex > idx;
          const isCurrent = !isReady && activeIndex === idx;

          return (
            <div
              key={s.key}
              className={`flex flex-col items-center justify-center p-1.5 rounded-[1px] border ${
                isDone
                  ? 'bg-command-nominal-bg border-command-nominal-border text-command-nominal'
                  : isCurrent
                  ? 'bg-command-raised border-command-primary text-command-primary'
                  : 'bg-command-bg border-command-border text-command-subdued'
              }`}
            >
              <div className="flex items-center gap-1 text-[11px] font-mono font-medium mb-1">
                {isDone ? (
                  <CheckCircle2 className="w-3 h-3 text-command-nominal shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3 h-3 text-command-primary animate-spin shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-[1px] border border-command-border flex items-center justify-center text-[8px] text-command-subdued">
                    {idx + 1}
                  </div>
                )}
                <span className="truncate">{s.label}</span>
              </div>
              <div
                className={`w-full h-1 rounded-[1px] overflow-hidden ${
                  isDone
                    ? 'bg-command-nominal'
                    : isCurrent
                    ? 'bg-command-primary'
                    : 'bg-command-border'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
