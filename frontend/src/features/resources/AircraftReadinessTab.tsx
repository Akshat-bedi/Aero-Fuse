import React, { useState, useMemo } from 'react';
import { Aircraft, Base, Mission, Crew, AircraftType, AircraftStatus } from '@/types';
import { AircraftFilterState } from './types';
import { FleetStatusDonut } from './FleetStatusDonut';
import { BaseFleetBarChart } from './BaseFleetBarChart';
import { AircraftDetailDrawer } from './AircraftDetailDrawer';
import { DataTable, Column, StatusBadge, Stat, ProgressBar } from '@/components/ui';
import {
  Plane,
  Search,
  AlertTriangle,
  Radio,
  Layers,
} from 'lucide-react';

interface AircraftReadinessTabProps {
  aircraft: Record<string, Aircraft>;
  bases: Record<string, Base>;
  missions: Record<string, Mission>;
  crew: Record<string, Crew>;
}

export const AircraftReadinessTab: React.FC<AircraftReadinessTabProps> = ({
  aircraft,
  bases,
  missions,
  crew,
}) => {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);

  const [filters, setFilters] = useState<AircraftFilterState>({
    base: 'all',
    type: 'all',
    status: 'all',
    search: '',
  });

  const aircraftList = useMemo(() => Object.values(aircraft), [aircraft]);

  // Fleet Summary Metrics
  const summary = useMemo(() => {
    const total = aircraftList.length;
    const serviceable = aircraftList.filter((a) => a.status === 'serviceable').length;
    const airborne = aircraftList.filter((a) => a.status === 'airborne').length;
    const maintenance = aircraftList.filter((a) => a.status === 'maintenance').length;
    const unserviceable = aircraftList.filter((a) => a.status === 'unserviceable').length;
    const turnaround = aircraftList.filter((a) => a.status === 'turnaround').length;
    const readyRate = total > 0 ? Math.round(((serviceable + airborne) / total) * 100) : 0;

    return { total, serviceable, airborne, maintenance, unserviceable, turnaround, readyRate };
  }, [aircraftList]);

  // Filtered List for Table
  const filteredAircraft = useMemo(() => {
    return aircraftList.filter((a) => {
      if (filters.base !== 'all' && a.baseId !== filters.base) return false;
      if (filters.type !== 'all' && a.type !== filters.type) return false;
      if (filters.status !== 'all' && a.status !== filters.status) return false;
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matchesTail = a.tailNumber.toLowerCase().includes(query);
        const matchesCallsign = a.callsign?.toLowerCase().includes(query);
        const matchesId = a.id.toLowerCase().includes(query);
        if (!matchesTail && !matchesCallsign && !matchesId) return false;
      }
      return true;
    });
  }, [aircraftList, filters]);

  // Table Columns
  const columns: Column<Aircraft>[] = [
    {
      key: 'tailNumber',
      label: 'Tail Number',
      sortable: true,
      render: (row) => (
        <div className="font-mono font-bold text-command-primary flex items-center gap-1.5">
          <Plane className="w-3.5 h-3.5 text-command-primary flex-shrink-0" />
          <span>{row.tailNumber}</span>
          <span className="text-[10px] text-command-muted font-normal">({row.id})</span>
        </div>
      ),
    },
    {
      key: 'callsign',
      label: 'Callsign',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-command-text">
          {row.callsign || <em className="text-command-subdued">RESERVE</em>}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Airframe Type',
      sortable: true,
      render: (row) => (
        <span className="px-1.5 py-0.5 rounded-[1px] bg-command-bg border border-command-border/60 text-[10px] font-mono font-semibold text-command-text">
          {row.type}
        </span>
      ),
    },
    {
      key: 'baseId',
      label: 'Home Base',
      sortable: true,
      render: (row) => {
        const base = bases[row.baseId];
        return (
          <div className="font-mono text-xs">
            <span className="font-bold text-command-heading">{row.baseId}</span>
            <span className="text-[10px] text-command-subdued ml-1 hidden sm:inline">
              ({base?.name?.split(' ')[0] || 'Base'})
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => {
        const statusMap = {
          serviceable: 'nominal' as const,
          airborne: 'info' as const,
          turnaround: 'info' as const,
          maintenance: 'warning' as const,
          unserviceable: 'critical' as const,
        };
        return (
          <StatusBadge
            status={statusMap[row.status]}
            label={row.status.toUpperCase()}
            size="sm"
          />
        );
      },
    },
    {
      key: 'fuelPct',
      label: 'Fuel State',
      sortable: true,
      render: (row) => (
        <div className="w-24 space-y-0.5">
          <div className="flex justify-between text-[10px] font-mono">
            <span
              className={
                row.fuelPct <= 25
                  ? 'text-command-critical font-bold'
                  : row.fuelPct <= 45
                  ? 'text-command-warning font-bold'
                  : 'text-command-nominal'
              }
            >
              {row.fuelPct}%
            </span>
            <span className="text-command-subdued">
              {Math.round((row.fuelPct / 100) * 4800)}kg
            </span>
          </div>
          <ProgressBar
            value={row.fuelPct}
            status={row.fuelPct <= 25 ? 'critical' : row.fuelPct <= 45 ? 'warning' : 'nominal'}
            size="sm"
          />
        </div>
      ),
    },
    {
      key: 'flightHoursToNextService',
      label: 'Hours to Maint',
      sortable: true,
      render: (row) => {
        const hrs = row.flightHoursToNextService;
        const isLow = hrs <= 20;
        return (
          <div className="flex items-center gap-1 font-mono text-xs">
            {isLow && <AlertTriangle className="w-3 h-3 text-command-warning" />}
            <span className={isLow ? 'text-command-warning font-bold' : 'text-command-text'}>
              {hrs.toFixed(1)} hrs
            </span>
          </div>
        );
      },
    },
    {
      key: 'weaponLoad',
      label: 'Weapon Loadout',
      render: (row) => {
        if (!row.weaponLoad || row.weaponLoad.length === 0) {
          return <span className="text-[10px] text-command-subdued italic">Clean / Unarmed</span>;
        }
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {row.weaponLoad.map((w, idx) => (
              <span
                key={idx}
                className="px-1 py-0.5 rounded-[1px] bg-command-panel text-[10px] font-mono border border-command-border/50 text-command-text"
              >
                {w.quantity}x {w.weaponType.replace('GENERIC-', '')}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'assignedMissionId',
      label: 'Assigned Sortie',
      render: (row) => {
        if (!row.assignedMissionId) {
          return <span className="text-[10px] text-command-subdued">Alert Reserve</span>;
        }
        const m = missions[row.assignedMissionId];
        return (
          <div className="font-mono text-xs">
            <span className="font-bold text-command-primary">{row.assignedMissionId}</span>
            <p className="text-[10px] text-command-muted truncate max-w-[120px] font-sans">
              {m?.name || 'Assigned'}
            </p>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Fleet Summary Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat
          label="Total Fleet Hulls"
          value={summary.total.toString()}
          unit="airframes"
          trend="All inventory"
        />
        <Stat
          label="Fleet Readiness"
          value={`${summary.readyRate}%`}
          unit="operable"
          trend={`${summary.serviceable + summary.airborne} ready`}
        />
        <Stat
          label="Airborne Sorties"
          value={summary.airborne.toString()}
          unit="airborne"
          trend="Active air tracks"
        />
        <Stat
          label="Scheduled Maintenance"
          value={summary.maintenance.toString()}
          unit="hangared"
          trend="Phased inspections"
        />
        <Stat
          label="Unserviceable (AOG)"
          value={summary.unserviceable.toString()}
          unit="AOG"
          trend="Requires repair"
        />
      </div>

      {/* 2. Visualizations Grid (ECharts Donut & Per-Base Stacked Bar) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5 p-3 rounded-[1px] bg-command-panel border border-command-border">
          <div className="flex items-center gap-2 pb-2 border-b border-command-border/50">
            <Radio className="w-3.5 h-3.5 text-command-primary" />
            <span className="font-mono font-bold text-xs text-command-heading uppercase">
              Fleet Readiness Distribution
            </span>
          </div>
          <FleetStatusDonut aircraft={aircraftList} />
        </div>

        <div className="lg:col-span-7 p-3 rounded-[1px] bg-command-panel border border-command-border">
          <div className="flex items-center gap-2 pb-2 border-b border-command-border/50">
            <Layers className="w-3.5 h-3.5 text-command-secondary" />
            <span className="font-mono font-bold text-xs text-command-heading uppercase">
              Per-Base Airframe Stationing & Status
            </span>
          </div>
          <BaseFleetBarChart aircraft={aircraftList} bases={bases} />
        </div>
      </div>

      {/* 3. Filter Controls Bar */}
      <div className="p-2.5 rounded-[1px] bg-command-panel border border-command-border flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Base Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Base:</span>
            <select
              aria-label="Filter by base"
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

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Type:</span>
            <select
              aria-label="Filter by type"
              value={filters.type}
              onChange={(e) =>
                setFilters({ ...filters, type: e.target.value as AircraftType | 'all' })
              }
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="Fighter-A">Fighter-A</option>
              <option value="Strike-B">Strike-B</option>
              <option value="Transport-C">Transport-C</option>
              <option value="Recon-D">Recon-D</option>
              <option value="Helicopter-E">Helicopter-E</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-command-bg px-2 py-1 rounded-[1px] border border-command-border">
            <span className="text-[10px] text-command-muted uppercase">Status:</span>
            <select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value as AircraftStatus | 'all' })
              }
              className="bg-transparent text-command-text focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="serviceable">Serviceable</option>
              <option value="airborne">Airborne</option>
              <option value="turnaround">Turnaround</option>
              <option value="maintenance">Maintenance</option>
              <option value="unserviceable">Unserviceable</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-command-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tail, callsign, ID..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-8 pr-3 py-1 bg-command-bg border border-command-border rounded-[1px] text-command-text placeholder-command-subdued focus:outline-none focus:border-command-primary text-xs"
          />
        </div>
      </div>

      {/* 4. Interactive Sortable Data Table */}
      <div className="bg-command-panel rounded-[1px] border border-command-border overflow-hidden">
        <DataTable<Aircraft>
          columns={columns}
          data={filteredAircraft}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => setSelectedAircraft(row)}
          selectedId={selectedAircraft?.id}
          emptyTitle="No matching airframes"
          emptyDescription="No aircraft found matching the selected base, type, or status filters."
        />
      </div>

      {/* 5. Detail Maintenance Forecast Drawer */}
      {selectedAircraft && (
        <AircraftDetailDrawer
          aircraft={selectedAircraft}
          onClose={() => setSelectedAircraft(null)}
          bases={bases}
          missions={missions}
          crew={crew}
        />
      )}
    </div>
  );
};
