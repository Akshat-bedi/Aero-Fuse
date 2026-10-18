import React, { useState, useMemo } from 'react';
import { useEntitiesStore } from '@/store/entitiesStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { useUiStore } from '@/store/uiStore';
import { MissionType, MissionStatus, PriorityLevel } from '@/types';
import { MissionViewMode, MissionFilterState } from './types';
import { detectMissionConflicts } from './conflictDetection';
import { MissionBoardView } from './MissionBoardView';
import { SortieTimeline } from './SortieTimeline';
import { MissionTableView } from './MissionTableView';
import { MissionDetailDrawer } from './MissionDetailDrawer';
import { Stat } from '@/components/ui/Stat';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  Calendar,
  Table,
  Search,
  Filter,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

export const MissionsPage: React.FC = () => {
  const {
    missions,
    bases,
    aircraft,
    crew,
    threats,
    simTime,
    updateMission,
  } = useEntitiesStore();

  const { recommendations } = useRecommendationsStore();
  const { selectedMissionId, selectMission, addToast } = useUiStore();

  const [viewMode, setViewMode] = useState<MissionViewMode>('board');
  const [filters, setFilters] = useState<MissionFilterState>({
    priority: 'all',
    type: 'all',
    baseId: 'all',
    status: 'all',
    search: '',
  });

  const missionsList = useMemo(() => Object.values(missions), [missions]);
  const basesList = useMemo(() => Object.values(bases), [bases]);

  // Run comprehensive conflict detection
  const { conflictsByMission, allConflicts } = useMemo(() => {
    return detectMissionConflicts(missionsList, aircraft, crew);
  }, [missionsList, aircraft, crew]);

  // Filter missions based on user criteria
  const filteredMissions = useMemo(() => {
    return missionsList.filter((m) => {
      if (filters.priority !== 'all' && m.priority !== filters.priority) return false;
      if (filters.type !== 'all' && m.type !== filters.type) return false;
      if (filters.baseId !== 'all' && m.launchBaseId !== filters.baseId) return false;
      if (filters.status !== 'all' && m.status !== filters.status) return false;

      if (filters.search.trim()) {
        const query = filters.search.toLowerCase().trim();
        const matchesName = m.name.toLowerCase().includes(query);
        const matchesId = m.id.toLowerCase().includes(query);
        const matchesTarget = m.target.name.toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesTarget) return false;
      }

      return true;
    });
  }, [missionsList, filters]);

  // Statistics for top ATO status strip
  const stats = useMemo(() => {
    const total = missionsList.length;
    const airborne = missionsList.filter((m) => m.status === 'in-progress').length;
    const planned = missionsList.filter((m) => m.status === 'planned' || m.status === 'approved').length;
    const atRisk = missionsList.filter((m) => m.status === 'at-risk').length;
    const completed = missionsList.filter((m) => m.status === 'completed').length;
    const conflictCount = allConflicts.length;

    return { total, airborne, planned, atRisk, completed, conflictCount };
  }, [missionsList, allConflicts]);

  // Extract pending recommendation changes for timeline ghost bars
  const pendingChanges = useMemo(() => {
    const pendingRecs = Object.values(recommendations).filter((r) => r.status === 'pending');
    return pendingRecs.flatMap((r) => r.changes || []);
  }, [recommendations]);

  const hasActiveFilters =
    filters.priority !== 'all' ||
    filters.type !== 'all' ||
    filters.baseId !== 'all' ||
    filters.status !== 'all' ||
    filters.search !== '';

  const resetFilters = () => {
    setFilters({
      priority: 'all',
      type: 'all',
      baseId: 'all',
      status: 'all',
      search: '',
    });
  };

  const selectedMission = useMemo(() => {
    if (!selectedMissionId) return null;
    return missions[selectedMissionId] || null;
  }, [selectedMissionId, missions]);

  const handleApproveSortie = (missionId: string) => {
    updateMission({ id: missionId, status: 'approved' });
    addToast({
      type: 'nominal',
      title: `Sortie ${missionId} Approved`,
      message: 'Air Tasking Order updated with commander approval directive.',
    });
  };

  return (
    <div className="space-y-4" data-testid="missions-page">
      {/* Top ATO Summary Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat
          label="Total ATO Sorties"
          value={stats.total}
          unit="missions"
          status="nominal"
          className="bg-command-panel/80"
        />
        <Stat
          label="Airborne / Active"
          value={stats.airborne}
          unit="sorties"
          status="info"
          className="bg-command-panel/80"
        />
        <Stat
          label="Planned / Approved"
          value={stats.planned}
          unit="sorties"
          status="nominal"
          className="bg-command-panel/80"
        />
        <Stat
          label="At-Risk Sorties"
          value={stats.atRisk}
          unit="critical"
          status={stats.atRisk > 0 ? 'critical' : 'nominal'}
          className="bg-command-panel/80"
        />
        <Stat
          label="Completed Sorties"
          value={stats.completed}
          unit="sorties"
          status="nominal"
          className="bg-command-panel/80"
        />
        <Stat
          label="Active Conflicts"
          value={stats.conflictCount}
          unit="detected"
          status={stats.conflictCount > 0 ? 'warning' : 'nominal'}
          className={cn(
            'bg-command-panel/80',
            stats.conflictCount > 0 && 'ring-1 ring-amber-500/50',
          )}
        />
      </div>

      {/* Operational Conflict Banner */}
      {stats.conflictCount > 0 && (
        <div
          className="p-3 rounded-lg border border-amber-600/60 bg-amber-950/40 flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
          data-testid="conflict-alert-banner"
        >
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
            <span className="font-bold">
              {stats.conflictCount} Scheduling & Readiness Conflicts Detected in Current ATO Cycle
            </span>
            <span className="hidden sm:inline text-slate-400">
              (Double-booked airframes, turnaround violations, or pilot duty limits)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilters((prev) => ({ ...prev, status: 'at-risk' }))}
              className="text-[11px] underline text-amber-300 hover:text-amber-100"
            >
              Filter At-Risk
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => setViewMode('timeline')}
              className="text-[11px] underline text-cyan-300 hover:text-cyan-100"
            >
              Inspect on Timeline
            </button>
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="p-3 rounded-lg border border-slate-800 bg-command-panel/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* View Switcher Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => setViewMode('board')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded transition-colors',
                viewMode === 'board'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200',
              )}
              data-testid="view-toggle-board"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>

            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded transition-colors',
                viewMode === 'timeline'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200',
              )}
              data-testid="view-toggle-timeline"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Sortie Timeline</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded transition-colors',
                viewMode === 'table'
                  ? 'bg-cyan-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-slate-200',
              )}
              data-testid="view-toggle-table"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Data Table</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-xs min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search sorties, IDs, targets..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="w-full pl-8 pr-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>

        {/* Filter Dropdowns row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px] mr-1">
            <Filter className="w-3 h-3 text-cyan-400" />
            <span>Filters:</span>
          </div>

          {/* Base Filter */}
          <select
            value={filters.baseId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, baseId: e.target.value }))
            }
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Bases</option>
            {basesList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.id})
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                type: e.target.value as 'all' | MissionType,
              }))
            }
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Mission Types</option>
            <option value="CAP">CAP</option>
            <option value="strike">Strike</option>
            <option value="recon">Recon</option>
            <option value="airlift">Airlift</option>
            <option value="SAR">SAR</option>
            <option value="escort">Escort</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                priority:
                  e.target.value === 'all'
                    ? 'all'
                    : (Number(e.target.value) as PriorityLevel),
              }))
            }
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Priorities</option>
            <option value="1">P1 Critical</option>
            <option value="2">P2 High</option>
            <option value="3">P3 Routine</option>
            <option value="4">P4 Low</option>
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as 'all' | MissionStatus,
              }))
            }
            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="approved">Approved</option>
            <option value="in-progress">In-Progress</option>
            <option value="at-risk">At-Risk</option>
            <option value="completed">Completed</option>
          </select>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-[11px] font-mono gap-1 text-slate-400 hover:text-slate-200"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </Button>
          )}

          <div className="ml-auto font-mono text-[11px] text-slate-400">
            Showing <span className="text-cyan-400 font-bold">{filteredMissions.length}</span> of{' '}
            <span className="text-slate-300">{missionsList.length}</span> sorties
          </div>
        </div>
      </div>

      {/* Primary View Display */}
      {viewMode === 'board' && (
        <MissionBoardView
          missions={filteredMissions}
          bases={bases}
          aircraft={aircraft}
          crew={crew}
          conflictsByMission={conflictsByMission}
          selectedMissionId={selectedMissionId}
          onSelectMission={selectMission}
        />
      )}

      {viewMode === 'timeline' && (
        <SortieTimeline
          missions={filteredMissions}
          bases={bases}
          aircraft={aircraft}
          crew={crew}
          recommendations={recommendations}
          conflictsByMission={conflictsByMission}
          simTime={simTime}
          selectedMissionId={selectedMissionId}
          onSelectMission={selectMission}
          proposedChanges={pendingChanges}
        />
      )}

      {viewMode === 'table' && (
        <MissionTableView
          missions={filteredMissions}
          bases={bases}
          aircraft={aircraft}
          crew={crew}
          conflictsByMission={conflictsByMission}
          selectedMissionId={selectedMissionId}
          onSelectMission={selectMission}
        />
      )}

      {/* Mission Detail Drawer */}
      <MissionDetailDrawer
        mission={selectedMission}
        base={selectedMission ? bases[selectedMission.launchBaseId] : undefined}
        aircraftMap={aircraft}
        crewMap={crew}
        threatsMap={threats}
        recommendations={recommendations}
        conflicts={selectedMission ? conflictsByMission.get(selectedMission.id) || [] : []}
        isOpen={!!selectedMissionId}
        onClose={() => selectMission(null)}
        onApproveSortie={handleApproveSortie}
      />
    </div>
  );
};
