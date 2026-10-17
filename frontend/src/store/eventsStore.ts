import { create } from 'zustand';
import { OpsEvent, OpsEventType } from '@/types';

interface EventsState {
  events: OpsEvent[];
  activeFilter: OpsEventType | 'ALL';
  isInjecting: boolean;

  setEvents: (events: OpsEvent[]) => void;
  addEvent: (event: OpsEvent) => void;
  setActiveFilter: (filter: OpsEventType | 'ALL') => void;
  setIsInjecting: (injecting: boolean) => void;

  getFilteredEvents: () => OpsEvent[];
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  activeFilter: 'ALL',
  isInjecting: false,

  setEvents: (events) => set({ events }),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events.filter((e) => e.id !== event.id)].slice(0, 100),
    })),

  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setIsInjecting: (injecting) => set({ isInjecting: injecting }),

  getFilteredEvents: () => {
    const { events, activeFilter } = get();
    if (activeFilter === 'ALL') return events;
    return events.filter((e) => e.type === activeFilter);
  },
}));
