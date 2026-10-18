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
  statusEdge: string;
}

const BOARD_COLUMNS: ColumnConfig[] = [
  {
    status: 'planned',
    title: 'Planned',
    icon: Clock,
    statusEdge: 'border-l-command-muted',
  },
  {
    status: 'approved',
    title: 'Approved',
    icon: FileCheck,
    statusEdge: 'border-l-command-secondary',
  },
  {
    status: 'in-progress',
    title: 'In-Progress',
    icon: PlayCircle,
    statusEdge: 'border-l-command-nominal',
  },
  {
    status: 'at-risk',
    title: 'At-Risk',
    icon: AlertTriangle,
    statusEdge: 'border-l-command-critical',
  },
  {
    status: 'completed',
    title: 'Completed',
    icon: CheckCircle2,
    statusEdge: 'border-l-command-subdued',
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
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-start"
      data-testid="mission-board-view"
    >
      {BOARD_COLUMNS.map((col) => {
        const columnMissions = missions.filter((m) => m.status === col.status);
        const ColIcon = col.icon;

        return (
          <div
            key={col.status}
            className="flex flex-col rounded-[2px] bg-command-panel border border-command-border p-1.5 min-h-[500px]"
            data-testid={`kanban-column-${col.status}`}
          >
            {/* Column Header */}
            <div
              className={cn(
                'flex items-center justify-between p-2 mb-2 bg-command-raised border-b border-command-border border-l-[3px]',
                col.statusEdge,
              )}
            >
              <div className="flex items-center gap-1.5">
                <ColIcon className="w-3.5 h-3.5 text-command-muted" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-command-heading">
                  {col.title}
                </h3>
              </div>
              <span
                className={cn(
                  'px-1.5 py-0.2 rounded-[1px] text-[10px] font-mono font-semibold border',
                  col.status === 'at-risk' && columnMissions.length > 0
                    ? 'bg-command-critical-bg text-command-critical border-command-critical-border font-bold'
                    : 'bg-command-bg text-command-muted border-command-border',
                )}
              >
                {columnMissions.length}
              </span>
            </div>

            {/* Cards container */}
            <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5">
              {columnMissions.length === 0 ? (
                <div className="h-20 rounded-[1px] border border-command-border bg-command-bg flex items-center justify-center p-3 text-center">
                  <span className="text-[10px] font-mono text-command-subdued uppercase tracking-wider">
                    NO SORTIES
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
