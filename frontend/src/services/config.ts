import { DataSourceMode } from '@/types';

export interface ServiceConfig {
  dataSource: DataSourceMode;
  apiBaseUrl: string;
  wsUrl: string;
  isMock: boolean;
}

export const serviceConfig: ServiceConfig = {
  dataSource: (import.meta.env.VITE_DATA_SOURCE as DataSourceMode) || 'mock',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws',
  isMock: (import.meta.env.VITE_DATA_SOURCE || 'mock') === 'mock',
};
