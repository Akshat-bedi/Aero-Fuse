import { Base, Aircraft, Recommendation } from '@/types';
import { mockDataService } from './mockDataService';

/**
 * Backward-compatible mock engine adapter for early Stage 0/1 consumers.
 * Delegates to the canonical MockDataService.
 */
export class MockOpsEngine {
  public async getAirbases(): Promise<Base[]> {
    const snapshot = await mockDataService.getSnapshot();
    return Object.values(snapshot.bases);
  }

  public async getAircraft(): Promise<Aircraft[]> {
    const snapshot = await mockDataService.getSnapshot();
    return Object.values(snapshot.aircraft);
  }

  public async getRecommendations(): Promise<Recommendation[]> {
    const snapshot = await mockDataService.getSnapshot();
    return Object.values(snapshot.recommendations);
  }

  public subscribe(listener: (event: string, data: unknown) => void): () => void {
    return mockDataService.subscribe((snapshot) => {
      listener('snapshot', snapshot);
    });
  }

  public emit(_event: string, _data: unknown): void {
    // Delegated to dataService.injectEvent
  }
}

export const mockEngine = new MockOpsEngine();
