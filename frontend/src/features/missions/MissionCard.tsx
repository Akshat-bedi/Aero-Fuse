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
import { formatTimeZulu, cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

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

  const impactedMissionIds = useUiStore((s) => s.impactedMissionIds);
  const isImpacted = impactedMissionIds.includes(mission.id);

  const hasCriticalConflict = conflicts.some((c) => c.severity === 'critical') || isImpacted;
  const hasWarningConflict = conflicts.some((c) => c.severity === 'warning');

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
        'group text-left p-2.5 rounded-[2px] border transition-none cursor-pointer select-none font-mono',
        'bg-command-panel hover:bg-command-raised',
        isSelected
          ? 'border-command-primary border-l-[3px] border-l-command-primary bg-command-raised'
          : isImpacted
          ? 'border-command-critical border-l-[3px] border-l-command-critical bg-command-critical-bg/10 animate-slow-blink'
          : mission.status === 'at-risk'
          ? 'border-command-critical-border hover:border-command-critical'
          : 'border-command-border hover:border-command-border-hover',
      )}
    >
      {/* Top row: Type tag + Priority Tag */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[1px] text-[10px] font-mono border border-command-border bg-command-bg text-command-text uppercase font-semibold">
            <TypeIcon className="w-3 h-3 flex-shrink-0 text-command-muted" />
            <span>{typeConfig.code || mission.type}</span>
          </span>
          <span className="text-[11px] font-mono font-bold text-command-primary">
            {mission.id}
          </span>
        </div>
        <PriorityTag priority={mission.priority} size="sm" showDescription={false} />
      </div>

      {/* Mission Name */}
      <h4 className="text-[13px] font-mono font-semibold text-command-heading line-clamp-1 mb-2">
        {mission.name}
      </h4>

      {/* 2-column info grid */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] font-mono mb-2 pb-2 border-b border-command-border text-command-muted">
        {/* Row 1: Base & Window */}
        <div className="flex items-center gap-1 min-w-0" title={`Launch Base: ${base?.name || mission.launchBaseId}`}>
          <MapPin className="w-3.5 h-3.5 text-command-muted shrink-0" />
          <span className="text-[10px] text-command-subdued shrink-0">BASE:</span>
          <span className="text-command-text truncate font-bold">{base?.code || mission.launchBaseId}</span>
        </div>
        <div className="flex items-center gap-1 justify-end min-w-0" title={`Sortie Window: ${formatTimeZulu(mission.windowStart)} - ${formatTimeZulu(mission.windowEnd)}`}>
          <Clock className="w-3.5 h-3.5 text-command-muted shrink-0" />
          <span className="text-command-text truncate tabular-nums">
            {formatTimeZulu(mission.windowStart)}-{formatTimeZulu(mission.windowEnd)}
          </span>
        </div>

        {/* Row 2: Target & Assigned Assets */}
        <div className="flex items-center gap-1 min-w-0" title={`Target: ${mission.target.name}`}>
          <span className="text-[10px] text-command-subdued shrink-0 w-8">TGT:</span>
          <span className="text-command-text truncate">{mission.target.name}</span>
        </div>
        <div className="flex items-center gap-1.5 justify-end min-w-0">
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-command-text"
            title={assignedAircraft.map((a) => a.tailNumber).join(', ') || 'None assigned'}
          >
            <Plane className="w-3 h-3 text-command-muted shrink-0" />
            <span className="whitespace-nowrap tabular-nums">
              {assignedAircraft.length > 0 ? assignedAircraft[0].tailNumber : `${mission.assigned.aircraftIds.length || 0} AC`}
            </span>
          </span>
          <span className="text-command-border">•</span>
          <span
            className="inline-flex items-center gap-1 whitespace-nowrap text-command-text"
            title={assignedCrew.map((c) => c.callsign).join(', ') || 'None assigned'}
          >
            <Users className="w-3 h-3 text-command-muted shrink-0" />
            <span className="whitespace-nowrap">
              {assignedCrew.length > 0 ? assignedCrew[0].callsign : `${mission.assigned.crewIds.length || 0} CR`}
            </span>
          </span>
        </div>
      </div>

      {/* Bottom Footer: Badges for Impacted, At-Risk, Conflicts */}
      {(isImpacted || conflicts.length > 0 || mission.status === 'at-risk') && (
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          {isImpacted ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[1px] text-[10px] font-mono border font-bold bg-command-critical-bg text-command-critical border-command-critical-border">
              <AlertTriangle className="w-3 h-3 text-command-critical flex-shrink-0" />
              <span>IMPACTED</span>
            </span>
          ) : mission.status === 'at-risk' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[1px] text-[10px] font-mono border font-bold bg-command-critical-bg text-command-critical border-command-critical-border">
              <AlertTriangle className="w-3 h-3 text-command-critical flex-shrink-0" />
              <span>AT RISK</span>
            </span>
          ) : <div />}

          {conflicts.length > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[1px] text-[10px] font-mono border font-semibold',
                hasCriticalConflict
                  ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                  : hasWarningConflict
                  ? 'bg-command-warning-bg text-command-warning border-command-warning-border'
                  : 'bg-command-bg text-command-text border-command-border',
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
      )}
    </div>
  );
};
