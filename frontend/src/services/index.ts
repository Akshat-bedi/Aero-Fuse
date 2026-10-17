import { serviceConfig } from './config';
import { apiClient } from './apiClient';
import { mockEngine } from './mockEngine';
import { TacticalWebSocketClient } from './wsClient';
import { Airbase, Aircraft, RetaskingRecommendation } from '@/types';

/**
 * AirOps Unified Operations Service Layer
 * Abstracts backend communication:
 * When VITE_DATA_SOURCE=mock: delegates to MockOpsEngine
 * When VITE_DATA_SOURCE=live: delegates to TacticalApiClient and TacticalWebSocketClient
 * Components consume this service layer with ZERO component changes.
 */

export interface IAirOpsService {
  getAirbases(): Promise<Airbase[]>;
  getAircraft(): Promise<Aircraft[]>;
  getRecommendations(): Promise<RetaskingRecommendation[]>;
  subscribeToUpdates(channel: string, callback: (data: unknown) => void): () => void;
}

class AirOpsServiceImpl implements IAirOpsService {
  private wsClient?: TacticalWebSocketClient;

  constructor() {
    if (!serviceConfig.isMock) {
      this.wsClient = new TacticalWebSocketClient({ url: serviceConfig.wsUrl });
      this.wsClient.connect();
    }
  }

  async getAirbases(): Promise<Airbase[]> {
    if (serviceConfig.isMock) {
      return mockEngine.getAirbases();
    }
    return apiClient.get<Airbase[]>('/airbases');
  }

  async getAircraft(): Promise<Aircraft[]> {
    if (serviceConfig.isMock) {
      return mockEngine.getAircraft();
    }
    return apiClient.get<Aircraft[]>('/aircraft');
  }

  async getRecommendations(): Promise<RetaskingRecommendation[]> {
    if (serviceConfig.isMock) {
      return mockEngine.getRecommendations();
    }
    return apiClient.get<RetaskingRecommendation[]>('/recommendations');
  }

  subscribeToUpdates(channel: string, callback: (data: unknown) => void): () => void {
    if (serviceConfig.isMock) {
      return mockEngine.subscribe((event, data) => {
        if (event === channel) {
          callback(data);
        }
      });
    }

    if (this.wsClient) {
      return this.wsClient.subscribe(channel, callback);
    }

    return () => {};
  }
}

export const opsService: IAirOpsService = new AirOpsServiceImpl();
export { serviceConfig, apiClient, mockEngine, TacticalWebSocketClient };
