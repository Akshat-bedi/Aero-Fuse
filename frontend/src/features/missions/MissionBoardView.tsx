import React from 'react';
import { Mission, Base, Aircraft, Crew, MissionStatus } from '@/types';
import { ConflictItem } from './types';
import { MissionCard } from './MissionCard';
import { CheckCircle2, Clock, PlayCircle, AlertTriangle, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MissionBoardViewProps {
  missions: Mission[];
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  conflictsByMission: Map<string, ConflictItem[]>;
  selectedMissionId: string | null;
  onSelectMission: (id: string) => void;
}

interface ColumnConfig {
  status: MissionStatus;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  headerBorder: string;
  badgeStyle: string;
  dotColor: string;
}

const BOARD_COLUMNS: ColumnConfig[] = [
  {
    status: 'planned',
    title: 'Planned',
    icon: Clock,
    headerBorder: 'border-blue-500/40',
    badgeStyle: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
    dotColor: 'bg-blue-400',
  },
  {
    status: 'approved',
    title: 'Approved',
    icon: FileCheck,
    headerBorder: 'border-cyan-500/40',
    badgeStyle: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
    dotColor: 'bg-cyan-400',
  },
  {
    status: 'in-progress',
    title: 'In-Progress',
    icon: PlayCircle,
    headerBorder: 'border-emerald-500/40',
    badgeStyle: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
    dotColor: 'bg-emerald-400 animate-ping',
  },
  {
    status: 'at-risk',
    title: 'At-Risk',
    icon: AlertTriangle,
    headerBorder: 'border-red-500/50',
    badgeStyle: 'bg-red-950/80 text-red-300 border-red-700/60 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
    dotColor: 'bg-red-500',
  },
  {
    status: 'completed',
    title: 'Completed',
    icon: CheckCircle2,
    headerBorder: 'border-slate-600/40',
    badgeStyle: 'bg-slate-900/80 text-slate-300 border-slate-700/60',
    dotColor: 'bg-slate-400',
  },
];

export const MissionBoardView: React.FC<MissionBoardViewProps> = ({
  missions,
  bases,
  aircraft,
  crew,
  conflictsByMission,
  selectedMissionId,
  onSelectMission,
}) => {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 items-start"
      data-testid="mission-board-view"
    >
      {BOARD_COLUMNS.map((col) => {
        const columnMissions = missions.filter((m) => m.status === col.status);
        const ColIcon = col.icon;

        return (
          <div
            key={col.status}
            className="flex flex-col rounded-lg bg-command-base/60 border border-slate-800/80 p-2.5 min-h-[500px]"
            data-testid={`kanban-column-${col.status}`}
          >
            {/* Column Header */}
            <div
              className={cn(
                'flex items-center justify-between pb-2.5 mb-2.5 border-b',
                col.headerBorder,
              )}
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={cn('h-2 w-2 rounded-full', col.dotColor)} />
                </span>
                <ColIcon className="w-4 h-4 text-slate-300" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  {col.title}
                </h3>
              </div>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border',
                  col.badgeStyle,
                )}
              >
                {columnMissions.length}
              </span>
            </div>

            {/* Cards container */}
            <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
              {columnMissions.length === 0 ? (
                <div className="h-28 rounded border border-dashed border-slate-800/80 flex items-center justify-center p-3 text-center">
                  <span className="text-[11px] font-mono text-slate-400">
                    No {col.title.toLowerCase()} sorties
                  </span>
                </div>
              ) : (
                columnMissions.map((m) => (
                  <MissionCard
                    key={m.id}
                    mission={m}
                    base={bases[m.launchBaseId]}
                    aircraftMap={aircraft}
                    crewMap={crew}
                    conflicts={conflictsByMission.get(m.id) || []}
                    isSelected={selectedMissionId === m.id}
                    onSelect={onSelectMission}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
