import { IDataService } from './dataService';
import { mockDataService } from './mockDataService';
import { liveDataService } from './liveDataService';
import { serviceConfig } from './config';

/**
 * Service Factory
 * Instantiates and returns the configured IDataService implementation
 * based on VITE_DATA_SOURCE environment variable ('mock' | 'live').
 */
export function createDataService(): IDataService {
  if (serviceConfig.isMock) {
    return mockDataService;
  }
  return liveDataService;
}

export const dataService: IDataService = createDataService();
