import React from 'react';
import {
  Clock,
  MapPin,
  Plane,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { Mission, Base, Aircraft, Crew } from '@/types';
import { ConflictItem, MISSION_TYPE_CONFIG } from './types';
import { PriorityTag } from '@/components/ui/PriorityTag';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatTimeZulu, cn } from '@/lib/utils';

export interface MissionCardProps {
  mission: Mission;
  base?: Base;
  aircraftMap?: Record<string, Aircraft>;
  crewMap?: Record<string, Crew>;
  conflicts?: ConflictItem[];
  isSelected?: boolean;
  onSelect: (missionId: string) => void;
}

export const MissionCard: React.FC<MissionCardProps> = ({
  mission,
  base,
  aircraftMap = {},
  crewMap = {},
  conflicts = [],
  isSelected = false,
  onSelect,
}) => {
  const typeConfig = MISSION_TYPE_CONFIG[mission.type] || MISSION_TYPE_CONFIG.CAP;
  const TypeIcon = typeConfig.icon;

  const hasCriticalConflict = conflicts.some((c) => c.severity === 'critical');
  const hasWarningConflict = conflicts.some((c) => c.severity === 'warning');

  // Map mission status to operational status for StatusBadge
  const opStatus =
    mission.status === 'in-progress'
      ? 'nominal'
      : mission.status === 'at-risk'
      ? 'critical'
      : mission.status === 'approved'
      ? 'info'
      : mission.status === 'completed'
      ? 'nominal'
      : mission.status === 'cancelled'
      ? 'inactive'
      : 'info';

  const assignedAircraft = mission.assigned.aircraftIds
    .map((id) => aircraftMap[id])
    .filter(Boolean);

  const assignedCrew = mission.assigned.crewIds
    .map((id) => crewMap[id])
    .filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(mission.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(mission.id);
        }
      }}
      className={cn(
        'group text-left p-3.5 rounded-lg border transition-all duration-150 cursor-pointer select-none',
        'bg-command-panel/90 hover:bg-command-raised/90 backdrop-blur-sm',
        isSelected
          ? 'border-cyan-400 ring-1 ring-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
          : mission.status === 'at-risk'
          ? 'border-red-600/50 hover:border-red-500'
          : 'border-slate-800 hover:border-slate-700',
      )}
    >
      {/* Top row: Type chip + Priority Tag */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider',
              typeConfig.color,
            )}
          >
            <TypeIcon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{mission.type}</span>
          </span>
          <span className="text-[11px] font-mono text-slate-400 font-semibold">
            {mission.id}
          </span>
        </div>
        <PriorityTag priority={mission.priority} size="sm" showDescription={false} />
      </div>

      {/* Mission Name */}
      <h4 className="text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors line-clamp-1 mb-2">
        {mission.name}
      </h4>

      {/* Time Window & Base */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 mb-2.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-1 truncate" title={`Launch Base: ${base?.name || mission.launchBaseId}`}>
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{base?.code || mission.launchBaseId}</span>
        </div>
        <div className="flex items-center gap-1 justify-end truncate">
          <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>
            {formatTimeZulu(mission.windowStart)} - {formatTimeZulu(mission.windowEnd)}
          </span>
        </div>
      </div>

      {/* Assigned Resource summary & Target */}
      <div className="space-y-1 text-xs text-slate-300 mb-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 truncate">Target:</span>
          <span className="font-mono text-slate-200 truncate ml-2 font-medium">
            {mission.target.name}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Assigned Assets:</span>
          <div className="flex items-center gap-2 font-mono">
            <span
              className={cn(
                'inline-flex items-center gap-1',
                assignedAircraft.length === 0 ? 'text-amber-400' : 'text-slate-300',
              )}
              title={assignedAircraft.map((a) => a.tailNumber).join(', ') || 'None assigned'}
            >
              <Plane className="w-3 h-3 text-cyan-400" />
              {assignedAircraft.length > 0
                ? assignedAircraft[0].tailNumber
                : `${mission.assigned.aircraftIds.length || 0} AC`}
            </span>
            <span className="text-slate-600">•</span>
            <span
              className={cn(
                'inline-flex items-center gap-1',
                assignedCrew.length === 0 ? 'text-amber-400' : 'text-slate-300',
              )}
              title={assignedCrew.map((c) => c.callsign).join(', ') || 'None assigned'}
            >
              <Users className="w-3 h-3 text-indigo-400" />
              {assignedCrew.length > 0
                ? assignedCrew[0].callsign
                : `${mission.assigned.crewIds.length || 0} CR`}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer: Status Badge & Conflict Alert */}
      <div className="flex items-center justify-between gap-1.5 pt-1">
        <StatusBadge
          status={opStatus}
          label={mission.status}
          size="sm"
          pulse={mission.status === 'in-progress'}
        />

        {conflicts.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border font-semibold animate-pulse',
              hasCriticalConflict
                ? 'bg-red-950/90 text-red-300 border-red-600/80 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                : hasWarningConflict
                ? 'bg-amber-950/90 text-amber-300 border-amber-600/80'
                : 'bg-slate-800 text-slate-300 border-slate-700',
            )}
            title={conflicts.map((c) => c.title).join(' • ')}
          >
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>
              {conflicts.length} {conflicts.length === 1 ? 'Conflict' : 'Conflicts'}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
