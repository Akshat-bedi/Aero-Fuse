import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface TimeControlsProps {
  simTime: string;
  speedMultiplier: number;
  isPaused: boolean;
  onSpeedChange: (speed: 1 | 5 | 20) => void;
  onTogglePause: () => void;
  onReset?: () => void;
}

export const TimeControls: React.FC<TimeControlsProps> = ({
  simTime,
  speedMultiplier,
  isPaused,
  onSpeedChange,
  onTogglePause,
  onReset,
}) => {
  const formattedZulu = simTime
    ? new Date(simTime).toISOString().substring(11, 19) + 'Z'
    : '12:00:00Z';

  return (
    <div className="flex items-center gap-2 bg-command-panel/90 backdrop-blur-md px-3 py-1.5 rounded border border-command-border/80 shadow-lg font-mono text-xs">
      {/* Sim Zulu Clock */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-command-border/80">
        <span className="text-[10px] text-command-muted">SIM ZULU:</span>
        <span className="text-command-primary font-bold tracking-wider">{formattedZulu}</span>
      </div>

      {/* Play / Pause */}
      <button
        type="button"
        title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
        onClick={onTogglePause}
        className={`p-1 rounded transition-colors ${
          isPaused
            ? 'bg-command-warning text-black font-bold'
            : 'bg-command-bg hover:bg-command-raised text-command-heading border border-command-border'
        }`}
      >
        {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>

      {/* Speed Multipliers */}
      <div className="flex items-center gap-1 bg-command-bg p-0.5 rounded border border-command-border">
        <button
          type="button"
          onClick={() => onSpeedChange(1)}
          className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
            speedMultiplier === 1 && !isPaused
              ? 'bg-command-primary text-black'
              : 'text-command-muted hover:text-command-text'
          }`}
        >
          1x
        </button>
        <button
          type="button"
          onClick={() => onSpeedChange(5)}
          className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
            speedMultiplier === 5 && !isPaused
              ? 'bg-command-primary text-black'
              : 'text-command-muted hover:text-command-text'
          }`}
        >
          5x
        </button>
        <button
          type="button"
          onClick={() => onSpeedChange(20)}
          className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
            speedMultiplier === 20 && !isPaused
              ? 'bg-command-warning text-black'
              : 'text-command-muted hover:text-command-text'
          }`}
        >
          20x
        </button>
      </div>

      {/* Reset */}
      {onReset && (
        <button
          type="button"
          title="Reset Simulation to Initial Seed"
          onClick={onReset}
          className="p-1 rounded bg-command-bg hover:bg-command-raised text-command-muted hover:text-command-primary transition-colors border border-command-border ml-1"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
