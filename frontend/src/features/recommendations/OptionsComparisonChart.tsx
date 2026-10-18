import React from 'react';
import { Recommendation } from '@/types';

interface OptionsComparisonChartProps {
  primary: Recommendation;
  alternatives: Recommendation[];
  selectedOptionId: string;
  onSelectOption: (id: string) => void;
}

interface CriteriaMetric {
  key: string;
  label: string;
  primaryVal: number; // 0 - 100
  alt1Val: number;
  alt2Val: number;
}

export const OptionsComparisonChart: React.FC<OptionsComparisonChartProps> = ({
  primary,
  alternatives,
  selectedOptionId,
  onSelectOption,
}) => {
  const alt1 = alternatives[0];
  const alt2 = alternatives[1];

  // Synthesize consistent tactical criteria metrics across options
  const criteria: CriteriaMetric[] = [
    {
      key: 'score',
      label: 'Overall Feasibility',
      primaryVal: Math.round(primary.score),
      alt1Val: alt1 ? Math.round(alt1.score) : 65,
      alt2Val: alt2 ? Math.round(alt2.score) : 58,
    },
    {
      key: 'survivability',
      label: 'Threat Avoidance',
      primaryVal: 95,
      alt1Val: alt1 ? 75 : 70,
      alt2Val: alt2 ? 82 : 60,
    },
    {
      key: 'fuel',
      label: 'Fuel Efficiency',
      primaryVal: 88,
      alt1Val: alt1 ? 70 : 65,
      alt2Val: alt2 ? 62 : 55,
    },
    {
      key: 'schedule',
      label: 'Schedule Adherence',
      primaryVal: 90,
      alt1Val: alt1 ? 60 : 70,
      alt2Val: alt2 ? 85 : 75,
    },
    {
      key: 'resources',
      label: 'Fleet Margin Preserved',
      primaryVal: 85,
      alt1Val: alt1 ? 92 : 80,
      alt2Val: alt2 ? 78 : 65,
    },
  ];

  const options = [
    { id: primary.id, label: 'Primary (Opt A)', score: primary.score, color: '#d9a521' }, // amber
    ...(alt1 ? [{ id: alt1.id, label: 'Option B', score: alt1.score, color: '#5b8ec2' }] : []), // steel
    ...(alt2 ? [{ id: alt2.id, label: 'Option C', score: alt2.score, color: '#879a8e' }] : []), // olive/grey
  ];

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Legend & Option Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-command-border/70 pb-2">
        <span className="text-[10px] uppercase tracking-wider text-command-muted font-bold">
          Tactical Criteria Comparative Analysis
        </span>
        <div className="flex items-center gap-2">
          {options.map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectOption(opt.id)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] border text-[11px] transition-none ${
                  isSelected
                    ? 'border-command-primary bg-command-raised text-command-primary font-bold'
                    : 'border-command-border bg-command-bg text-command-muted hover:text-command-text'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-[1px]"
                  style={{ backgroundColor: opt.color }}
                />
                <span>{opt.label}</span>
                <span className="text-[10px] opacity-80">({Math.round(opt.score)}%)</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparative Grouped Horizontal Bars */}
      <div className="space-y-2.5">
        {criteria.map((c) => (
          <div key={c.key} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-command-text font-medium">{c.label}</span>
              <div className="flex items-center gap-3 text-[10px] text-command-muted tabular-nums">
                <span className="text-command-primary">A: {c.primaryVal}%</span>
                {alt1 && <span className="text-command-secondary">B: {c.alt1Val}%</span>}
                {alt2 && <span className="text-command-subdued">C: {c.alt2Val}%</span>}
              </div>
            </div>

            {/* Tri-Bar Stack / Cluster */}
            <div className="space-y-0.5 bg-command-bg p-1 rounded-[1px] border border-command-border/50">
              {/* Option A Bar */}
              <div className="h-1.5 w-full bg-command-panel rounded-[1px] overflow-hidden">
                <div
                  className="h-full bg-command-primary transition-all duration-300"
                  style={{ width: `${c.primaryVal}%` }}
                  title={`Option A: ${c.primaryVal}%`}
                />
              </div>

              {/* Option B Bar */}
              {alt1 && (
                <div className="h-1.5 w-full bg-command-panel rounded-[1px] overflow-hidden">
                  <div
                    className="h-full bg-command-secondary transition-all duration-300"
                    style={{ width: `${c.alt1Val}%` }}
                    title={`Option B: ${c.alt1Val}%`}
                  />
                </div>
              )}

              {/* Option C Bar */}
              {alt2 && (
                <div className="h-1.5 w-full bg-command-panel rounded-[1px] overflow-hidden">
                  <div
                    className="h-full bg-command-muted transition-all duration-300"
                    style={{ width: `${c.alt2Val}%` }}
                    title={`Option C: ${c.alt2Val}%`}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
