import { create } from 'zustand';
import { OperationalAlert, AlertSeverity, AlertType } from '@/types';

export interface AlertsStoreState {
  alerts: OperationalAlert[];
  isDrawerOpen: boolean;
  selectedSeverityFilter: AlertSeverity | 'all';
  selectedTypeFilter: AlertType | 'all';
  isAudioMuted: boolean;

  // Actions
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: (open?: boolean) => void;
  setSeverityFilter: (severity: AlertSeverity | 'all') => void;
  setTypeFilter: (type: AlertType | 'all') => void;
  setAudioMuted: (muted: boolean) => void;
  toggleAudioMute: () => void;

  addAlert: (
    alertInput: Omit<OperationalAlert, 'id' | 'acknowledged'> & {
      id?: string;
      acknowledged?: boolean;
    },
  ) => void;
  acknowledgeAlert: (id: string) => void;
  acknowledgeAll: () => void;
  dismissAlert: (id: string) => void;
  clearAll: () => void;
  setAlerts: (alerts: OperationalAlert[]) => void;
}

let alertCounter = 1;

function playAlertChime() {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio('/sounds/alert.wav');
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Fallback: Web Audio synthesis if autoplay blocked or in test environment
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch {
        // Ignored
      }
    });
  } catch {
    // Ignored
  }
}

export const useAlertsStore = create<AlertsStoreState>((set, get) => ({
  alerts: [],
  isDrawerOpen: false,
  selectedSeverityFilter: 'all',
  selectedTypeFilter: 'all',
  isAudioMuted: true, // Muted by default per specification

  setDrawerOpen: (open) => set({ isDrawerOpen: open }),
  toggleDrawer: (open) =>
    set((state) => ({ isDrawerOpen: open !== undefined ? open : !state.isDrawerOpen })),

  setSeverityFilter: (severity) => set({ selectedSeverityFilter: severity }),
  setTypeFilter: (type) => set({ selectedTypeFilter: type }),

  setAudioMuted: (muted) => set({ isAudioMuted: muted }),
  toggleAudioMute: () => set((state) => ({ isAudioMuted: !state.isAudioMuted })),

  addAlert: (alertInput) => {
    const id = alertInput.id || `ALT-${String(alertCounter++).padStart(4, '0')}`;
    const newAlert: OperationalAlert = {
      id,
      title: alertInput.title,
      message: alertInput.message || alertInput.details || alertInput.title,
      details: alertInput.details || alertInput.message || alertInput.title,
      severity: alertInput.severity,
      type: alertInput.type,
      category: alertInput.category || alertInput.type.toUpperCase(),
      timestamp: alertInput.timestamp || new Date().toISOString(),
      acknowledged: alertInput.acknowledged ?? false,
      entityId: alertInput.entityId,
      location: alertInput.location,
    };

    set((state) => {
      // Prevent exact ID duplicate
      const filtered = state.alerts.filter((a) => a.id !== id);
      return {
        alerts: [newAlert, ...filtered].slice(0, 100),
      };
    });

    if (!get().isAudioMuted) {
      playAlertChime();
    }
  },

  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    })),

  acknowledgeAll: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, acknowledged: true })),
    })),

  dismissAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),

  clearAll: () => set({ alerts: [] }),

  setAlerts: (alerts) => set({ alerts }),
}));
