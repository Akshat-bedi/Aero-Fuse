import { create } from 'zustand';
import {
  Base,
  Aircraft,
  Crew,
  Mission,
  Airspace,
  Threat,
  WeatherState,
  WeaponStock,
  Prediction,
  OperationalSnapshot,
  WireSnapshot,
} from '@/types';

interface EntitiesState {
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  missions: Record<string, Mission>;
  airspace: Record<string, Airspace>;
  threats: Record<string, Threat>;
  weather: Record<string, WeatherState>;
  weaponStocks: WeaponStock[];
  predictions: Prediction[];
  simTime: string;
  speedMultiplier: number;
  isLoading: boolean;
  lastUpdated: string | null;

  setSnapshot: (snapshot: OperationalSnapshot) => void;
  updateAircraft: (update: Partial<Aircraft> & { id: string }) => void;
  updateMission: (update: Partial<Mission> & { id: string }) => void;
  updateBase: (update: Partial<Base> & { id: string }) => void;

  // Selectors
  getBasesList: () => Base[];
  getAircraftList: () => Aircraft[];
  getCrewList: () => Crew[];
  getMissionsList: () => Mission[];
  getThreatsList: () => Threat[];
  getAirspaceList: () => Airspace[];
  getAirborneAircraft: () => Aircraft[];
  getActiveMissions: () => Mission[];
}

export const useEntitiesStore = create<EntitiesState>((set, get) => ({
  bases: {},
  aircraft: {},
  crew: {},
  missions: {},
  airspace: {},
  threats: {},
  weather: {},
  weaponStocks: [],
  predictions: [],
  simTime: new Date().toISOString(),
  speedMultiplier: 1,
  isLoading: true,
  lastUpdated: null,

  setSnapshot: (snapshot: OperationalSnapshot | WireSnapshot) => {
    if (!snapshot) return;

    if (Array.isArray(snapshot.bases)) {
      const wire = snapshot as WireSnapshot;
      const bases: Record<string, Base> = {};
      (wire.bases || []).forEach((b) => {
        bases[b.id] = b;
      });

      const aircraft: Record<string, Aircraft> = {};
      (wire.aircraft || []).forEach((a) => {
        aircraft[a.id] = a;
      });

      const crew: Record<string, Crew> = {};
      (wire.crew || []).forEach((c) => {
        crew[c.id] = c;
      });

      const missions: Record<string, Mission> = {};
      (wire.missions || []).forEach((m) => {
        missions[m.id] = m;
      });

      const airspace: Record<string, Airspace> = {};
      (wire.airspace || []).forEach((as) => {
        airspace[as.id] = as;
      });

      const threats: Record<string, Threat> = {};
      (wire.threats || []).forEach((t) => {
        threats[t.id] = t;
      });

      const weather: Record<string, WeatherState> = {};
      (wire.weather || []).forEach((w) => {
        const key = w.baseId || w.region || `weather-${Math.random()}`;
        weather[key] = w;
      });

      const simTime =
        wire.sim?.time || (wire as unknown as { simTime?: string }).simTime || new Date().toISOString();
      const speedMultiplier =
        wire.sim?.speed ?? (wire as unknown as { speedMultiplier?: number }).speedMultiplier ?? 1;

      set({
        bases,
        aircraft,
        crew,
        missions,
        airspace,
        threats,
        weather,
        weaponStocks: wire.weaponStocks || [],
        predictions: wire.predictions || [],
        simTime,
        speedMultiplier,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      });
      return;
    }

    const op = snapshot as OperationalSnapshot;
    set({
      bases: op.bases || {},
      aircraft: op.aircraft || {},
      crew: op.crew || {},
      missions: op.missions || {},
      airspace: op.airspace || {},
      threats: op.threats || {},
      weather: op.weather || {},
      weaponStocks: op.weaponStocks || [],
      predictions: op.predictions || [],
      simTime: op.sim?.time || op.simTime || new Date().toISOString(),
      speedMultiplier: op.sim?.speed ?? op.speedMultiplier ?? 1,
      isLoading: false,
      lastUpdated: new Date().toISOString(),
    });
  },

  updateAircraft: (update) =>
    set((state) => {
      const existing = state.aircraft[update.id];
      if (!existing) return state;
      return {
        aircraft: {
          ...state.aircraft,
          [update.id]: { ...existing, ...update },
        },
      };
    }),

  updateMission: (update) =>
    set((state) => {
      const existing = state.missions[update.id];
      if (!existing) return state;
      return {
        missions: {
          ...state.missions,
          [update.id]: { ...existing, ...update },
        },
      };
    }),

  updateBase: (update) =>
    set((state) => {
      const existing = state.bases[update.id];
      if (!existing) return state;
      return {
        bases: {
          ...state.bases,
          [update.id]: { ...existing, ...update },
        },
      };
    }),

  getBasesList: () => Object.values(get().bases),
  getAircraftList: () => Object.values(get().aircraft),
  getCrewList: () => Object.values(get().crew),
  getMissionsList: () => Object.values(get().missions),
  getThreatsList: () => Object.values(get().threats),
  getAirspaceList: () => Object.values(get().airspace),
  getAirborneAircraft: () =>
    Object.values(get().aircraft).filter((a) => a.status === 'airborne'),
  getActiveMissions: () =>
    Object.values(get().missions).filter((m) => m.status === 'in-progress'),
}));
