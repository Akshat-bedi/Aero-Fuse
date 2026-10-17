import React, { useState, useMemo } from 'react';
import { Crew, Base } from '@/types';
import { CrewFilterState } from './types';
import { CrewFatigueChart } from './CrewFatigueChart';
import { DataTable, Column, StatusBadge, Stat, ProgressBar } from '@/components/ui';
import {
  Users,
  Search,
  AlertTriangle,
  Activity,
} from 'lucide-react';

interface CrewStatusTabProps {
  crew: Record<string, Crew>;
  bases: Record<string, Base>;
}

export const CrewStatusTab: React.FC<CrewStatusTabProps> = ({ crew, bases }) => {
  const [filters, setFilters] = useState<CrewFilterState>({
    base: 'all',
    role: 'all',
    status: 'all',
    nearingLimitsOnly: false,
    search: '',
  });

  const crewList = useMemo(() => Object.values(crew), [crew]);

  // Crew Summary Metrics
  const summary = useMemo(() => {
    const total = crewList.length;
    const available = crewList.filter((c) => c.status === 'available').length;
    const onMission = crewList.filter((c) => c.status === 'on-mission').length;
    const resting = crewList.filter((c) => c.status === 'resting').length;
    const unavailable = crewList.filter((c) => c.status === 'unavailable').length;

    // Nearing limit: dutyHours >= 10h OR fatigueIndex >= 75
    const nearingLimit = crewList.filter(
      (c) => c.dutyHoursLast24h >= 10 || c.fatigueIndex >= 75,
    ).length;

    const avgFatigue =
      total > 0
        ? Math.round(crewList.reduce((sum, c) => sum + c.fatigueIndex, 0) / total)
        : 0;

    return { total, available, onMission, resting, unavailable, nearingLimit, avgFatigue };
  }, [crewList]);

  // Filtered Crew for Table
  const filteredCrew = useMemo(() => {
    return crewList.filter((c) => {
      if (filters.base !== 'all' && c.baseId !== filters.base) return false;
      if (filters.role !== 'all' && !c.role.toLowerCase().includes(filters.role.toLowerCase())) return false;
      if (filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters.nearingLimitsOnly && c.dutyHoursLast24h < 10 && c.fatigueIndex < 75) return false;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesCallsign = c.callsign.toLowerCase().includes(query);
        const matchesRole = c.role.toLowerCase().includes(query);
        const matchesId = c.id.toLowerCase().includes(query);
        const matchesQual = c.qualifications.some((q) => q.toLowerCase().includes(query));
        if (!matchesCallsign && !matchesRole && !matchesId && !matchesQual) return false;
      }
      return true;
    });
  }, [crewList, filters]);

  // Table Columns
  const columns: Column<Crew>[] = [
    {
      key: 'callsign',
      label: 'Callsign & ID',
      sortable: true,
      render: (row) => (
        <div className="font-mono text-xs flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
          <span className="font-bold text-command-heading">{row.callsign}</span>
          <span className="text-[10px] text-command-muted">({row.id})</span>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Operational Role',
      sortable: true,
      render: (row) => <span className="text-command-text font-sans">{row.role}</span>,
    },
    {
      key: 'baseId',
      label: 'Home Base',
      sortable: true,
      render: (row) => {
        const base = bases[row.baseId];
        return (
          <span className="font-mono text-xs text-command-heading">
            {row.baseId}{' '}
            <span className="text-command-subdued text-[10px] hidden sm:inline">
              ({base?.name?.split(' ')[0] || 'Base'})
            </span>
          </span>
        );
      },
    },
    {
      key: 'qualifications',
      label: 'Qualifications',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {row.qualifications.map((q, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-command-bg border border-command-border/60 text-[9px] font-mono font-medium text-command-muted"
            >
              {q}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'dutyHoursLast24h',
      label: 'Duty (24h)',
      sortable: true,
      render: (row) => {
        const isNearLimit = row.dutyHoursLast24h >= 10;
        const isOverLimit = row.dutyHoursLast24h >= 12;
        return (
          <div className="font-mono text-xs space-y-0.5">
            <div className="flex items-center gap-1">
              {isNearLimit && (
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${
                    isOverLimit ? 'text-command-critical animate-pulse' : 'text-command-warning'
                  }`}
                />
              )}
              <span
                className={
                  isOverLimit
                    ? 'text-command-critical font-bold'
                    : isNearLimit
                    ? 'text-command-warning font-bold'
                    : 'text-command-text'
                }
              >
                {row.dutyHoursLast24h}h / 12h
              </span>
            </div>
            <div className="w-16 h-1 bg-command-bg rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  isOverLimit
                    ? 'bg-command-critical'
                    : isNearLimit
                    ? 'bg-command-warning'
                    : 'bg-command-primary'
                }`}
                style={{ width: `${Math.min(100, (row.dutyHoursLast24h / 12) * 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'fatigueIndex',
      label: 'Fatigue Gauge',
      sortable: true,
      render: (row) => {
        const val = row.fatigueIndex;
        const status = val >= 75 ? 'critical' : val >= 50 ? 'warning' : 'nominal';
        return (
          <div className="w-24 space-y-0.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span
                className={
                  status === 'critical'
                    ? 'text-command-critical font-bold'
                    : status === 'warning'
                    ? 'text-command-warning font-bold'
                    : 'text-command-nominal'
                }
              >
                {val} / 100
              </span>
              <span className="text-command-subdued uppercase text-[9px]">
                {status === 'critical' ? 'Exhausted' : status === 'warning' ? 'Tired' : 'Fresh'}
              </span>
            </div>
            <ProgressBar value={val} status={status} size="sm" />
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Readiness Posture',
      sortable: true,
      render: (row) => {
        const statusMap = {
          available: 'nominal' as const,
          'on-mission': 'info' as const,
          resting: 'inactive' as const,
          unavailable: 'critical' as const,
        };
        const isNearLimit = row.dutyHoursLast24h >= 10 || row.fatigueIndex >= 75;

        return (
          <div className="space-y-1">
            <StatusBadge
              status={statusMap[row.status]}
              label={row.status.toUpperCase()}
              size="sm"
            />
            {isNearLimit && (
              <div className="flex items-center gap-1 text-[10px] font-mono text-command-warning font-semibold">
                <AlertTriangle className="w-3 h-3 text-command-warning flex-shrink-0" />
                <span>NEAR LIMIT: {row.dutyHoursLast24h}h / 12h MAX</span>
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Summary Metrics Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat
          label="Total Flight Crew"
          value={summary.total.toString()}
          unit="personnel"
          trend="Active roster"
        />
        <Stat
          label="Available For Sorties"
          value={summary.available.toString()}
          unit="pilots"
          trend={`${Math.round((summary.available / summary.total) * 100)}% available`}
        />
        <Stat
          label="Tasked On-Mission"
          value={summary.onMission.toString()}
          unit="aircrew"
          trend="In flight windows"
        />
        <Stat
          label="Nearing Duty Limits"
          value={summary.nearingLimit.toString()}
          unit="warnings"
          trend={summary.nearingLimit > 0 ? 'Requires crew rest rotation' : 'Zero violations'}
        />
        <Stat
          label="Mandatory Rest"
          value={summary.resting.toString()}
          unit="crew"
          trend="12h stand-down window"
        />
      </div>

      {/* 2. Fatigue Chart by Airbase / Squadron */}
      <div className="p-3.5 rounded bg-command-panel/90 border border-command-border/80 shadow-md">
        <div className="flex items-center justify-between pb-2 border-b border-command-border/50">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono font-bold text-xs text-command-heading uppercase">
              Crew Fatigue Index & Peak Duty Hours by Airbase (24h Horizon)
            </span>
          </div>
          <span className="text-[10px] font-mono text-command-subdued hidden sm:inline">
            12h Hard Limit & 75% Fatigue Thresholds Tracked
          </span>
        </div>
        <CrewFatigueChart crew={crewList} bases={bases} />
      </div>

      {/* 3. Filter Controls Bar */}
      <div className="p-3 rounded bg-command-panel/85 border border-command-border/70 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Base Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Base:</span>
            <select
              value={filters.base}
              onChange={(e) => setFilters({ ...filters, base: e.target.value })}
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Bases</option>
              {Object.keys(bases).map((bId) => (
                <option key={bId} value={bId}>
                  {bId} ({bases[bId].name.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Role:</span>
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="Fighter">Fighter Pilots</option>
              <option value="Strike">Strike Officers</option>
              <option value="Recon">Recon Operators</option>
              <option value="Transport">Transport Captains</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Status:</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="on-mission">On-Mission</option>
              <option value="resting">Resting</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          {/* Nearing Limits Toggle Button */}
          <button
            type="button"
            onClick={() => setFilters({ ...filters, nearingLimitsOnly: !filters.nearingLimitsOnly })}
            className={`px-2.5 py-1 rounded border text-xs font-mono font-bold flex items-center gap-1.5 transition-colors ${
              filters.nearingLimitsOnly
                ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                : 'bg-command-bg border-command-border text-command-muted hover:text-command-text'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Nearing Limits Only ({summary.nearingLimit})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-command-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search callsign, qualification..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-8 pr-3 py-1 bg-command-bg border border-command-border rounded text-command-text placeholder-command-subdued focus:outline-none focus:border-command-primary text-xs"
          />
        </div>
      </div>

      {/* 4. Crew Data Table */}
      <div className="bg-command-panel/90 rounded border border-command-border shadow-md overflow-hidden">
        <DataTable<Crew>
          columns={columns}
          data={filteredCrew}
          keyExtractor={(row) => row.id}
          emptyTitle="No aircrew match filter criteria"
          emptyDescription="Try clearing or adjusting role, status, or duty-limit filters."
        />
      </div>
    </div>
  );
};
