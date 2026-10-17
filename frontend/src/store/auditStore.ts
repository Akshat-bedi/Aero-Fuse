import { create } from 'zustand';
import { AuditEntry } from '@/types';

interface AuditState {
  entries: AuditEntry[];
  isLoading: boolean;

  setAuditLog: (entries: AuditEntry[]) => void;
  addAuditEntry: (entry: AuditEntry) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  entries: [],
  isLoading: false,

  setAuditLog: (entries) => set({ entries }),

  addAuditEntry: (entry) =>
    set((state) => ({
      entries: [entry, ...state.entries].slice(0, 200),
    })),

  setIsLoading: (loading) => set({ isLoading: loading }),
}));
