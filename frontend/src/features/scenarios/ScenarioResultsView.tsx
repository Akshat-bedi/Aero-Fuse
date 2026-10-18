import React from 'react';
import { ScenarioResult } from '@/types';
import { ScenarioKpiBarChart } from './ScenarioKpiBarChart';
import { ScenarioUtilisationChart } from './ScenarioUtilisationChart';
import { formatTimeZulu } from '@/lib/utils';
import {
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  ShieldAlert,
  Flame,
  GitCompare,
} from 'lucide-react';

interface ScenarioResultsViewProps {
  result: ScenarioResult;
  onCompareWithAnother?: () => void;
}

export const ScenarioResultsView: React.FC<ScenarioResultsViewProps> = ({
  result,
  onCompareWithAnother,
}) => {
  const { baselineKpis, scenarioKpis, firstFailure, unmetMissions, series } = result;

  // Compute key delta indicators
  const fulfillmentDelta = scenarioKpis.missionsFulfilledPct - baselineKpis.missionsFulfilledPct;
  const delayDelta = scenarioKpis.avgDelayMin - baselineKpis.avgDelayMin;
  const utilDelta = scenarioKpis.aircraftUtilisationPct - baselineKpis.aircraftUtilisationPct;

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* 1. Scenario Run Header & Identity */}
      <div className="p-3 bg-command-panel border border-command-border rounded-[2px] flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-[10px] text-command-muted">
            <span className="font-bold text-command-primary">{result.id}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Simulated: {formatTimeZulu(result.createdAt)}</span>
            </span>
          </div>
          <h2 className="text-sm font-bold text-command-heading">{result.name}</h2>
        </div>

        {onCompareWithAnother && (
          <button
            type="button"
            onClick={onCompareWithAnother}
            className="px-3 py-1.5 bg-command-bg border border-command-border rounded-[1px] text-xs text-command-text hover:border-command-primary hover:text-command-primary flex items-center gap-1.5 transition-none"
          >
            <GitCompare className="w-3.5 h-3.5 text-command-primary" />
            <span>Compare With Another Run</span>
          </button>
        )}
      </div>

      {/* 3. First Point of Failure Highlight Callout */}
      {firstFailure ? (
        <div className="p-3 rounded-[2px] bg-command-critical-bg/50 border border-command-critical-border text-command-critical space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-command-critical shrink-0" />
              <span>First Point of Mission Failure: {firstFailure.time}</span>
            </span>
            <span className="text-[10px] uppercase px-1.5 py-0.2 rounded-[1px] bg-command-panel border border-command-critical-border font-bold">
              {firstFailure.cause}
            </span>
          </div>
          <p className="text-[11px] text-red-200 font-sans leading-relaxed">
            {firstFailure.description}
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-[2px] bg-command-nominal-bg/40 border border-command-nominal-border text-command-nominal flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-command-nominal shrink-0" />
            <span className="font-bold text-xs">
              ZERO OPERATIONAL FAILURES DETECTED // ALL CONSTRAINTS FULLY SATISFIED
            </span>
          </div>
          <span className="text-[10px] uppercase px-1.5 py-0.2 rounded-[1px] bg-command-panel border border-command-nominal-border font-bold">
            100% FEASIBLE
          </span>
        </div>
      )}

      {/* 4. Side-by-Side Baseline vs Scenario KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* KPI 1: Missions Fulfilled */}
        <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border space-y-1">
          <span className="text-[10px] text-command-muted uppercase">Missions Fulfilled</span>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-command-heading tabular-nums">
              {scenarioKpis.missionsFulfilledPct}%
            </span>
            <span className="text-[10px] text-command-muted">Base: {baselineKpis.missionsFulfilledPct}%</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {fulfillmentDelta < 0 ? (
              <span className="text-command-critical font-bold flex items-center">
                <TrendingDown className="w-3 h-3" />
                <span>{fulfillmentDelta.toFixed(1)}%</span>
              </span>
            ) : (
              <span className="text-command-nominal font-bold">Nominal (±0%)</span>
            )}
          </div>
        </div>

        {/* KPI 2: P1 Sortie Coverage */}
        <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border space-y-1">
          <span className="text-[10px] text-command-muted uppercase">Priority 1 Coverage</span>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-command-heading tabular-nums">
              {scenarioKpis.p1CoveragePct}%
            </span>
            <span className="text-[10px] text-command-muted">Base: {baselineKpis.p1CoveragePct}%</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {scenarioKpis.p1CoveragePct < 100 ? (
              <span className="text-command-warning font-bold">Degraded Protection</span>
            ) : (
              <span className="text-command-nominal font-bold">100% Protected</span>
            )}
          </div>
        </div>

        {/* KPI 3: Average Sortie Delay */}
        <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border space-y-1">
          <span className="text-[10px] text-command-muted uppercase">Average Sortie Delay</span>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-command-heading tabular-nums">
              +{scenarioKpis.avgDelayMin}m
            </span>
            <span className="text-[10px] text-command-muted">Base: +{baselineKpis.avgDelayMin}m</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {delayDelta > 0 ? (
              <span className="text-command-warning font-bold flex items-center">
                <TrendingUp className="w-3 h-3" />
                <span>+{delayDelta.toFixed(1)} min</span>
              </span>
            ) : (
              <span className="text-command-nominal font-bold">On Schedule</span>
            )}
          </div>
        </div>

        {/* KPI 4: Fleet Utilisation */}
        <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border space-y-1">
          <span className="text-[10px] text-command-muted uppercase">Fleet Utilisation</span>
          <div className="flex items-baseline justify-between">
            <span
              className={`text-base font-bold tabular-nums ${
                scenarioKpis.aircraftUtilisationPct >= 80 ? 'text-command-warning' : 'text-command-heading'
              }`}
            >
              {scenarioKpis.aircraftUtilisationPct}%
            </span>
            <span className="text-[10px] text-command-muted">Base: {baselineKpis.aircraftUtilisationPct}%</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            {utilDelta > 0 ? (
              <span className="text-command-warning font-bold flex items-center">
                <TrendingUp className="w-3 h-3" />
                <span>+{utilDelta.toFixed(1)}% surge</span>
              </span>
            ) : (
              <span className="text-command-nominal font-bold">Reserve Intact</span>
            )}
          </div>
        </div>
      </div>

      {/* 5. Dual ECharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Chart 1: Grouped KPI Comparison Bars */}
        <div className="p-3 bg-command-panel border border-command-border rounded-[2px] space-y-2">
          <div className="flex items-center justify-between border-b border-command-border/70 pb-1.5">
            <span className="text-[10px] uppercase font-bold text-command-primary tracking-wider">
              Comparative Operational Metrics (Baseline vs Scenario)
            </span>
            <span className="text-[9px] text-command-muted">GROUPED BARS</span>
          </div>
          <ScenarioKpiBarChart baselineKpis={baselineKpis} scenarioKpis={scenarioKpis} />
        </div>

        {/* Chart 2: 24-Hour Fleet Utilisation Time Horizon */}
        <div className="p-3 bg-command-panel border border-command-border rounded-[2px] space-y-2">
          <div className="flex items-center justify-between border-b border-command-border/70 pb-1.5">
            <span className="text-[10px] uppercase font-bold text-command-primary tracking-wider">
              24-Hour Fleet Utilisation Horizon Curve
            </span>
            <span className="text-[9px] text-command-muted">TIME SERIES</span>
          </div>
          <ScenarioUtilisationChart series={series} />
        </div>
      </div>

      {/* 6. Unmet Missions List (if any) */}
      {unmetMissions && unmetMissions.length > 0 && (
        <div className="p-3 bg-command-panel border border-command-border rounded-[2px] space-y-2">
          <div className="flex items-center justify-between border-b border-command-border/70 pb-1.5">
            <div className="flex items-center gap-1.5 text-command-critical font-bold text-xs uppercase">
              <Flame className="w-3.5 h-3.5" />
              <span>Unmet Sorties & Mission Cancellations ({unmetMissions.length})</span>
            </div>
            <span className="text-[10px] text-command-muted">ATO IMPACT ANALYSIS</span>
          </div>

          <div className="space-y-1.5">
            {unmetMissions.map((um, idx) => (
              <div
                key={idx}
                className="p-2 bg-command-bg border border-command-critical-border/50 rounded-[1px] flex items-start gap-2.5"
              >
                <span className="px-1.5 py-0.5 rounded-[1px] bg-command-critical-bg text-command-critical border border-command-critical-border text-[10px] font-bold">
                  {um.missionId}
                </span>
                <div className="space-y-0.5 flex-1">
                  <span className="text-command-heading font-bold text-xs">
                    Sortie Infeasible under Simulated Constraints
                  </span>
                  <p className="text-[11px] text-command-muted font-sans leading-relaxed">
                    {um.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
