import React from 'react';
import {
  MissionType,
  MissionStatus,
  PriorityLevel,
} from '@/types';
import {
  Shield,
  Crosshair,
  Eye,
  Package,
  LifeBuoy,
  Plane,
} from 'lucide-react';

export type MissionViewMode = 'board' | 'timeline' | 'table';

export type TimelineZoom = '1h' | '6h' | '12h' | '24h';

export interface MissionFilterState {
  priority: 'all' | PriorityLevel;
  type: 'all' | MissionType;
  baseId: 'all' | string;
  status: 'all' | MissionStatus;
  search: string;
}

export type { ConflictType, ConflictItem } from '@/lib/conflictDetection';

export interface GhostSortie {
  recommendationId: string;
  recommendationScore: number;
  missionId: string;
  missionName: string;
  aircraftId: string;
  windowStart: string;
  windowEnd: string;
  priority: PriorityLevel;
  summary: string;
}

export const MISSION_TYPE_CONFIG: Record<
  MissionType,
  {
    label: string;
    code: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  CAP: {
    label: 'Combat Air Patrol',
    code: 'CAP',
    icon: Shield,
    color: 'text-command-text bg-command-bg border-command-border',
  },
  strike: {
    label: 'Precision Strike',
    code: 'STK',
    icon: Crosshair,
    color: 'text-command-text bg-command-bg border-command-border',
  },
  recon: {
    label: 'Reconnaissance',
    code: 'RCN',
    icon: Eye,
    color: 'text-command-text bg-command-bg border-command-border',
  },
  airlift: {
    label: 'Tactical Airlift',
    code: 'ALF',
    icon: Package,
    color: 'text-command-text bg-command-bg border-command-border',
  },
  SAR: {
    label: 'Search & Rescue',
    code: 'SAR',
    icon: LifeBuoy,
    color: 'text-command-text bg-command-bg border-command-border',
  },
  escort: {
    label: 'Air Escort',
    code: 'ESC',
    icon: Plane,
    color: 'text-command-text bg-command-bg border-command-border',
  },
};
