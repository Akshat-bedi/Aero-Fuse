import { dataService } from '@/services';
import { useEntitiesStore } from './entitiesStore';
import { useRecommendationsStore } from './recommendationsStore';
import { useEventsStore } from './eventsStore';
import { useAuditStore } from './auditStore';
import { useUiStore } from './uiStore';
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

  const unsubscribeSnapshot = dataService.subscribe((snapshot: OperationalSnapshot) => {
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

    // 4. Sync Audit Log Store
    if (snapshot.auditLog) {
      useAuditStore.getState().setAuditLog(snapshot.auditLog);
    }
  });

  // Stage 6: Subscribe to Retask Progress Telemetry
  const unsubscribeProgress = dataService.subscribeRetaskProgress?.((progress) => {
    useUiStore.getState().setRetaskProgress(progress);
  });

  // Stage 6: Subscribe to Impact Analysis
  const unsubscribeImpact = dataService.subscribeImpact?.((impact) => {
    useUiStore.getState().setImpact(impact);
    // Append operational alert or notification
    useUiStore.getState().addToast({
      type: 'critical',
      title: `Tactical Alert: ${impact.eventType}`,
      message: `${impact.impactedMissionIds.length} sortie(s) impacted: ${impact.impactedMissionIds.join(', ')}. AI replanning engaged.`,
      durationMs: 6000,
    });
  });

  // Initial audit log fetch
  dataService.getAuditLog().then((entries) => {
    useAuditStore.getState().setAuditLog(entries);
  }).catch(() => {});

  return () => {
    unsubscribeSnapshot();
    unsubscribeProgress?.();
    unsubscribeImpact?.();
    isInitialized = false;
  };
}
