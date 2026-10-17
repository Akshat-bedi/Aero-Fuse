import { create } from 'zustand';
import { Recommendation, RecommendationStatus } from '@/types';

interface RecommendationsState {
  recommendations: Record<string, Recommendation>;
  selectedRecId: string | null;
  statusFilter: 'ALL' | RecommendationStatus;
  isSubmittingDecision: boolean;

  setRecommendations: (recs: Record<string, Recommendation>) => void;
  addRecommendation: (rec: Recommendation) => void;
  updateRecommendationStatus: (
    id: string,
    status: RecommendationStatus,
    modifications?: Record<string, unknown>,
  ) => void;
  selectRecommendation: (id: string | null) => void;
  setStatusFilter: (filter: 'ALL' | RecommendationStatus) => void;
  setIsSubmittingDecision: (submitting: boolean) => void;

  getRecommendationsList: () => Recommendation[];
  getPendingCount: () => number;
}

export const useRecommendationsStore = create<RecommendationsState>((set, get) => ({
  recommendations: {},
  selectedRecId: null,
  statusFilter: 'ALL',
  isSubmittingDecision: false,

  setRecommendations: (recs) => set({ recommendations: recs }),

  addRecommendation: (rec) =>
    set((state) => ({
      recommendations: {
        ...state.recommendations,
        [rec.id]: rec,
      },
    })),

  updateRecommendationStatus: (id, status, modifications) =>
    set((state) => {
      const existing = state.recommendations[id];
      if (!existing) return state;
      return {
        recommendations: {
          ...state.recommendations,
          [id]: {
            ...existing,
            status,
            modifications: modifications || existing.modifications,
          },
        },
      };
    }),

  selectRecommendation: (id) => set({ selectedRecId: id }),
  setStatusFilter: (filter) => set({ statusFilter: filter }),
  setIsSubmittingDecision: (submitting) => set({ isSubmittingDecision: submitting }),

  getRecommendationsList: () => {
    const list = Object.values(get().recommendations);
    const filter = get().statusFilter;
    if (filter === 'ALL') return list;
    return list.filter((r) => r.status === filter);
  },

  getPendingCount: () =>
    Object.values(get().recommendations).filter((r) => r.status === 'pending').length,
}));
