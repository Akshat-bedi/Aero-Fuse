import React, { useState } from 'react';
import {
  Button,
  Panel,
  StatusBadge,
  PriorityTag,
  Modal,
  ConfirmDialog,
  Tabs,
  Tooltip,
  DataTable,
  Column,
  ProgressBar,
  Skeleton,
  EmptyState,
  KeyValue,
  KeyValueList,
  Stat,
} from '@/components/ui';
import { useOpsStore } from '@/store';
import {
  Plane,
  Shield,
  AlertTriangle,
  Info,
  Fuel,
  Send,
  Zap,
  RotateCcw,
  Sliders,
  Terminal,
} from 'lucide-react';
import { AircraftType, OperationalStatus } from '@/types';

interface SampleAircraftRow extends Record<string, unknown> {
  id: string;
  callsign: string;
  type: AircraftType;
  base: string;
  status: OperationalStatus;
  statusText: string;
  fuelPct: number;
}

const SAMPLE_AIRCRAFT_DATA: SampleAircraftRow[] = [
  {
    id: 'AC-101',
    callsign: 'VAPOR-11',
    type: 'Fighter-A',
    base: 'Sector Alpha FOB',
    status: 'nominal',
    statusText: 'SERVICEABLE',
    fuelPct: 92,
  },
  {
    id: 'AC-102',
    callsign: 'VAPOR-12',
    type: 'Fighter-A',
    base: 'Sector Alpha FOB',
    status: 'critical',
    statusText: 'UNSERVICEABLE',
    fuelPct: 18,
  },
  {
    id: 'AC-204',
    callsign: 'GHOST-01',
    type: 'Recon-D',
    base: 'Highland Station Delta',
    status: 'nominal',
    statusText: 'AIRBORNE',
    fuelPct: 76,
  },
  {
    id: 'AC-305',
    callsign: 'TITAN-44',
    type: 'Transport-C',
    base: 'North Bastion Airbase',
    status: 'warning',
    statusText: 'MAINTENANCE DEGRADED',
    fuelPct: 42,
  },
  {
    id: 'AC-501',
    callsign: 'CONDOR-88',
    type: 'Helicopter-E',
    base: 'Sector Alpha FOB',
    status: 'inactive',
    statusText: 'HANGAR RESERVE',
    fuelPct: 100,
  },
];

export const ComponentGalleryPage: React.FC = () => {
  const addToast = useOpsStore((state) => state.addToast);

  // Component local states for interactive testing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [lastActionMessage, setLastActionMessage] = useState<string>('Ready for operator interaction');
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSegmentTab, setActiveSegmentTab] = useState('day');
  const [selectedAircraft, setSelectedAircraft] = useState<string | undefined>('AC-101');
  const [progressVal, setProgressVal] = useState(65);

  const aircraftColumns: Column<SampleAircraftRow>[] = [
    {
      key: 'callsign',
      label: 'Callsign',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-command-primary">
          {row.callsign}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-command-text">{row.type}</span>
      ),
    },
    {
      key: 'base',
      label: 'Station Base',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Operational Status',
      sortable: true,
      render: (row) => (
        <StatusBadge status={row.status} label={row.statusText} size="sm" />
      ),
    },
    {
      key: 'fuelPct',
      label: 'Fuel Endurance',
      sortable: true,
      align: 'right',
      width: '180px',
      render: (row) => (
        <div className="w-36 ml-auto">
          <ProgressBar value={row.fuelPct} size="sm" showValue />
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
      {/* Gallery Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-command-border/80 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold uppercase tracking-wider text-command-heading">
              UI Design System & Component Gallery
            </h1>
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-cyan-950 border border-cyan-500 text-cyan-300 font-bold">
              STAGE 1
            </span>
          </div>
          <p className="text-xs text-command-muted font-sans mt-0.5">
            Command Centre design system specifications, accessibility tokens, and interactive component test suite.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs bg-command-panel px-3 py-1.5 rounded border border-command-border">
          <Terminal className="w-3.5 h-3.5 text-command-primary" />
          <span className="text-command-muted">Last Action:</span>
          <span className="text-command-primary font-semibold truncate max-w-xs">{lastActionMessage}</span>
        </div>
      </div>

      {/* 1. BUTTONS (Variants & Safety-Critical Confirm) */}
      <Panel
        title="1. Button System & Safety-Critical Confirm Variant"
        subtitle="Variants: Primary, Secondary, Danger, Ghost, and Click-to-Confirm"
        variant="panel"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              size="md"
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => {
                setLastActionMessage('Primary Button Clicked');
                addToast({ type: 'info', title: 'Primary Button', message: 'Triggered primary action' });
              }}
            >
              Primary Action
            </Button>

            <Button
              variant="secondary"
              size="md"
              icon={<Sliders className="w-3.5 h-3.5" />}
              onClick={() => setLastActionMessage('Secondary Button Clicked')}
            >
              Secondary Action
            </Button>

            <Button
              variant="danger"
              size="md"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              onClick={() => setLastActionMessage('Danger Button Clicked')}
            >
              Danger Action
            </Button>

            <Button
              variant="ghost"
              size="md"
              onClick={() => setLastActionMessage('Ghost Button Clicked')}
            >
              Ghost Action
            </Button>

            <Button variant="primary" size="md" isLoading>
              Loading State
            </Button>

            <Button variant="primary" size="md" disabled>
              Disabled State
            </Button>
          </div>

          {/* Safety Critical Confirm Button Variant */}
          <div className="p-3.5 rounded border border-command-warning/40 bg-command-warning-bg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                Safety-Critical Inline Confirmation
              </h4>
              <p className="text-[11px] text-amber-200/80 mt-0.5 font-sans">
                Prevents accidental clicks: First click initiates confirmation state. Second click within 3.5s executes the action.
              </p>
            </div>

            <Button
              variant="danger"
              size="md"
              requireConfirm
              confirmText="CONFIRM DESTRUCTIVE RETASK?"
              onClick={() => {
                setLastActionMessage('Destructive Retask Confirmed via 2-Click Safety Guard!');
                addToast({
                  type: 'critical',
                  title: 'Critical Action Executed',
                  message: 'Commander two-click inline confirmation verified.',
                });
              }}
            >
              Scrub Mission Sortie
            </Button>
          </div>
        </div>
      </Panel>

      {/* 2. SEMANTIC STATUS BADGES & PRIORITY TAGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="2. Semantic Status Badges (Never Colour Alone)"
          subtitle="Mandatory status colors paired with matching Lucide icons AND text labels"
          variant="panel"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5 items-center">
              <StatusBadge status="nominal" />
              <StatusBadge status="warning" />
              <StatusBadge status="critical" />
              <StatusBadge status="info" />
              <StatusBadge status="inactive" />
              <StatusBadge status="critical" label="LIVE INTERCEPTION" pulse />
            </div>
            <div className="text-[11px] text-command-muted font-sans pt-1">
              Small size variant:
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <StatusBadge status="nominal" size="sm" />
              <StatusBadge status="warning" size="sm" />
              <StatusBadge status="critical" size="sm" />
              <StatusBadge status="info" size="sm" />
              <StatusBadge status="inactive" size="sm" />
            </div>
          </div>
        </Panel>

        <Panel
          title="3. Priority Tags (P1 to P4)"
          subtitle="Mission urgency and dispatch order hierarchy"
          variant="panel"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5 items-center">
              <PriorityTag priority="P1" />
              <PriorityTag priority="P2" />
              <PriorityTag priority="P3" />
              <PriorityTag priority="P4" />
            </div>
            <div className="text-[11px] text-command-muted font-sans pt-1">
              Compact icon-only / small variants:
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <PriorityTag priority="P1" showDescription={false} size="sm" />
              <PriorityTag priority="P2" showDescription={false} size="sm" />
              <PriorityTag priority="P3" showDescription={false} size="sm" />
              <PriorityTag priority="P4" showDescription={false} size="sm" />
            </div>
          </div>
        </Panel>
      </div>

      {/* 3. MODALS & SAFETY-CRITICAL CONFIRM DIALOG */}
      <Panel
        title="4. Modals & Safety-Critical ConfirmDialog"
        subtitle="Accessible dialogs with keyboard Escape listener, focus lock, and explicit risk warnings"
        variant="panel"
      >
        <div className="flex flex-wrap gap-3 items-center">
          <Button
            variant="secondary"
            size="md"
            onClick={() => setIsModalOpen(true)}
          >
            Open Standard Modal
          </Button>

          <Button
            variant="danger"
            size="md"
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            onClick={() => setIsConfirmOpen(true)}
          >
            Trigger Safety Confirmation Dialog
          </Button>
        </div>

        {/* Standard Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Airbase Operational Briefing"
          subtitle="Sector Alpha FOB · Current Weather & Force Posture"
          footer={
            <>
              <Button variant="ghost" size="md" onClick={() => setIsModalOpen(false)}>
                Dismiss
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setIsModalOpen(false);
                  addToast({ type: 'nominal', title: 'Acknowledged', message: 'Briefing noted in shift log' });
                }}
              >
                Acknowledge Briefing
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-command-text/90 leading-relaxed font-sans">
              Runway 09/27 surface temperature is 24°C with dry braking action reported. Current CAP flights VAPOR-11 and VAPOR-12 are maintaining station with 82% mission availability.
            </p>
            <KeyValueList>
              <KeyValue label="Airbase Code" value="ALPH" />
              <KeyValue label="Runway Posture" value="OPEN" statusColor="nominal" />
              <KeyValue label="Aviation Fuel Depots" value="420,000 kg (84%)" statusColor="nominal" />
              <KeyValue label="Threat Condition" value="THREAT LEVEL AMBER" statusColor="warning" />
            </KeyValueList>
          </div>
        </Modal>

        {/* Safety Confirm Dialog */}
        <ConfirmDialog
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          title="Authorize Emergency CAP Retasking"
          description="You are directing Fighter-A (VAPOR-11) to divert from sovereign Sector Alpha patrol orbit to reinforce contested CAP Point North."
          riskWarning="Executing this retasking reduces Sector Alpha FOB ready alert airframes from 2 to 1 and increases fuel burn by approx. 850kg."
          confirmLabel="AUTHORIZE RETASK"
          confirmVariant="danger"
          severity="critical"
          onConfirm={() => {
            setIsConfirmOpen(false);
            setLastActionMessage('Commander Authorized Emergency CAP Retasking');
            addToast({
              type: 'critical',
              title: 'Commander Directive Logged',
              message: 'Retasking order REC-901 executed and broadcast to tactical datalink.',
            });
          }}
        />
      </Panel>

      {/* 4. TABS & TOOLTIPS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="5. Tabs Component (Underline & Segmented)"
          subtitle="Tab panels with active indicator lines and badge counters"
          variant="panel"
        >
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-mono uppercase text-command-muted mb-1.5 block">
                Underline Style:
              </span>
              <Tabs
                tabs={[
                  { id: 'overview', label: 'Airspace Overview', badge: 'Active' },
                  { id: 'sorties', label: 'Sortie Schedule', badge: 8 },
                  { id: 'maintenance', label: 'Maintenance Queue', badge: 2 },
                ]}
                activeTab={activeTab}
                onChange={(id) => setActiveTab(id)}
              />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase text-command-muted mb-1.5 block">
                Segmented Filter Style:
              </span>
              <Tabs
                variant="segmented"
                size="sm"
                tabs={[
                  { id: 'day', label: 'Day Shift' },
                  { id: 'night', label: 'Night Shift' },
                  { id: 'all24', label: 'Full 24H Cycle' },
                ]}
                activeTab={activeSegmentTab}
                onChange={(id) => setActiveSegmentTab(id)}
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="6. Tooltip System with Hotkey Badges"
          subtitle="Tactical hover and focus micro-tooltips"
          variant="panel"
        >
          <div className="flex flex-wrap gap-4 items-center pt-2">
            <Tooltip content="Execute Tactical Air Refueling" shortcut="Ctrl+R" position="top">
              <Button variant="secondary" size="md">
                Hover Top (Ctrl+R)
              </Button>
            </Tooltip>

            <Tooltip content="Acknowledge Master Warning" shortcut="Esc" position="bottom">
              <Button variant="secondary" size="md">
                Hover Bottom (Esc)
              </Button>
            </Tooltip>

            <Tooltip content="Engage Datalink Sync" position="left">
              <Button variant="ghost" size="md">
                Hover Left
              </Button>
            </Tooltip>

            <Tooltip content="Inspect Radar Contact" position="right">
              <Button variant="ghost" size="md">
                Hover Right
              </Button>
            </Tooltip>
          </div>
        </Panel>
      </div>

      {/* 5. DATA TABLE (Sortable & Interactive) */}
      <Panel
        title="7. Sortable DataTable Component"
        subtitle="Click headers to sort ascending/descending. Click any row to select airframe."
        variant="raised"
      >
        <div className="space-y-3">
          <DataTable
            columns={aircraftColumns}
            data={SAMPLE_AIRCRAFT_DATA}
            keyExtractor={(row) => row.id}
            selectedId={selectedAircraft}
            onRowClick={(row) => {
              setSelectedAircraft(row.id);
              setLastActionMessage(`Selected ${row.callsign} (${row.type})`);
            }}
          />

          <div className="text-right text-[11px] font-mono text-command-muted">
            Selected Airframe ID: <span className="text-command-primary font-bold">{selectedAircraft || 'NONE'}</span>
          </div>
        </div>
      </Panel>

      {/* 6. PROGRESS BARS, TOASTS & STAT TILES */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Progress Bar Demo */}
        <Panel
          title="8. ProgressBar & Safety Thresholds"
          subtitle="Dynamic fuel and endurance threshold indicators"
          variant="panel"
        >
          <div className="space-y-4">
            <ProgressBar
              label="Fuel Tanker-1 Reserve"
              sublabel="ALPH Depot"
              value={progressVal}
              unit="%"
            />

            <ProgressBar
              label="Critical Fuel Alert"
              sublabel="Bingo Threshold"
              value={18}
              status="critical"
              unit="%"
            />

            <ProgressBar
              label="Ready Reserve Munitions"
              sublabel="Hardpoint Stores"
              value={92}
              status="nominal"
              unit="%"
            />

            <div className="flex items-center gap-2 pt-2 border-t border-command-border/40">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setProgressVal((p) => Math.max(10, p - 15))}
              >
                Burn Fuel (-15%)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setProgressVal((p) => Math.min(100, p + 15))}
              >
                Refuel (+15%)
              </Button>
            </div>
          </div>
        </Panel>

        {/* Toast Notification Triggers */}
        <Panel
          title="9. Toast Notification System"
          subtitle="Click to test each operational notification tier"
          variant="panel"
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Shield className="w-3.5 h-3.5 text-command-nominal" />}
              onClick={() =>
                addToast({
                  type: 'nominal',
                  title: 'Sortie Landed Safely',
                  message: 'Fighter-A (VAPOR-11) safely down at Sector Alpha FOB.',
                })
              }
            >
              Nominal Toast
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<AlertTriangle className="w-3.5 h-3.5 text-command-warning" />}
              onClick={() =>
                addToast({
                  type: 'warning',
                  title: 'Crosswind Advisory',
                  message: 'North Bastion runway gusts exceeding standard limits.',
                })
              }
            >
              Warning Toast
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<AlertTriangle className="w-3.5 h-3.5 text-command-critical" />}
              onClick={() =>
                addToast({
                  type: 'critical',
                  title: 'Hostile Radar Track',
                  message: 'Unidentified pop-up contact bearing 045 at 32 NM.',
                })
              }
            >
              Critical Toast
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<Info className="w-3.5 h-3.5 text-command-primary" />}
              onClick={() =>
                addToast({
                  type: 'info',
                  title: 'ATO Cycle Synchronized',
                  message: 'Cycle 2026-10-B loaded into mission repository.',
                })
              }
            >
              Info Toast
            </Button>
          </div>
        </Panel>

        {/* KeyValue List Demo */}
        <Panel
          title="10. KeyValue Rows (Monospace Telemetry)"
          subtitle="High density telemetry readouts"
          variant="panel"
        >
          <KeyValueList>
            <KeyValue label="Fighter-A Callsign" value="VAPOR-11" copyable />
            <KeyValue label="Station Coordinates" value="32.45°N 15.67°E" isMono copyable />
            <KeyValue label="Altimeter FL" value="FL 280" />
            <KeyValue label="Fuel Bingo State" value="NOMINAL (92%)" statusColor="nominal" />
            <KeyValue label="IFF Transponder" value="MODE-5 / ACTIVE" statusColor="info" />
            <KeyValue label="Tactical Datalink" value="LINK-16 ENCRYPTED" statusColor="nominal" />
          </KeyValueList>
        </Panel>
      </div>

      {/* 7. STAT TILES WITH TRENDS */}
      <Panel
        title="11. Stat Tiles (Metrics + Trend Analysis)"
        subtitle="Command dashboard high-level operational indicators"
        variant="panel"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Serviceable Airframes"
            value="42"
            unit="airframes"
            status="nominal"
            trend={{ direction: 'up', value: '+3 ready airframes', isPositive: true }}
            subtitle="87.5% fleet operational readiness"
            icon={<Plane className="w-4 h-4" />}
          />

          <Stat
            label="Airspace Violations"
            value="1"
            unit="contact"
            status="critical"
            trend={{ direction: 'up', value: 'New radar spike', isPositive: false }}
            subtitle="Sector North Buffer boundary"
            icon={<AlertTriangle className="w-4 h-4" />}
          />

          <Stat
            label="Avg Retask Compute"
            value="1.8"
            unit="sec"
            status="info"
            trend={{ direction: 'down', value: '-0.4s optimization', isPositive: true }}
            subtitle="Decision-support AI solver"
            icon={<Zap className="w-4 h-4" />}
          />

          <Stat
            label="Aviation Fuel Reserve"
            value="1.01M"
            unit="kg"
            status="nominal"
            trend={{ direction: 'neutral', value: 'Stable across bases' }}
            subtitle="Sufficient for 34 days active ops"
            icon={<Fuel className="w-4 h-4" />}
          />
        </div>
      </Panel>

      {/* 8. SKELETON LOADERS & EMPTY STATES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="12. Skeleton Loaders"
          subtitle="Non-intrusive loading indicators for telemetry and table cards"
          variant="panel"
        >
          <div className="space-y-3">
            <Skeleton variant="card" />
            <Skeleton variant="text" lines={3} />
          </div>
        </Panel>

        <Panel
          title="13. EmptyState Component"
          subtitle="Tactical empty state for cleared views or empty filters"
          variant="panel"
        >
          <EmptyState
            title="No Contested Airspace Incursions"
            description="All military flight corridors are cleared and sovereign borders are under nominal radar surveillance."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={() => setLastActionMessage('Refreshed radar surveillance radar filters')}
              >
                Refresh Radar Filter
              </Button>
            }
          />
        </Panel>
      </div>
    </div>
  );
};
