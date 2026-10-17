import { create } from 'zustand';
import { OperationalAlert, ToastItem } from '@/types';
import { serviceConfig } from '@/services/config';

export interface UIState {
  isNightMode: boolean;
  toggleNightMode: () => void;
  setNightMode: (enabled: boolean) => void;

  isAlertsDrawerOpen: boolean;
  toggleAlertsDrawer: (open?: boolean) => void;

  connectionStatus: 'mock' | 'live' | 'disconnected';
  setConnectionStatus: (status: 'mock' | 'live' | 'disconnected') => void;

  selectedAirbaseId: string | null;
  selectedAircraftId: string | null;
  selectedMissionId: string | null;
  selectedThreatId: string | null;

  selectAirbase: (id: string | null) => void;
  selectAircraft: (id: string | null) => void;
  selectMission: (id: string | null) => void;
  selectThreat: (id: string | null) => void;

  alerts: OperationalAlert[];
  acknowledgeAlert: (id: string) => void;
  dismissAlert: (id: string) => void;

  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const INITIAL_ALERTS: OperationalAlert[] = [
  {
    id: 'alt-01',
    title: 'Aircraft Unserviceable: Hydraulic Advisory',
    severity: 'critical',
    timestamp: '1422Z',
    category: 'MAINTENANCE',
    location: 'Sector Alpha FOB (ALPH)',
    acknowledged: false,
    details: 'Fighter-A airframe VAPOR-12 flagged return for hydraulic pressure anomaly on Hardpoint 2.',
  },
  {
    id: 'alt-02',
    title: 'Weather Minima Exceeded',
    severity: 'warning',
    timestamp: '1410Z',
    category: 'WEATHER',
    location: 'North Bastion Airbase (BSTN)',
    acknowledged: false,
    details: 'Crosswind 28G36kts exceeding safe landing envelope for Transport-C airframes.',
  },
  {
    id: 'alt-03',
    title: 'Sector Buffer Track Detections',
    severity: 'warning',
    timestamp: '1355Z',
    category: 'THREAT',
    location: 'Sector North Buffer',
    acknowledged: false,
    details: 'Uncorrelated radar contact detected at FL240 heading 180 degrees at 420 knots.',
  },
  {
    id: 'alt-04',
    title: 'ATO Retasking Opportunity Available',
    severity: 'info',
    timestamp: '1340Z',
    category: 'AIRSPACE',
    location: 'Sector Alpha FOB',
    acknowledged: true,
    details: 'AI DSS generated retasking recommendation REC-901 for CAP reinforcement.',
  },
];

export const useUiStore = create<UIState>((set) => ({
  isNightMode: false,
  toggleNightMode: () =>
    set((state) => {
      const next = !state.isNightMode;
      if (typeof document !== 'undefined') {
        if (next) {
          document.documentElement.classList.add('night-mode');
        } else {
          document.documentElement.classList.remove('night-mode');
        }
      }
      return { isNightMode: next };
    }),
  setNightMode: (enabled: boolean) => {
    if (typeof document !== 'undefined') {
      if (enabled) {
        document.documentElement.classList.add('night-mode');
      } else {
        document.documentElement.classList.remove('night-mode');
      }
    }
    set({ isNightMode: enabled });
  },

  isAlertsDrawerOpen: false,
  toggleAlertsDrawer: (open) =>
    set((state) => ({
      isAlertsDrawerOpen: typeof open === 'boolean' ? open : !state.isAlertsDrawerOpen,
    })),

  connectionStatus: serviceConfig.isMock ? 'mock' : 'live',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  selectedAirbaseId: null,
  selectedAircraftId: null,
  selectedMissionId: null,
  selectedThreatId: null,

  selectAirbase: (id) => set({ selectedAirbaseId: id }),
  selectAircraft: (id) => set({ selectedAircraftId: id }),
  selectMission: (id) => set({ selectedMissionId: id }),
  selectThreat: (id) => set({ selectedThreatId: id }),

  alerts: INITIAL_ALERTS,
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    })),
  dismissAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
    })),

  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));

    const duration = toast.durationMs ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Backward compatibility alias for Stage 1 code
export const useOpsStore = useUiStore;
