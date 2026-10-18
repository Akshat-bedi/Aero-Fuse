import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDemoStore } from './demoStore';
import { useUiStore } from './uiStore';
import { useAlertsStore } from './alertsStore';
import { useRecommendationsStore } from './recommendationsStore';
import { mockDataService } from '@/services/mockDataService';

describe('Stage 9, Part B: Demo Mode & Step State Machine', () => {
  const mockNavigate = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    useDemoStore.getState().stopDemo();
    await useDemoStore.getState().resetToInitialState(mockNavigate);
  });

  it('initializes with inactive state, 9 defined steps, and step 0', () => {
    const state = useDemoStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.isPaused).toBe(false);
    expect(state.currentStepIndex).toBe(0);
    expect(state.steps).toHaveLength(9);
    expect(state.steps[0].id).toBe('normal-day');
    expect(state.steps[8].id).toBe('summary-debrief');
  });

  it('starts demo at step 0, activates state, and navigates to COP', async () => {
    await useDemoStore.getState().startDemo(mockNavigate);

    const state = useDemoStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.isPaused).toBe(false);
    expect(state.currentStepIndex).toBe(0);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('advances through steps with nextStep and triggers step onEnter actions', async () => {
    await useDemoStore.getState().startDemo(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(0);

    // Advance to Step 2: SAM Threat Injection
    await useDemoStore.getState().nextStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
    expect(useDemoStore.getState().steps[1].id).toBe('sam-injection');

    // Advance to Step 3: Conflict & Impact Analysis
    await useDemoStore.getState().nextStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(2);
    expect(useDemoStore.getState().steps[2].id).toBe('impact-analysis');
    expect(useUiStore.getState().activeImpact).toBeDefined();
    expect(useUiStore.getState().activeImpact?.impactedMissionIds).toContain('M-04');

    // Advance to Step 4: Retasking Engine Progress
    await useDemoStore.getState().nextStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(3);
    expect(useDemoStore.getState().steps[3].id).toBe('replan-progress');

    // Advance to Step 5: Recommendations
    await useDemoStore.getState().nextStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(4);
    expect(mockNavigate).toHaveBeenCalledWith('/recommendations');
  });

  it('allows moving back to previous step with prevStep', async () => {
    await useDemoStore.getState().startDemo(mockNavigate);
    await useDemoStore.getState().nextStep(mockNavigate);
    await useDemoStore.getState().nextStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(2);

    // Step back
    await useDemoStore.getState().prevStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(1);

    await useDemoStore.getState().prevStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(0);

    // Should not go below 0
    await useDemoStore.getState().prevStep(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(0);
  });

  it('pauses and resumes walkthrough timer', () => {
    expect(useDemoStore.getState().isPaused).toBe(false);

    useDemoStore.getState().togglePause();
    expect(useDemoStore.getState().isPaused).toBe(true);

    useDemoStore.getState().togglePause();
    expect(useDemoStore.getState().isPaused).toBe(false);

    useDemoStore.getState().setPaused(true);
    expect(useDemoStore.getState().isPaused).toBe(true);
  });

  it('exits demo mode via stopDemo', async () => {
    await useDemoStore.getState().startDemo(mockNavigate);
    expect(useDemoStore.getState().isActive).toBe(true);

    useDemoStore.getState().stopDemo();
    expect(useDemoStore.getState().isActive).toBe(false);
  });

  it('auto-advances when tickTimer reaches 1 second', async () => {
    await useDemoStore.getState().startDemo(mockNavigate);
    expect(useDemoStore.getState().currentStepIndex).toBe(0);

    // Set time remaining to 1
    useDemoStore.setState({ timeRemainingSec: 1 });
    useDemoStore.getState().tickTimer(mockNavigate);

    // Should have advanced to step 1
    expect(useDemoStore.getState().currentStepIndex).toBe(1);
  });

  it('resetToInitialState restores clean baseline, clears alerts, recommendations and transient state', async () => {
    // 1. Dirty the state
    useAlertsStore.getState().setAlerts([
      {
        id: 'ALT-DIRTY',
        title: 'Dirty Alert',
        message: 'Dirty Alert',
        severity: 'critical',
        type: 'threat',
        timestamp: new Date().toISOString(),
        acknowledged: false,
      },
    ]);
    useRecommendationsStore.getState().setRecommendations({
      'REC-DIRTY': {
        id: 'REC-DIRTY',
        triggerEventId: 'EV-0001',
        summary: 'Dirty Rec',
        score: 90,
        changes: [],
        impactedMissionIds: [],
        tradeoffs: [],
        explanation: [],
        constraintsSatisfied: [],
        constraintsRelaxed: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        stateVersion: 99,
        confidence: 0.8,
        dataFreshnessSec: 5,
      },
    });
    useUiStore.getState().setImpact({
      eventId: 'EV-DIRTY',
      eventType: 'THREAT_DETECTED',
      impactedMissionIds: ['M-04'],
      reasons: ['Route B intersects active threat envelope'],
      timeToDecisionMin: 12,
    });

    expect(useAlertsStore.getState().alerts).toHaveLength(1);
    expect(Object.keys(useRecommendationsStore.getState().recommendations)).toHaveLength(1);
    expect(useUiStore.getState().activeImpact).not.toBeNull();

    // 2. Execute Reset
    await useDemoStore.getState().resetToInitialState(mockNavigate);

    // 3. Verify clean baseline
    expect(useDemoStore.getState().isActive).toBe(false);
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
    expect(Object.keys(useRecommendationsStore.getState().recommendations)).toHaveLength(0);
    expect(useUiStore.getState().activeImpact).toBeNull();
    expect(useUiStore.getState().retaskProgress).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/');

    // 4. Verify mock baseline has all 10 missions and 0 conflicts
    const snapshot = await mockDataService.getSnapshot();
    expect(Object.keys(snapshot.missions).length).toBeGreaterThanOrEqual(10);
    const atRiskMissions = Object.values(snapshot.missions).filter((m) => m.status === 'at-risk');
    expect(atRiskMissions).toHaveLength(0);
  });
});
