import React, { useState } from 'react';
import { ScenarioResult } from '@/types';
import { Modal } from '@/components/ui/Modal';

interface ScenarioCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedScenarios: ScenarioResult[];
  activeScenario: ScenarioResult;
}

export const ScenarioCompareModal: React.FC<ScenarioCompareModalProps> = ({
  isOpen,
  onClose,
  savedScenarios,
  activeScenario,
}) => {
  const [selectedRunIdA, setSelectedRunIdA] = useState<string>(activeScenario.id);
  const [selectedRunIdB, setSelectedRunIdB] = useState<string>(
    savedScenarios.find((s) => s.id !== activeScenario.id)?.id || activeScenario.id,
  );

  const runA = savedScenarios.find((s) => s.id === selectedRunIdA) || activeScenario;
  const runB = savedScenarios.find((s) => s.id === selectedRunIdB) || activeScenario;

  const compareRows = [
    {
      label: 'Missions Fulfilled',
      unit: '%',
      valA: runA.scenarioKpis.missionsFulfilledPct,
      valB: runB.scenarioKpis.missionsFulfilledPct,
      higherIsBetter: true,
    },
    {
      label: 'P1 Sortie Coverage',
      unit: '%',
      valA: runA.scenarioKpis.p1CoveragePct,
      valB: runB.scenarioKpis.p1CoveragePct,
      higherIsBetter: true,
    },
    {
      label: 'Average Sortie Delay',
      unit: 'min',
      valA: runA.scenarioKpis.avgDelayMin,
      valB: runB.scenarioKpis.avgDelayMin,
      higherIsBetter: false,
    },
    {
      label: 'Fleet Utilisation',
      unit: '%',
      valA: runA.scenarioKpis.aircraftUtilisationPct,
      valB: runB.scenarioKpis.aircraftUtilisationPct,
      higherIsBetter: false,
    },
    {
      label: 'Mean Crew Fatigue',
      unit: 'pts',
      valA: runA.scenarioKpis.crewFatigueMean,
      valB: runB.scenarioKpis.crewFatigueMean,
      higherIsBetter: false,
    },
    {
      label: 'Fuel Consumption',
      unit: '%',
      valA: runA.scenarioKpis.fuelConsumptionPct,
      valB: runB.scenarioKpis.fuelConsumptionPct,
      higherIsBetter: false,
    },
    {
      label: 'Weapons Consumption',
      unit: '%',
      valA: runA.scenarioKpis.weaponsConsumptionPct,
      valB: runB.scenarioKpis.weaponsConsumptionPct,
      higherIsBetter: false,
    },
    {
      label: 'Unmet Sorties',
      unit: 'sorties',
      valA: runA.unmetMissions.length,
      valB: runB.unmetMissions.length,
      higherIsBetter: false,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="CROSS-SCENARIO WHAT-IF COMPARATIVE ANALYSIS"
      subtitle="EVALUATE RELATIVE MISSION IMPACT ACROSS PERTURBATION RUNS"
      size="lg"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 bg-command-bg border border-command-border rounded-[1px] text-xs font-mono text-command-muted hover:text-command-text"
        >
          CLOSE COMPARISON
        </button>
      }
    >
      <div className="space-y-4 font-mono text-xs">
        {/* Selection Pickers */}
        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-command-border">
          <div className="space-y-1">
            <label className="text-[10px] text-command-primary uppercase font-bold">
              Run A (Reference):
            </label>
            <select
              aria-label="Select Run A"
              value={selectedRunIdA}
              onChange={(e) => setSelectedRunIdA(e.target.value)}
              className="w-full bg-command-bg border border-command-border px-2 py-1 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
            >
              {savedScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}: {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-command-secondary uppercase font-bold">
              Run B (Comparison):
            </label>
            <select
              aria-label="Select Run B"
              value={selectedRunIdB}
              onChange={(e) => setSelectedRunIdB(e.target.value)}
              className="w-full bg-command-bg border border-command-border px-2 py-1 rounded-[1px] text-command-text focus:outline-none focus:border-command-primary text-xs"
            >
              {savedScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}: {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="border border-command-border rounded-[1px] overflow-hidden">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="bg-command-raised border-b border-command-border text-[10px] text-command-muted uppercase">
                <th className="py-2 px-3">Metric</th>
                <th className="py-2 px-3 text-command-primary">Run A: {runA.id}</th>
                <th className="py-2 px-3 text-command-secondary">Run B: {runB.id}</th>
                <th className="py-2 px-3">Delta (B vs A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-command-border/40">
              {compareRows.map((r, i) => {
                const diff = Math.round((r.valB - r.valA) * 10) / 10;
                const isBetter = r.higherIsBetter ? diff > 0 : diff < 0;
                const isNeutral = diff === 0;

                return (
                  <tr key={i} className="hover:bg-command-raised/30">
                    <td className="py-2 px-3 text-command-text font-medium">{r.label}</td>
                    <td className="py-2 px-3 text-command-heading font-bold tabular-nums">
                      {r.valA} {r.unit}
                    </td>
                    <td className="py-2 px-3 text-command-heading font-bold tabular-nums">
                      {r.valB} {r.unit}
                    </td>
                    <td className="py-2 px-3 tabular-nums text-[11px]">
                      {isNeutral ? (
                        <span className="text-command-muted">0.0 (Identical)</span>
                      ) : (
                        <span
                          className={`font-bold flex items-center gap-0.5 ${
                            isBetter ? 'text-command-nominal' : 'text-command-critical'
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff} {r.unit}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};
