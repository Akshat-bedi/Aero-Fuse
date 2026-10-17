import React, { useState, useMemo } from 'react';
import { Mission, Base, Aircraft, Crew } from '@/types';
import { ConflictItem, MISSION_TYPE_CONFIG } from './types';
import { PriorityTag } from '@/components/ui/PriorityTag';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatTimeZulu, cn } from '@/lib/utils';
import {
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Plane,
  Users,
} from 'lucide-react';

export interface MissionTableViewProps {
  missions: Mission[];
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  conflictsByMission: Map<string, ConflictItem[]>;
  selectedMissionId: string | null;
  onSelectMission: (id: string) => void;
}

type SortField = 'id' | 'name' | 'type' | 'priority' | 'status' | 'windowStart' | 'base';

export const MissionTableView: React.FC<MissionTableViewProps> = ({
  missions,
  bases,
  aircraft,
  crew,
  conflictsByMission,
  selectedMissionId,
  onSelectMission,
}) => {
  const [sortField, setSortField] = useState<SortField>('priority');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedMissions = useMemo(() => {
    return [...missions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'priority':
          cmp = a.priority - b.priority;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'windowStart':
          cmp = new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime();
          break;
        case 'base':
          cmp = (bases[a.launchBaseId]?.code || a.launchBaseId).localeCompare(
            bases[b.launchBaseId]?.code || b.launchBaseId,
          );
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [missions, sortField, sortAsc, bases]);

  return (
    <div
      className="rounded-lg border border-slate-800 bg-command-panel/90 overflow-hidden shadow-lg"
      data-testid="mission-table-view"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-command-base/80 border-b border-slate-800 text-slate-300 font-mono uppercase text-[11px] tracking-wider select-none">
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('priority')}
              >
                <div className="flex items-center gap-1">
                  <span>Priority</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('id')}
              >
                <div className="flex items-center gap-1">
                  <span>ID / Name</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('type')}
              >
                <div className="flex items-center gap-1">
                  <span>Type</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('base')}
              >
                <div className="flex items-center gap-1">
                  <span>Base</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-cyan-400"
                onClick={() => handleSort('windowStart')}
              >
                <div className="flex items-center gap-1">
                  <span>Sortie Window</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-3">Assigned Aircraft</th>
              <th className="py-3 px-3">Assigned Crew</th>
              <th className="py-3 px-3">Conflicts / Safety</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {sortedMissions.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 font-mono">
                  No operational missions match current filters.
                </td>
              </tr>
            ) : (
              sortedMissions.map((m) => {
                const isSelected = selectedMissionId === m.id;
                const typeConfig = MISSION_TYPE_CONFIG[m.type] || MISSION_TYPE_CONFIG.CAP;
                const TypeIcon = typeConfig.icon;
                const conflicts = conflictsByMission.get(m.id) || [];
                const hasCritical = conflicts.some((c) => c.severity === 'critical');
                const hasWarning = conflicts.some((c) => c.severity === 'warning');

                const assignedAc = m.assigned.aircraftIds
                  .map((id) => aircraft[id])
                  .filter(Boolean);

                const assignedCr = m.assigned.crewIds
                  .map((id) => crew[id])
                  .filter(Boolean);

                const durationHours = (
                  (new Date(m.windowEnd).getTime() - new Date(m.windowStart).getTime()) /
                  3600000
                ).toFixed(1);

                return (
                  <tr
                    key={m.id}
                    onClick={() => onSelectMission(m.id)}
                    className={cn(
                      'transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-cyan-950/40 border-l-2 border-cyan-400'
                        : m.status === 'at-risk'
                        ? 'bg-red-950/20 hover:bg-red-950/30'
                        : 'hover:bg-slate-800/40',
                    )}
                  >
                    {/* Priority */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <PriorityTag priority={m.priority} size="sm" showDescription={false} />
                    </td>

                    {/* ID / Name */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-cyan-400 font-bold text-[11px]">
                          {m.id}
                        </span>
                        <span className="text-slate-100 font-medium line-clamp-1">
                          {m.name}
                        </span>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wider',
                          typeConfig.color,
                        )}
                      >
                        <TypeIcon className="w-3 h-3" />
                        <span>{m.type}</span>
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <StatusBadge
                        status={
                          m.status === 'in-progress'
                            ? 'nominal'
                            : m.status === 'at-risk'
                            ? 'critical'
                            : m.status === 'approved'
                            ? 'info'
                            : m.status === 'completed'
                            ? 'nominal'
                            : 'info'
                        }
                        label={m.status}
                        size="sm"
                        pulse={m.status === 'in-progress'}
                      />
                    </td>

                    {/* Base */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-300">
                      {bases[m.launchBaseId]?.name || m.launchBaseId}
                    </td>

                    {/* Sortie Window */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-300">
                      <div>
                        {formatTimeZulu(m.windowStart)} - {formatTimeZulu(m.windowEnd)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Duration: {durationHours}h
                      </div>
                    </td>

                    {/* Assigned Aircraft */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Plane className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          {assignedAc.map((a) => a.tailNumber).join(', ') || 'Unassigned'}
                        </span>
                      </div>
                    </td>

                    {/* Assigned Crew */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {assignedCr.map((c) => c.callsign).join(', ') || 'Unassigned'}
                        </span>
                      </div>
                    </td>

                    {/* Conflicts / Safety */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {conflicts.length > 0 ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border font-semibold animate-pulse',
                            hasCritical
                              ? 'bg-red-950/80 text-red-300 border-red-600/70'
                              : hasWarning
                              ? 'bg-amber-950/80 text-amber-300 border-amber-600/70'
                              : 'bg-slate-800 text-slate-300 border-slate-700',
                          )}
                          title={conflicts.map((c) => c.title).join(' • ')}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>
                            {conflicts.length} {conflicts.length === 1 ? 'Conflict' : 'Conflicts'}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Nominal</span>
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <Button
                        variant={isSelected ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMission(m.id);
                        }}
                        className="text-[11px] font-mono gap-1"
                      >
                        <span>Inspect</span>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
