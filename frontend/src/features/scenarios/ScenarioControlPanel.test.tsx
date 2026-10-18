import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScenarioControlPanel } from './ScenarioControlPanel';
import { useUiStore } from '@/store/uiStore';
import { useEntitiesStore } from '@/store/entitiesStore';
import { mockDataService } from '@/services/mockDataService';
import { dataService } from '@/services';

describe('ScenarioControlPanel (Stage 6: Event Injection & Demo Replay)', () => {
  beforeEach(async () => {
    // Reset stores and populate initial snapshot
    const snapshot = await mockDataService.getSnapshot();
    useEntitiesStore.getState().setSnapshot(snapshot);
    useUiStore.getState().setScenarioControlOpen(true);
    useUiStore.getState().clearImpact();
  });

  it('renders simulation controls panel when isScenarioControlOpen is true', () => {
    render(<ScenarioControlPanel />);

    expect(screen.getByText(/Simulation Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/STAGE 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Single Events/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo Scripts/i)).toBeInTheDocument();
    expect(screen.getByText(/Event History/i)).toBeInTheDocument();
  });

  it('allows switching between single event types and shows corresponding form fields', () => {
    render(<ScenarioControlPanel />);

    // Default is Threat Detected
    expect(screen.getByText(/Hostile Threat Contact Parameters/i)).toBeInTheDocument();
    expect(screen.getByText(/Click Map to Place/i)).toBeInTheDocument();

    // Click Aircraft AOG
    fireEvent.click(screen.getByText(/Aircraft AOG/i));
    expect(screen.getByText(/Airframe Grounding \/ Maintenance Fault/i)).toBeInTheDocument();
    expect(screen.getByText(/Select Airframe/i)).toBeInTheDocument();

    // Click Runway Closed
    fireEvent.click(screen.getByText(/Runway Closed/i));
    expect(screen.getByText(/Airbase Runway Closure \/ Cratering/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Airbase/i)).toBeInTheDocument();

    // Click Severe Weather
    fireEvent.click(screen.getByText(/Severe Weather/i));
    expect(screen.getByText(/Severe Weather Front Incursion/i)).toBeInTheDocument();

    // Click New Priority Sortie
    fireEvent.click(screen.getByText(/New Priority Sortie/i));
    expect(screen.getByText(/Urgent Preemptive Sortie Tasking/i)).toBeInTheDocument();

    // Click Crew Unavailable
    fireEvent.click(screen.getByText(/Crew Unavailable/i));
    expect(screen.getByText(/Aircrew Medical Hold/i)).toBeInTheDocument();
  });

  it('injects a single event into dataService and triggers impact & recommendation', async () => {
    const injectSpy = vi.spyOn(dataService, 'injectEvent');
    render(<ScenarioControlPanel />);

    const injectBtn = screen.getByRole('button', { name: /Disrupt Baseline & Retask/i });
    fireEvent.click(injectBtn);

    await waitFor(() => {
      expect(injectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'THREAT_DETECTED',
        }),
      );
    });

    injectSpy.mockRestore();
  });

  it('renders prebuilt demo scripts and executes SAM site scenario', async () => {
    const runDemoSpy = vi.spyOn(mockDataService, 'runDemoScript');
    render(<ScenarioControlPanel />);

    // Switch to Demo Scripts tab
    const scriptsTab = screen.getByRole('button', { name: /Demo Scripts/i });
    fireEvent.click(scriptsTab);

    expect(screen.getByText(/Prebuilt Retasking Demonstration Scripts/i)).toBeInTheDocument();
    expect(screen.getByText(/SAM Site on Route B \(M-04 Bypass\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Runway Closure \+ Aircraft AOG/i)).toBeInTheDocument();

    // Click Execute SAM Route B Scenario
    const samBtn = screen.getByRole('button', { name: /Execute SAM Route B Scenario/i });
    fireEvent.click(samBtn);

    await waitFor(() => {
      expect(runDemoSpy).toHaveBeenCalledWith('sam-route-b');
    });

    runDemoSpy.mockRestore();
  });

  it('executes runway closure + aircraft AOG compound scenario', async () => {
    const runDemoSpy = vi.spyOn(mockDataService, 'runDemoScript');
    render(<ScenarioControlPanel />);

    const scriptsTab = screen.getByRole('button', { name: /Demo Scripts/i });
    fireEvent.click(scriptsTab);

    const aogBtn = screen.getByRole('button', { name: /Execute Runway \+ AOG Contingency/i });
    fireEvent.click(aogBtn);

    await waitFor(() => {
      expect(runDemoSpy).toHaveBeenCalledWith('runway-closure-aog');
    });

    runDemoSpy.mockRestore();
  });

  it('supports custom JSON script replay', async () => {
    const injectSpy = vi.spyOn(dataService, 'injectEvent');
    render(<ScenarioControlPanel />);

    const scriptsTab = screen.getByRole('button', { name: /Demo Scripts/i });
    fireEvent.click(scriptsTab);

    const replayBtn = screen.getByRole('button', { name: /Replay Custom Script/i });
    fireEvent.click(replayBtn);

    await waitFor(() => {
      expect(injectSpy).toHaveBeenCalled();
    });

    injectSpy.mockRestore();
  });

  it('displays chronological event history in Event History tab', () => {
    render(<ScenarioControlPanel />);

    const historyTab = screen.getByRole('button', { name: /Event History/i });
    fireEvent.click(historyTab);

    expect(screen.getByText(/Audit Timeline/i)).toBeInTheDocument();
  });
});
