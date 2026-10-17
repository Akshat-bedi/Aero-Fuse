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
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }
> = {
  CAP: {
    label: 'Combat Air Patrol',
    icon: Shield,
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/60',
  },
  strike: {
    label: 'Precision Strike',
    icon: Crosshair,
    color: 'text-rose-400 bg-rose-950/60 border-rose-800/60',
  },
  recon: {
    label: 'Reconnaissance',
    icon: Eye,
    color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60',
  },
  airlift: {
    label: 'Tactical Airlift',
    icon: Package,
    color: 'text-amber-400 bg-amber-950/60 border-amber-800/60',
  },
  SAR: {
    label: 'Search & Rescue',
    icon: LifeBuoy,
    color: 'text-orange-400 bg-orange-950/60 border-orange-800/60',
  },
  escort: {
    label: 'Air Escort',
    icon: Plane,
    color: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/60',
  },
};
