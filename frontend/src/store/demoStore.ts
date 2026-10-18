import { create } from 'zustand';
import { dataService } from '@/services';
import { useUiStore } from './uiStore';
import { useAlertsStore } from './alertsStore';
import { useRecommendationsStore } from './recommendationsStore';
import { useEventsStore } from './eventsStore';
import { serviceConfig } from '@/services/config';

export interface DemoStep {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  route: string;
  narration: string[];
  targetHighlightId?: string;
  durationSec: number;
  onEnter?: (navigate: (to: string) => void) => Promise<void> | void;
}

export interface DemoState {
  isActive: boolean;
  isPaused: boolean;
  currentStepIndex: number;
  timeRemainingSec: number;
  steps: DemoStep[];

  // Actions
  startDemo: (navigate: (to: string) => void) => Promise<void>;
  stopDemo: () => void;
  nextStep: (navigate: (to: string) => void) => Promise<void>;
  prevStep: (navigate: (to: string) => void) => Promise<void>;
  setStep: (index: number, navigate: (to: string) => void) => Promise<void>;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  tickTimer: (navigate: (to: string) => void) => void;
  resetToInitialState: (navigate?: (to: string) => void) => Promise<void>;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    id: 'normal-day',
    stepNumber: 1,
    title: 'Baseline Operations // All Green',
    subtitle: 'Standard Operations Day Baseline',
    route: '/',
    narration: [
      'Normal operational baseline across Republic of Veridia: sorties M-01 to M-10 planned and on-track.',
      'Zero conflicts detected. Air bases Alpha through Delta report serviceable runways and nominal status.',
    ],
    durationSec: 18,
    onEnter: async (navigate) => {
      navigate('/');
      useUiStore.getState().clearImpact();
      useUiStore.getState().setRetaskProgress(null);
      useUiStore.getState().setMapPlanView('before');
    },
  },
  {
    id: 'sam-injection',
    stepNumber: 2,
    title: 'Threat Detected // SAM Pop-Up',
    subtitle: 'Tactical Contingency Injection',
    route: '/',
    narration: [
      'SIGINT and radar intercept: SA-11 SAM battery (THR-02) confirmed active at 4.80°N, 7.50°E.',
      'Threat engagement envelope intersects Strike sortie M-04 along primary ingress Route B.',
    ],
    durationSec: 20,
    onEnter: async (navigate) => {
      navigate('/');
      if (serviceConfig.isMock) {
        await dataService.runDemoScript?.('sam-route-b');
      } else {
        await dataService.runDemoScript?.('sam-route-b');
      }
      useUiStore.getState().selectMission('M-04');
    },
  },
  {
    id: 'impact-analysis',
    stepNumber: 3,
    title: 'Conflict Detected // Sortie M-04 At-Risk',
    subtitle: 'Automated Impact & Corridor Analysis',
    route: '/',
    narration: [
      'Automated conflict detection tags Sortie M-04 AT-RISK with high attrition probability.',
      'Cross-module impact highlighting engages: map corridor, board column, and timeline sync.',
    ],
    durationSec: 18,
    onEnter: async (navigate) => {
      navigate('/');
      useUiStore.getState().setImpact({
        eventId: 'EV-0015',
        eventType: 'THREAT_DETECTED',
        impactedMissionIds: ['M-04'],
        reasons: ['Route B intersects active SAM radar envelope (THR-02). Attrition risk critical.'],
        timeToDecisionMin: 12,
      });
      useUiStore.getState().selectMission('M-04');
    },
  },
  {
    id: 'replan-progress',
    stepNumber: 4,
    title: 'Retasking Engine // 4-Stage Optimization',
    subtitle: 'Fusing -> Constraints -> Optimising -> Ranking',
    route: '/',
    narration: [
      'Tactical Retask Engine initiates AI replanning: Sensor fusion -> Constraints -> Route optimization.',
      'Evaluating alternatives: Route A (altitude limit), Route B (threat zone), Route C (southern bypass).',
    ],
    durationSec: 20,
    onEnter: async (navigate) => {
      navigate('/');
      const stages: Array<'fusing' | 'constraints' | 'optimising' | 'ranking' | 'ready'> = [
        'fusing',
        'constraints',
        'optimising',
        'ranking',
        'ready',
      ];
      for (let i = 0; i < stages.length; i++) {
        setTimeout(() => {
          useUiStore.getState().setRetaskProgress({
            isReplanActive: i < stages.length - 1,
            stage: stages[i],
            elapsedMs: (i + 1) * 700,
            message:
              stages[i] === 'fusing'
                ? 'Fusing telemetry & threat coordinates...'
                : stages[i] === 'constraints'
                ? 'Validating range, fuel, crew duty & weapon load...'
                : stages[i] === 'optimising'
                ? 'Evaluating route doglegs and alternate airframes...'
                : stages[i] === 'ranking'
                ? 'Ranking Pareto trade-offs & confidence scores...'
                : 'Optimal retask plan computed: REC-0001',
          });
        }, i * 700);
      }
    },
  },
  {
    id: 'recommendation-diff',
    stepNumber: 5,
    title: 'Recommendation // Before vs After View',
    subtitle: 'Plan REC-0001: Reroute + Airframe Swap',
    route: '/recommendations',
    narration: [
      'DSS proposes REC-0001: Reroute M-04 via Route C (dogleg) and swap AC-07 for fresh AC-11 at BASE-B.',
      'Examine the BEFORE/AFTER comparison: threat exposure reduced 92% with only +12 min delay.',
    ],
    durationSec: 22,
    onEnter: async (navigate) => {
      navigate('/recommendations');
      useUiStore.getState().setMapPlanView('after');
    },
  },
  {
    id: 'approve-recommendation',
    stepNumber: 6,
    title: 'Commander Approval // Atomic Plan Commit',
    subtitle: 'Commander Decision Support in Action',
    route: '/recommendations',
    narration: [
      'Commander approves recommendation REC-0001. All plan changes are applied atomically.',
      'Mission M-04 shifts from AT-RISK back to NOMINAL; aircraft assignments update across the fleet.',
    ],
    durationSec: 18,
    onEnter: async (navigate) => {
      navigate('/recommendations');
      const recs = await dataService.getRecommendations?.();
      const rec = recs?.find((r) => r.status === 'pending') || recs?.[0];
      if (rec) {
        await dataService.decideRecommendation(
          rec.id,
          'approve',
          undefined,
          'Commander approved retask proposal REC-0001 during guided demo walkthrough.',
          'COL. J. MERCER',
        );
      }
      useUiStore.getState().clearImpact();
      useUiStore.getState().setRetaskProgress(null);
    },
  },
  {
    id: 'audit-entry',
    stepNumber: 7,
    title: 'Audit Ledger // Cryptographic Hash Chain',
    subtitle: 'SHA-256 Tamper-Evident Accountability',
    route: '/audit-log',
    narration: [
      'Every commander retask decision is appended to an immutable SHA-256 hash-chained audit ledger.',
      'Real-time cryptographic verification confirms the chain is valid with 0 broken links.',
    ],
    durationSec: 20,
    onEnter: async (navigate) => {
      navigate('/audit-log');
    },
  },
  {
    id: 'what-if-scenario',
    stepNumber: 8,
    title: 'What-If Simulation // Contingency Modeling',
    subtitle: 'Safe Sandbox Isolated from Live COP',
    route: '/scenarios',
    narration: [
      'Operator tests what-if resiliency: BASE-B cratering runway outage + 20% crew fatigue degradation.',
      'Simulation Safety rule: Live COP and pending recommendations are never mutated during simulation.',
    ],
    durationSec: 22,
    onEnter: async (navigate) => {
      navigate('/scenarios');
      await dataService.runScenario({
        name: 'Demo Contingency: BASE-B Outage + Severe Weather',
        aircraftLoss: [{ type: 'Strike-B', baseId: 'BASE-B', count: 1 }],
        baseOutage: { baseId: 'BASE-B', hours: 8 },
        crewAvailabilityReductionPct: 20,
        weatherSeverity: 'severe',
        horizonHours: 24,
      });
    },
  },
  {
    id: 'summary-debrief',
    stepNumber: 9,
    title: 'Operations Debrief // Demo Walkthrough Complete',
    subtitle: 'Decision Superiority Under 3 Minutes',
    route: '/',
    narration: [
      'Full mission cycle concluded: pop-up threat mitigated, sorties preserved, decisions audited.',
      'Press "Reset to initial state" at any time to return to the clean baseline, or rerun the demo.',
    ],
    durationSec: 20,
    onEnter: async (navigate) => {
      navigate('/');
    },
  },
];

export const useDemoStore = create<DemoState>((set, get) => ({
  isActive: false,
  isPaused: false,
  currentStepIndex: 0,
  timeRemainingSec: DEMO_STEPS[0].durationSec,
  steps: DEMO_STEPS,

  startDemo: async (navigate) => {
    // Start by resetting to clean state first
    await get().resetToInitialState(navigate);

    set({
      isActive: true,
      isPaused: false,
      currentStepIndex: 0,
      timeRemainingSec: DEMO_STEPS[0].durationSec,
    });

    const firstStep = DEMO_STEPS[0];
    if (firstStep.onEnter) {
      await firstStep.onEnter(navigate);
    }
  },

  stopDemo: () => {
    set({ isActive: false, isPaused: false });
  },

  nextStep: async (navigate) => {
    const { currentStepIndex, steps } = get();
    if (currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      const step = steps[nextIdx];
      set({
        currentStepIndex: nextIdx,
        timeRemainingSec: step.durationSec,
      });
      if (step.onEnter) {
        await step.onEnter(navigate);
      }
    } else {
      get().stopDemo();
    }
  },

  prevStep: async (navigate) => {
    const { currentStepIndex, steps } = get();
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      const step = steps[prevIdx];
      set({
        currentStepIndex: prevIdx,
        timeRemainingSec: step.durationSec,
      });
      if (step.onEnter) {
        await step.onEnter(navigate);
      }
    }
  },

  setStep: async (index, navigate) => {
    const { steps } = get();
    if (index >= 0 && index < steps.length) {
      const step = steps[index];
      set({
        currentStepIndex: index,
        timeRemainingSec: step.durationSec,
      });
      if (step.onEnter) {
        await step.onEnter(navigate);
      }
    }
  },

  togglePause: () => {
    set((state) => ({ isPaused: !state.isPaused }));
  },

  setPaused: (paused) => {
    set({ isPaused: paused });
  },

  tickTimer: (navigate) => {
    const { isActive, isPaused, timeRemainingSec } = get();
    if (!isActive || isPaused) return;

    if (timeRemainingSec <= 1) {
      get().nextStep(navigate);
    } else {
      set({ timeRemainingSec: timeRemainingSec - 1 });
    }
  },

  resetToInitialState: async (navigate) => {
    // 1. Terminate demo state
    set({ isActive: false, isPaused: false, currentStepIndex: 0, timeRemainingSec: DEMO_STEPS[0].durationSec });

    // 2. Control simulation reset (mock resets in-memory baseline; live calls POST /sim/control)
    await dataService.controlSimulation?.('reset');

    // 3. Clear transient UI stores
    useUiStore.getState().clearImpact();
    useUiStore.getState().setRetaskProgress(null);
    useUiStore.getState().setMapPlanView('before');
    useUiStore.getState().selectMission(null);
    useUiStore.getState().selectAircraft(null);
    useUiStore.getState().selectAirbase(null);
    useUiStore.getState().selectThreat(null);

    // 4. Reset alerts store
    useAlertsStore.getState().setAlerts([]);

    // 5. Reset recommendations and events
    useRecommendationsStore.getState().setRecommendations({});
    useEventsStore.getState().setEvents([]);

    // 6. Navigate to COP root
    if (navigate) {
      navigate('/');
    }

    // 7. Add notification toast
    useUiStore.getState().addToast({
      title: 'Simulation Reset',
      message: 'System restored to clean nominal baseline (M-01..M-10, zero conflicts).',
      type: 'info',
      durationMs: 3500,
    });
  },
}));
