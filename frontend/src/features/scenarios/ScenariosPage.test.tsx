import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ScenariosPage } from './ScenariosPage';
import { mockDataService } from '@/services/mockDataService';
import { useEntitiesStore } from '@/store/entitiesStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useAuditStore } from '@/store/auditStore';
import { ScenarioParams } from '@/types';

describe('Stage 8: ScenariosPage (What-If Scenario Simulator & Simulation Safety)', () => {
  beforeEach(async () => {
    // Populate live stores with pristine baseline snapshot
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    if (snapshot.recommendations) {
      useRecommendationsStore.getState().setRecommendations(snapshot.recommendations);
    }
  });

  /* -------------------------------------------------------------------------
     1. SIMULATION SAFETY (Core Requirement)
     ------------------------------------------------------------------------- */
  it('proves a scenario run NEVER mutates live entities, stateVersion, recommendations, or audit log', async () => {
    const initialSnapshot = await mockDataService.getSnapshot();
    const initialMissions = { ...useEntitiesStore.getState().missions };
    const initialAircraft = { ...useEntitiesStore.getState().aircraft };
    const initialCrew = { ...useEntitiesStore.getState().crew };
    const initialBases = { ...useEntitiesStore.getState().bases };
    const initialRecommendations = { ...useRecommendationsStore.getState().recommendations };
    const initialAuditCount = useAuditStore.getState().entries.length;
    const initialVersion = initialSnapshot.stateVersion;

    // Run severe degradation scenario: lose 3 aircraft, 12h base outage, 40% crew reduction
    const severeParams: ScenarioParams = {
      name: 'Severe Contingency Stress Test',
      aircraftLoss: [{ type: 'Strike-B', baseId: 'BASE-B', count: 3 }],
      baseOutage: { baseId: 'BASE-B', hours: 12 },
      crewAvailabilityReductionPct: 40,
      weatherSeverity: 'severe',
      surgeMissions: 4,
      threatLevel: 'critical',
    };

    const result = await mockDataService.runScenario(severeParams);

    // Verify scenario resulted in degraded KPIs
    expect(result.scenarioKpis.missionsFulfilledPct).toBeLessThan(result.baselineKpis.missionsFulfilledPct);
    expect(result.scenarioKpis.avgDelayMin).toBeGreaterThan(result.baselineKpis.avgDelayMin);
    expect(result.unmetMissions.length).toBeGreaterThan(0);
    expect(result.firstFailure).toBeDefined();

    // Verify snapshot after scenario run
    const postSnapshot = await mockDataService.getSnapshot();

    // 1. Live stateVersion must be unchanged
    expect(postSnapshot.stateVersion).toBe(initialVersion);

    // 2. Live entities in store must be 100% identical
    expect(useEntitiesStore.getState().missions).toEqual(initialMissions);
    expect(useEntitiesStore.getState().aircraft).toEqual(initialAircraft);
    expect(useEntitiesStore.getState().crew).toEqual(initialCrew);
    expect(useEntitiesStore.getState().bases).toEqual(initialBases);

    // 3. Live recommendations and audit log must be unchanged
    expect(useRecommendationsStore.getState().recommendations).toEqual(initialRecommendations);
    expect(useAuditStore.getState().entries.length).toBe(initialAuditCount);
  });

  /* -------------------------------------------------------------------------
     2. DETERMINISTIC CALCULATION INVARIANTS
     ------------------------------------------------------------------------- */
  it('guarantees zero changes equals baseline with zero unmet missions and no failure', async () => {
    const zeroParams: ScenarioParams = {
      name: 'Zero Changes Baseline Test',
      aircraftLoss: [],
      crewAvailabilityReductionPct: 0,
      weatherSeverity: 'nominal',
      surgeMissions: 0,
      threatLevel: 'low',
    };

    const result = await mockDataService.runScenario(zeroParams);

    // Scenario KPIs must exactly match Baseline KPIs
    expect(result.scenarioKpis.missionsFulfilledPct).toBe(result.baselineKpis.missionsFulfilledPct);
    expect(result.scenarioKpis.p1CoveragePct).toBe(result.baselineKpis.p1CoveragePct);
    expect(result.scenarioKpis.avgDelayMin).toBe(result.baselineKpis.avgDelayMin);
    expect(result.scenarioKpis.aircraftUtilisationPct).toBe(result.baselineKpis.aircraftUtilisationPct);

    // No failures or unmet missions
    expect(result.unmetMissions).toHaveLength(0);
    expect(result.firstFailure).toBeNull();
  });

  it('guarantees more losses never improve coverage', async () => {
    const mildParams: ScenarioParams = {
      name: '1 Hull Loss',
      aircraftLoss: [{ type: 'Strike-B', baseId: 'BASE-B', count: 1 }],
    };
    const severeParams: ScenarioParams = {
      name: '3 Hulls Loss',
      aircraftLoss: [{ type: 'Strike-B', baseId: 'BASE-B', count: 3 }],
    };

    const mildResult = await mockDataService.runScenario(mildParams);
    const severeResult = await mockDataService.runScenario(severeParams);

    expect(severeResult.scenarioKpis.missionsFulfilledPct).toBeLessThanOrEqual(
      mildResult.scenarioKpis.missionsFulfilledPct,
    );
    expect(severeResult.scenarioKpis.avgDelayMin).toBeGreaterThanOrEqual(
      mildResult.scenarioKpis.avgDelayMin,
    );
  });

  /* -------------------------------------------------------------------------
     3. UI RENDERING & PERSISTENT SIMULATION BANNER
     ------------------------------------------------------------------------- */
  it('renders page header with code SCN-SIM-08 and persistent SIMULATION warning banner', async () => {
    await act(async () => {
      render(<ScenariosPage />);
    });

    // Header & code badge
    expect(screen.getByText('SCN-SIM-08')).toBeInTheDocument();
    expect(screen.getByText('What-If Scenario Simulator')).toBeInTheDocument();

    // Persistent safety banner
    expect(
      screen.getByText(/SIMULATION - NOT LIVE OPERATIONS \/\/ SANDBOX ENVIRONMENT/i),
    ).toBeInTheDocument();

    // Distinct border/badge
    expect(screen.getByText('SECURE SANDBOX')).toBeInTheDocument();
  });

  it('renders side-by-side Baseline vs Scenario KPI cards and failure highlights', async () => {
    await act(async () => {
      render(<ScenariosPage />);
    });

    expect(screen.getByText('Missions Fulfilled')).toBeInTheDocument();
    expect(screen.getByText('Priority 1 Coverage')).toBeInTheDocument();
    expect(screen.getByText('Average Sortie Delay')).toBeInTheDocument();
    expect(screen.getByText('Fleet Utilisation')).toBeInTheDocument();

    // Baseline indicators
    expect(screen.getAllByText(/Base:/i).length).toBeGreaterThan(0);
  });

  it('renders ECharts charts containers for KPI grouped bars and utilisation time horizon', async () => {
    await act(async () => {
      render(<ScenariosPage />);
    });

    const chartContainers = screen.getAllByTestId('echarts-for-react');
    expect(chartContainers.length).toBeGreaterThanOrEqual(2);
  });

  it('allows applying preset configurations and running new scenarios', async () => {
    const runSpy = vi.spyOn(mockDataService, 'runScenario');
    await act(async () => {
      render(<ScenariosPage />);
    });

    // Click "BASE-B Closure + AOG" preset
    const presetBtn = screen.getByRole('button', { name: /BASE-B Closure \+ AOG/i });
    fireEvent.click(presetBtn);

    // Click "RUN SCENARIO SIMULATION"
    const runBtn = screen.getByRole('button', { name: /RUN SCENARIO SIMULATION/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseOutage: expect.objectContaining({ baseId: 'BASE-B', hours: 6 }),
          aircraftLoss: expect.arrayContaining([
            expect.objectContaining({ count: 1 }),
          ]),
        }),
      );
    });
  });

  it('opens cross-scenario comparison modal when clicking compare button', async () => {
    await act(async () => {
      render(<ScenariosPage />);
    });

    const compareBtn = screen.getByRole('button', { name: /Compare Scenario Runs/i });
    fireEvent.click(compareBtn);

    expect(
      screen.getByText(/CROSS-SCENARIO WHAT-IF COMPARATIVE ANALYSIS/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Select Run A/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select Run B/i)).toBeInTheDocument();
  });
});
