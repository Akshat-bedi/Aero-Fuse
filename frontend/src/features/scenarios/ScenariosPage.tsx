import React, { useState, useEffect } from 'react';
import { ScenarioParams, ScenarioResult } from '@/types';
import { dataService } from '@/services';
import { DEFAULT_SAVED_SCENARIOS } from '@/services/mockDataService';
import { useUiStore } from '@/store/uiStore';
import { ScenarioBuilder } from './ScenarioBuilder';
import { ScenarioResultsView } from './ScenarioResultsView';
import { ScenarioCompareModal } from './ScenarioCompareModal';
import { Stat, EmptyState } from '@/components/ui';
import { formatTimeZulu } from '@/lib/utils';
import {
  Clock,
  GitCompare,
  History,
  FlaskConical,
  AlertTriangle,
} from 'lucide-react';

export const ScenariosPage: React.FC = () => {
  const { addToast } = useUiStore();

  const [savedScenarios, setSavedScenarios] = useState<ScenarioResult[]>(DEFAULT_SAVED_SCENARIOS);
  const [activeResult, setActiveResult] = useState<ScenarioResult | null>(
    DEFAULT_SAVED_SCENARIOS[0] ?? null,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  // Load saved scenarios on mount
  useEffect(() => {
    dataService.getScenarios?.().then((runs) => {
      if (runs && runs.length > 0) {
        setSavedScenarios(runs);
        setActiveResult((current) => current ?? runs[0]);
      }
    }).catch(() => {});
  }, []);

  const handleRunScenario = async (params: ScenarioParams) => {
    setIsRunning(true);
    try {
      const res = await dataService.runScenario(params);
      setActiveResult(res);
      setSavedScenarios((prev) => [res, ...prev.filter((s) => s.id !== res.id)]);
      addToast({
        type: 'nominal',
        title: 'Simulation Complete',
        message: `What-if projection ${res.id} computed without mutating live operational baseline.`,
      });
    } catch {
      addToast({
        type: 'critical',
        title: 'Simulation Error',
        message: 'Could not complete scenario projection.',
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-command-bg font-sans border-2 border-dashed border-amber-600/70">
      {/* 0. Mandatory Simulation Safety Warning Banner */}
      <div className="p-3 bg-command-warning-bg/40 border-b-2 border-dashed border-amber-600/70 flex items-center justify-between text-command-warning shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-command-warning" />
          <div className="space-y-0.5">
            <span className="font-bold text-xs tracking-wider">
              SIMULATION - NOT LIVE OPERATIONS // SANDBOX ENVIRONMENT
            </span>
            <p className="text-[10px] text-amber-200/90 font-sans">
              Hypothetical what-if projection. Live ATO schedules, real aircraft states, and command recommendations remain untouched.
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-[1px] bg-command-bg border border-amber-600/60 shrink-0">
          SECURE SANDBOX
        </span>
      </div>

      {/* 1. Page Header */}
      <div className="p-4 sm:p-5 pb-3 border-b border-command-border/80 bg-command-panel/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-command-muted uppercase">
              <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border text-command-primary font-bold">
                SCN-SIM-08
              </span>
              <span>CONTINGENCY MODELING & SANDBOX</span>
              <span>•</span>
              <span className="text-command-warning font-bold">OFFLINE SIMULATION</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-command-heading tracking-wide mt-1">
              What-If Scenario Simulator
            </h1>
            <p className="text-xs text-command-muted font-sans mt-0.5 max-w-2xl">
              Model asset attrition, base outages, frontal weather, and sortie surges to extrapolate failure thresholds and resilience margins without touching live flight operations.
            </p>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {savedScenarios.length >= 2 && (
              <button
                type="button"
                onClick={() => setIsCompareOpen(true)}
                className="px-3 py-1.5 bg-command-bg border border-command-border rounded-[1px] text-command-text hover:border-command-primary hover:text-command-primary flex items-center gap-1.5 transition-none"
              >
                <GitCompare className="w-3.5 h-3.5 text-command-primary" />
                <span>Compare Scenario Runs ({savedScenarios.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Metrics Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <Stat
            label="Simulated Runs"
            value={savedScenarios.length.toString()}
            unit="models"
            trend="Isolated sandbox snapshots"
          />
          <Stat
            label="Live Store Safety"
            value="100%"
            unit="isolated"
            trend="Live ATO unmutated"
          />
          <Stat
            label="Mean Fulfillment Delta"
            value={
              activeResult
                ? `${Math.round(
                    activeResult.scenarioKpis.missionsFulfilledPct -
                      activeResult.baselineKpis.missionsFulfilledPct,
                  )}%`
                : '0%'
            }
            unit="variance"
            trend="Active run delta"
          />
          <Stat
            label="Solver Execution"
            value="Deterministic"
            unit="linear"
            trend="Scales with losses"
          />
        </div>
      </div>

      {/* 3. Main Stage: Builder + Saved Runs Left, Results View Right */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Left Column: Builder & Run Selector */}
        <div className="w-full lg:w-96 flex flex-col gap-3.5 shrink-0">
          {/* Parameter Builder */}
          <ScenarioBuilder onRunScenario={handleRunScenario} isRunning={isRunning} />

          {/* Saved Runs History */}
          <div className="p-3 bg-command-panel border border-command-border rounded-[2px] font-mono text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-command-border/60 pb-1.5">
              <span className="text-[10px] uppercase font-bold text-command-muted flex items-center gap-1.5">
                <History className="w-3 h-3 text-command-primary" />
                <span>Saved Simulation Runs ({savedScenarios.length})</span>
              </span>
              <span className="text-[9px] text-command-subdued">PERSISTED RUNS</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {savedScenarios.map((scen) => {
                const isSelected = activeResult?.id === scen.id;
                return (
                  <div
                    key={scen.id}
                    onClick={() => setActiveResult(scen)}
                    className={`p-2 rounded-[1px] border cursor-pointer select-none transition-none ${
                      isSelected
                        ? 'border-command-primary bg-command-raised text-command-text'
                        : 'border-command-border bg-command-bg text-command-muted hover:text-command-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-command-primary text-[11px]">{scen.id}</span>
                      <span className="text-[10px] tabular-nums font-bold text-command-heading">
                        {scen.scenarioKpis.missionsFulfilledPct}% Cov
                      </span>
                    </div>
                    <div className="text-[11px] text-command-heading truncate mt-0.5" title={scen.name}>
                      {scen.name}
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-command-muted mt-1 pt-1 border-t border-command-border/40">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatTimeZulu(scen.createdAt)}</span>
                      </span>
                      <span>Delay: +{scen.scenarioKpis.avgDelayMin}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Scenario Results Display */}
        <div className="flex-1 min-w-0">
          {activeResult ? (
            <ScenarioResultsView
              result={activeResult}
              onCompareWithAnother={
                savedScenarios.length >= 2 ? () => setIsCompareOpen(true) : undefined
              }
            />
          ) : (
            <div className="h-full flex items-center justify-center p-8 bg-command-panel border-2 border-dashed border-amber-600/70 rounded-[2px]">
              <EmptyState
                icon={<FlaskConical className="w-8 h-8 text-command-warning" />}
                title="Simulation Sandbox Ready"
                description="Configure what-if stress parameters in the builder to simulate asset attrition, runway outages, and weather impacts."
              />
            </div>
          )}
        </div>
      </div>

      {/* Cross-Scenario Compare Modal */}
      {isCompareOpen && activeResult && (
        <ScenarioCompareModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          savedScenarios={savedScenarios}
          activeScenario={activeResult}
        />
      )}
    </div>
  );
};
