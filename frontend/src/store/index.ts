import { create } from 'zustand';

interface OpsState {
  isConnected: boolean;
  selectedAirbaseId: string | null;
  selectedAircraftId: string | null;
  selectedMissionId: string | null;
  setConnected: (connected: boolean) => void;
  selectAirbase: (id: string | null) => void;
  selectAircraft: (id: string | null) => void;
  selectMission: (id: string | null) => void;
}

export const useOpsStore = create<OpsState>((set) => ({
  isConnected: false,
  selectedAirbaseId: null,
  selectedAircraftId: null,
  selectedMissionId: null,
  setConnected: (connected) => set({ isConnected: connected }),
  selectAirbase: (id) => set({ selectedAirbaseId: id }),
  selectAircraft: (id) => set({ selectedAircraftId: id }),
  selectMission: (id) => set({ selectedMissionId: id }),
}));
