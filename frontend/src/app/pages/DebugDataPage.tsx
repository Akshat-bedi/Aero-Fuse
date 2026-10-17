import React, { useState } from 'react';
import {
  useEntitiesStore,
  useRecommendationsStore,
  useEventsStore,
  useAuditStore,
} from '@/store';
import { dataService } from '@/services';
import {
  Panel,
  Button,
  StatusBadge,
  Stat,
  Tabs,
} from '@/components/ui';
import {
  Play,
  FastForward,
  AlertOctagon,
  Flame,
  CloudRain,
  UserX,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { OpsEventType } from '@/types';

export const DebugDataPage: React.FC = () => {
  const {
    bases,
    aircraft,
    crew,
    missions,
    airspace,
    threats,
    weather,
    weaponStocks,
    predictions,
    simTime,
    speedMultiplier,
    lastUpdated,
  } = useEntitiesStore();

  const {
    recommendations,
    updateRecommendationStatus,
  } = useRecommendationsStore();

  const { events } = useEventsStore();
  const { entries: auditEntries } = useAuditStore();

  const [activeJsonTab, setActiveJsonTab] = useState<string>('aircraft');
  const [copied, setCopied] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('AC-01');
  const [isInjecting, setIsInjecting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('Engine running and ready');
  const [mockConflicts, setMockConflicts] = useState<boolean>(() => {
    return dataService.getIsMockConflictsEnabled ? dataService.getIsMockConflictsEnabled() : false;
  });

  const handleToggleConflicts = () => {
    const next = !mockConflicts;
    if (dataService.setMockConflictsEnabled) {
      dataService.setMockConflictsEnabled(next);
    }
    setMockConflicts(next);
    setFeedbackMsg(
      `Conflict demo layer ${next ? 'ACTIVATED (M-11..M-14 loaded)' : 'DEACTIVATED (Clean baseline M-01..M-10)'}`,
    );
  };

  const baseList = Object.values(bases);
  const aircraftList = Object.values(aircraft);
  const crewList = Object.values(crew);
  const missionList = Object.values(missions);
  const threatList = Object.values(threats);
  const recList = Object.values(recommendations);

  const airborneCount = aircraftList.filter((a) => a.status === 'airborne').length;
  const inProgressMissions = missionList.filter((m) => m.status === 'in-progress').length;
  const pendingRecs = recList.filter((r) => r.status === 'pending');

  const handleSpeedChange = (mult: 1 | 5 | 20) => {
    dataService.setSpeedMultiplier(mult);
    setFeedbackMsg(`Simulation speed adjusted to ${mult}x`);
  };

  const handleInject = async (type: OpsEventType, payload: Record<string, unknown>, desc: string) => {
    setIsInjecting(true);
    try {
      const created = await dataService.injectEvent({
        type,
        payload,
        description: desc,
        severity: 'critical',
      });
      setFeedbackMsg(`Injected ${type} (ID: ${created.id}). Optimiser evaluated recommendation.`);
    } catch (err) {
      setFeedbackMsg(`Injection failed: ${String(err)}`);
    } finally {
      setIsInjecting(false);
    }
  };

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const updated = await dataService.decideRecommendation(id, decision);
      updateRecommendationStatus(id, decision);
      setFeedbackMsg(`Commander ${decision.toUpperCase()} recommendation ${updated.id}. State updated.`);
    } catch (err) {
      setFeedbackMsg(`Decision failed: ${String(err)}`);
    }
  };

  const getActiveJsonData = () => {
    switch (activeJsonTab) {
      case 'bases':
        return bases;
      case 'aircraft':
        return aircraft;
      case 'crew':
        return crew;
      case 'missions':
        return missions;
      case 'airspace':
        return airspace;
      case 'threats':
        return threats;
      case 'recommendations':
        return recommendations;
      case 'events':
        return events;
      case 'audit':
        return auditEntries;
      case 'weather':
        return weather;
      case 'weapons':
        return weaponStocks;
      case 'predictions':
        return predictions;
      default:
        return {
          simTime,
          speedMultiplier,
          basesCount: baseList.length,
          aircraftCount: aircraftList.length,
          crewCount: crewList.length,
          missionsCount: missionList.length,
          threatsCount: threatList.length,
        };
    }
  };

  const jsonString = JSON.stringify(getActiveJsonData(), null, 2);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-command-border/80 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold uppercase tracking-wider text-command-heading">
              Operational Data Engine Telemetry & Debug Console
            </h1>
            <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-command-raised border border-command-border text-command-primary font-bold">
              /dev/data
            </span>
            <StatusBadge status="nominal" label="STORE SYNC ACTIVE" size="sm" pulse />
          </div>
          <p className="text-xs text-command-muted font-sans mt-0.5">
            Stage 2 integration validation verifying live simulation movement, event injection, deterministic retasking, and normalized Zustand stores.
          </p>
        </div>

        {/* Speed Controls & Sim Clock */}
        <div className="flex items-center gap-3 bg-command-panel px-3 py-1.5 rounded border border-command-border font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-command-muted">SIM TIME:</span>
            <span className="text-command-primary font-bold">
              {simTime ? new Date(simTime).toISOString().substring(11, 19) + 'Z' : '—'}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-command-bg p-0.5 rounded border border-command-border">
            <button
              type="button"
              onClick={() => handleSpeedChange(1)}
              className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
                speedMultiplier === 1
                  ? 'bg-command-primary text-black'
                  : 'text-command-muted hover:text-command-text'
              }`}
            >
              <Play className="w-2.5 h-2.5 inline mr-0.5" /> 1x
            </button>
            <button
              type="button"
              onClick={() => handleSpeedChange(5)}
              className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
                speedMultiplier === 5
                  ? 'bg-command-primary text-black'
                  : 'text-command-muted hover:text-command-text'
              }`}
            >
              <FastForward className="w-2.5 h-2.5 inline mr-0.5" /> 5x
            </button>
            <button
              type="button"
              onClick={() => handleSpeedChange(20)}
              className={`px-2 py-0.5 text-[10px] rounded font-bold transition-colors ${
                speedMultiplier === 20
                  ? 'bg-command-warning text-black'
                  : 'text-command-muted hover:text-command-text'
              }`}
            >
              <FastForward className="w-2.5 h-2.5 inline mr-0.5" /> 20x
            </button>
          </div>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div className="p-2.5 rounded bg-command-panel border border-command-border/80 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-command-primary animate-pulse" />
          <span className="text-command-muted">Engine Status:</span>
          <span className="text-command-heading font-medium">{feedbackMsg}</span>
        </div>
        <span className="text-[10px] text-command-subdued">
          Last Snapshot Sync: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'connecting...'}
        </span>
      </div>

      {/* Planted Conflict Demo Layer Toggle */}
      <div className="p-3 rounded bg-command-panel border border-command-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded ${
              mockConflicts
                ? 'bg-amber-950/60 border border-amber-600/60 text-amber-400'
                : 'bg-emerald-950/60 border border-emerald-600/60 text-emerald-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-command-heading uppercase tracking-wide">
                Planted Conflict Demo Layer
              </span>
              <StatusBadge
                status={mockConflicts ? 'warning' : 'nominal'}
                label={mockConflicts ? 'DEMO CONFLICTS ACTIVE (M-11..M-14)' : 'CLEAN BASELINE (M-01..M-10)'}
                size="sm"
              />
            </div>
            <p className="text-[11px] text-command-muted font-sans mt-0.5">
              {mockConflicts
                ? 'Planted conflicts loaded: AC-04/CR-04 double booking on M-06/M-13, AC-09 turnaround on M-07/M-14, CR-08 duty breach on M-11, AC-23 airframe type mismatch on M-11.'
                : '100% conflict-free operational baseline: all sorties green, zero double-bookings, zero duty breaches, zero type mismatches.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={mockConflicts ? 'danger' : 'primary'}
            size="sm"
            onClick={handleToggleConflicts}
          >
            {mockConflicts ? 'Disable Conflict Demo' : 'Enable Conflict Demo'}
          </Button>
        </div>
      </div>

      {/* State Counts Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Stat
          label="Air Bases"
          value={baseList.length}
          unit="FOBs"
          status="nominal"
          subtitle="4 sovereign stations"
        />
        <Stat
          label="Total Fleet"
          value={aircraftList.length}
          unit="airframes"
          status={airborneCount > 0 ? 'info' : 'nominal'}
          subtitle={`${airborneCount} currently airborne`}
        />
        <Stat
          label="Rostered Crew"
          value={crewList.length}
          unit="personnel"
          status="nominal"
          subtitle="Pilots, WSOs, Navs"
        />
        <Stat
          label="Missions (ATO)"
          value={missionList.length}
          unit="sorties"
          status="nominal"
          subtitle={`${inProgressMissions} sorties in-progress`}
        />
        <Stat
          label="Active Threats"
          value={threatList.length}
          unit="contacts"
          status="critical"
          subtitle="1 SAM, 1 CAP, 1 Radar"
        />
        <Stat
          label="Recommendations"
          value={recList.length}
          unit="proposals"
          status={pendingRecs.length > 0 ? 'warning' : 'nominal'}
          subtitle={`${pendingRecs.length} pending approval`}
        />
      </div>

      {/* Interactive Controls & Event Injector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Event Injector */}
        <Panel
          title="Live Operational Event Injector"
          subtitle="Inject disruptions to trigger MockRetaskEngine optimization rules"
          variant="raised"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Unserviceable Aircraft Injector */}
              <div className="p-3 bg-command-bg rounded border border-command-border flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-command-critical">
                    <AlertOctagon className="w-3.5 h-3.5" />
                    <span>Aircraft Unserviceable</span>
                  </div>
                  <p className="text-[11px] text-command-muted mt-1">
                    Flags an airframe as unserviceable. If assigned to an active mission, forces immediate airframe swap.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={selectedAircraftId}
                    onChange={(e) => setSelectedAircraftId(e.target.value)}
                    className="bg-command-panel border border-command-border rounded px-2 py-1 text-xs font-mono text-command-heading flex-1"
                  >
                    {aircraftList.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.tailNumber} ({a.type} - {a.status})
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isInjecting}
                    onClick={() =>
                      handleInject(
                        'AIRCRAFT_UNSERVICEABLE',
                        {
                          aircraftId: selectedAircraftId,
                          reason: 'Hydraulic actuator pressure loss on station 2',
                        },
                        `Airframe ${selectedAircraftId} reported critical hydraulic anomaly`,
                      )
                    }
                  >
                    Inject
                  </Button>
                </div>
              </div>

              {/* Base Closed Injector */}
              <div className="p-3 bg-command-bg rounded border border-command-border flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-command-warning">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span>Runway Closure / Weather</span>
                  </div>
                  <p className="text-[11px] text-command-muted mt-1">
                    Forces runway closure at North Bastion Strike Base (BASE-B). Evaluates diversion for all recovering sorties.
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isInjecting}
                  onClick={() =>
                    handleInject(
                      'BASE_CLOSED',
                      {
                        baseId: 'BASE-B',
                        reason: 'Crosswind 38kts exceeding safe landing envelope',
                      },
                      'North Bastion runway closed due to severe crosswinds',
                    )
                  }
                >
                  Close Base Bravo (BASE-B)
                </Button>
              </div>

              {/* Threat Contact Injector */}
              <div className="p-3 bg-command-bg rounded border border-command-border flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-command-critical">
                    <Flame className="w-3.5 h-3.5" />
                    <span>Threat Contact Detected</span>
                  </div>
                  <p className="text-[11px] text-command-muted mt-1">
                    Spikes new pop-up SAM site near Contested Hub Oscar. Evaluates Route C dogleg bypass for ingress packages.
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isInjecting}
                  onClick={() =>
                    handleInject(
                      'THREAT_DETECTED',
                      {
                        threatType: 'SAM',
                        position: { lat: 4.80, lng: 7.50 },
                        rangeKm: 85,
                      },
                      'Pop-up SAM radar track detected at FL240',
                    )
                  }
                >
                  Inject SAM Threat (THR-02)
                </Button>
              </div>

              {/* Crew Unavailable Injector */}
              <div className="p-3 bg-command-bg rounded border border-command-border flex flex-col justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-command-info">
                    <UserX className="w-3.5 h-3.5" />
                    <span>Pilot Crew Stand-Down</span>
                  </div>
                  <p className="text-[11px] text-command-muted mt-1">
                    Grounds designated pilot (CR-01 VIPER). Searches and assigns qualified resting replacement pilot.
                  </p>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isInjecting}
                  onClick={() =>
                    handleInject(
                      'CREW_UNAVAILABLE',
                      {
                        crewId: 'CR-01',
                        reason: 'Acute fatigue limit / mandatory medical hold',
                      },
                      'Lead pilot VIPER grounded for mandatory rest cycle',
                    )
                  }
                >
                  Ground Pilot VIPER (CR-01)
                </Button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Live Recommendation Queue (Decision Support) */}
        <Panel
          title="Generated Decision-Support Recommendations"
          subtitle="Human commander must explicitly Approve or Reject (Core Principle 1)"
          variant="panel"
        >
          <div className="space-y-3">
            {recList.length === 0 ? (
              <div className="p-8 text-center text-command-muted text-xs">
                No active recommendations. Inject an event on the left to test.
              </div>
            ) : (
              recList.slice(0, 3).map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded border border-command-border bg-command-bg flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-command-primary">
                        {rec.id}
                      </span>
                      <StatusBadge
                        status={
                          rec.status === 'approved'
                            ? 'nominal'
                            : rec.status === 'rejected'
                            ? 'inactive'
                            : 'warning'
                        }
                        label={rec.status.toUpperCase()}
                        size="sm"
                      />
                    </div>
                    <div className="font-mono text-xs">
                      Score: <span className="font-bold text-command-primary">{rec.score}/100</span>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-command-heading">{rec.summary}</p>

                  <div className="text-[11px] text-command-muted font-sans space-y-0.5">
                    {rec.explanation.slice(0, 2).map((exp, i) => (
                      <div key={i}>• {exp}</div>
                    ))}
                  </div>

                  {rec.status === 'pending' && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-command-border/60">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<XCircle className="w-3.5 h-3.5 text-command-critical" />}
                        onClick={() => handleDecision(rec.id, 'rejected')}
                      >
                        Reject
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        onClick={() => handleDecision(rec.id, 'approved')}
                      >
                        Approve Plan
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      {/* JSON Viewer and Store Inspector */}
      <Panel
        title="Live Zustand Store Inspector & JSON Viewer"
        subtitle="Values update continuously as aircraft fly waypoints and burn fuel"
        variant="raised"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? <Check className="w-3.5 h-3.5 text-command-nominal" /> : <Copy className="w-3.5 h-3.5" />}
            onClick={handleCopyJson}
          >
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
        }
      >
        <div className="space-y-3">
          <Tabs
            tabs={[
              { id: 'aircraft', label: `Aircraft (${aircraftList.length})` },
              { id: 'missions', label: `Missions (${missionList.length})` },
              { id: 'bases', label: `Bases (${baseList.length})` },
              { id: 'crew', label: `Crew (${crewList.length})` },
              { id: 'threats', label: `Threats (${threatList.length})` },
              { id: 'recommendations', label: `Recs (${recList.length})` },
              { id: 'events', label: `Events (${events.length})` },
              { id: 'audit', label: `Audit Log (${auditEntries.length})` },
              { id: 'airspace', label: 'Airspace' },
            ]}
            activeTab={activeJsonTab}
            onChange={(tab) => setActiveJsonTab(tab)}
            variant="segmented"
            size="sm"
          />

          <div className="relative">
            <pre className="p-4 rounded bg-command-bg border border-command-border font-mono text-[11px] text-command-primary/90 max-h-96 overflow-auto leading-tight select-text">
              {jsonString}
            </pre>
          </div>
        </div>
      </Panel>
    </div>
  );
};
