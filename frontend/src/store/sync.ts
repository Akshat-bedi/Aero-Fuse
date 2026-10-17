import { dataService } from '@/services';
import { useEntitiesStore } from './entitiesStore';
import { useRecommendationsStore } from './recommendationsStore';
import { useEventsStore } from './eventsStore';
import { useAuditStore } from './auditStore';
import { OperationalSnapshot } from '@/types';

let isInitialized = false;

/**
 * Initializes continuous synchronization between DataService (Mock or Live)
 * and all normalized Zustand stores.
 */
export function initStoreSubscriptions(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  const unsubscribe = dataService.subscribe((snapshot: OperationalSnapshot) => {
    // 1. Sync Entities Store
    useEntitiesStore.getState().setSnapshot(snapshot);

    // 2. Sync Recommendations Store
    if (snapshot.recommendations) {
      useRecommendationsStore.getState().setRecommendations(snapshot.recommendations);
    }

    // 3. Sync Events Store
    if (snapshot.activeEvents) {
      useEventsStore.getState().setEvents(snapshot.activeEvents);
    }
  });

  // Initial audit log fetch
  dataService.getAuditLog().then((entries) => {
    useAuditStore.getState().setAuditLog(entries);
  }).catch(() => {});

  return () => {
    unsubscribe();
    isInitialized = false;
  };
}
