import type { AircraftStatus, AircraftType } from '@/types';

export type ResourceTabKey = 'aircraft' | 'crew' | 'weapons' | 'predictions';

export interface AircraftFilterState {
  base: string;
  type: 'all' | AircraftType;
  status: 'all' | AircraftStatus;
  search: string;
}

export interface CrewFilterState {
  base: string; // 'all' or baseId
  role: string; // 'all' or role string
  status: string; // 'all' or CrewStatus
  nearingLimitsOnly: boolean;
  search: string;
}

export interface PredictionFilterState {
  urgency: 'all' | 'critical' | 'high' | 'medium';
  entityType: 'all' | 'aircraft' | 'crew' | 'base' | 'weather';
  search: string;
}
