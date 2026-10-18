import React, { useState, useEffect, useRef } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useEntitiesStore } from '@/store/entitiesStore';
import { useEventsStore } from '@/store/eventsStore';
import { dataService } from '@/services';
import {
  X,
  Play,
  RotateCcw,
  Crosshair,
  Sliders,
  Plane,
  ShieldAlert,
  CloudRain,
  Users,
  Target,
  FileCode,
  History,
  CheckCircle2,
  AlertTriangle,
  Building,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const ScenarioControlPanel: React.FC = () => {
  const {
    isScenarioControlOpen,
    toggleScenarioControl,
    mapPlacementMode,
    setMapPlacementMode,
    pendingThreatCoords,
    setPendingThreatCoords,
    addToast,
  } = useUiStore();

  const { bases, aircraft, crew } = useEntitiesStore();
  const events = useEventsStore((s) => s.events);

  const [activeTab, setActiveTab] = useState<'single' | 'scripts' | 'history'>('single');
  const [selectedEventType, setSelectedEventType] = useState<
    'THREAT_DETECTED' | 'AIRCRAFT_UNSERVICEABLE' | 'BASE_CLOSED' | 'WEATHER_DEGRADED' | 'NEW_PRIORITY_MISSION' | 'CREW_UNAVAILABLE'
  >('THREAT_DETECTED');

  // Form states for Single Event Injection
  // 1. Threat
  const [threatType, setThreatType] = useState<'SAM' | 'Fighter' | 'EW' | 'Radar'>('SAM');
  const [threatLat, setThreatLat] = useState<number>(4.8);
  const [threatLng, setThreatLng] = useState<number>(7.5);
  const [threatRangeKm, setThreatRangeKm] = useState<number>(85);
  const [threatConfidence, setThreatConfidence] = useState<number>(0.9);

  // Sync clicked map coordinates to threat form
  useEffect(() => {
    if (pendingThreatCoords) {
      setThreatLat(pendingThreatCoords.lat);
      setThreatLng(pendingThreatCoords.lng);
      setPendingThreatCoords(null);
      addToast({
        type: 'info',
        title: 'Coordinates Captured',
        message: `Set target coordinates to ${pendingThreatCoords.lat.toFixed(2)}°N, ${pendingThreatCoords.lng.toFixed(2)}°E`,
      });
    }
  }, [pendingThreatCoords, setPendingThreatCoords, addToast]);

  // 2. Aircraft
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>('AC-07');
  const [aircraftReason, setAircraftReason] = useState<string>('Hydraulic pressure loss on actuator 2');

  // 3. Base Closed
  const [selectedBaseId, setSelectedBaseId] = useState<string>('BASE-B');
  const [runwayStatus, setRunwayStatus] = useState<'closed' | 'degraded'>('closed');
  const [runwayDuration, setRunwayDuration] = useState<number>(6);

  // 4. Weather Degraded
  const [weatherBaseId, setWeatherBaseId] = useState<string>('BASE-B');
  const [weatherSeverity, setWeatherSeverity] = useState<'caution' | 'severe'>('severe');
  const [windKts, setWindKts] = useState<number>(38);
  const [visibilityKm, setVisibilityKm] = useState<number>(2.5);

  // 5. New Priority Mission
  const [missionName, setMissionName] = useState<string>('Emergency Intercept Alpha');
  const [missionType, setMissionType] = useState<'CAP' | 'strike' | 'recon' | 'airlift' | 'SAR' | 'escort'>('CAP');
  const [missionPriority, setMissionPriority] = useState<1 | 2>(1);
  const [missionBase, setMissionBase] = useState<string>('BASE-A');
  const [missionLat, setMissionLat] = useState<number>(8.2);
  const [missionLng, setMissionLng] = useState<number>(5.5);
  const [missionAircraftType, setMissionAircraftType] = useState<string>('Fighter-A');

  // 6. Crew Unavailable
  const [selectedCrewId, setSelectedCrewId] = useState<string>('CR-04');
  const [crewReason, setCrewReason] = useState<string>('14h operational flight duty limit reached');

  // Demo Scripts State
  const [isRunningScript, setIsRunningScript] = useState<boolean>(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [customScriptJson, setCustomScriptJson] = useState<string>(
    JSON.stringify(
      [
        {
          delayMs: 300,
          event: {
            type: 'THREAT_DETECTED',
            payload: { threatType: 'SAM', position: { lat: 4.8, lng: 7.5 }, rangeKm: 85, confidence: 0.9 },
            description: 'Custom script event 1: SAM site active on corridor',
          },
        },
      ],
      null,
      2,
    ),
  );

  if (!isScenarioControlOpen) {
    return null;
  }

  // --- Handlers ---

  const handleInjectSingle = async () => {
    try {
      if (selectedEventType === 'THREAT_DETECTED') {
        await dataService.injectEvent({
          type: 'THREAT_DETECTED',
          payload: {
            threatType,
            position: { lat: threatLat, lng: threatLng },
            rangeKm: threatRangeKm,
            confidence: threatConfidence,
          },
          description: `Surface threat (${threatType}) detected at ${threatLat}°N ${threatLng}°E (${threatRangeKm}km range)`,
        });
      } else if (selectedEventType === 'AIRCRAFT_UNSERVICEABLE') {
        await dataService.injectEvent({
          type: 'AIRCRAFT_UNSERVICEABLE',
          payload: {
            aircraftId: selectedAircraftId,
            reason: aircraftReason,
          },
          description: `Airframe ${selectedAircraftId} reported ${aircraftReason}`,
        });
      } else if (selectedEventType === 'BASE_CLOSED') {
        await dataService.injectEvent({
          type: 'BASE_CLOSED',
          payload: {
            baseId: selectedBaseId,
            runwayStatus,
            durationHours: runwayDuration,
          },
          description: `Runway at ${selectedBaseId} declared ${runwayStatus} for ${runwayDuration}h`,
        });
      } else if (selectedEventType === 'WEATHER_DEGRADED') {
        await dataService.injectEvent({
          type: 'WEATHER_DEGRADED',
          payload: {
            baseId: weatherBaseId,
            severity: weatherSeverity,
            windKts,
            visibilityKm,
          },
          description: `Severe weather front closing in on ${weatherBaseId}: ${windKts}kts winds, ${visibilityKm}km vis`,
        });
      } else if (selectedEventType === 'NEW_PRIORITY_MISSION') {
        await dataService.injectEvent({
          type: 'NEW_PRIORITY_MISSION',
          payload: {
            name: missionName,
            type: missionType,
            priority: missionPriority,
            launchBaseId: missionBase,
            targetCoordinates: { lat: missionLat, lng: missionLng },
            requiredAircraftType: missionAircraftType,
          },
          description: `Commander directive: High priority ${missionType} sortie (${missionName}) ordered`,
        });
      } else if (selectedEventType === 'CREW_UNAVAILABLE') {
        await dataService.injectEvent({
          type: 'CREW_UNAVAILABLE',
          payload: {
            crewId: selectedCrewId,
            reason: crewReason,
          },
          description: `Crew member ${selectedCrewId} stood down (${crewReason})`,
        });
      }

      addToast({
        type: 'nominal',
        title: 'Event Injected',
        message: `Successfully dispatched ${selectedEventType} into decision-support pipeline.`,
      });
    } catch (err) {
      addToast({
        type: 'critical',
        title: 'Injection Failed',
        message: err instanceof Error ? err.message : 'Unknown error during event injection.',
      });
    }
  };

  const handleRunDemoScript = async (name: string) => {
    setIsRunningScript(true);
    try {
      if (dataService.runDemoScript) {
        await dataService.runDemoScript(name);
      }
      addToast({
        type: 'nominal',
        title: 'Demo Scenario Triggered',
        message: `Prebuilt scenario "${name}" executed successfully.`,
      });
    } catch {
      addToast({
        type: 'critical',
        title: 'Script Error',
        message: `Failed to execute demo script "${name}".`,
      });
    } finally {
      if (isMountedRef.current) {
        setIsRunningScript(false);
      }
    }
  };

  const handleRunCustomScript = async () => {
    setIsRunningScript(true);
    try {
      const parsed = JSON.parse(customScriptJson);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (item.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, item.delayMs));
        }
        if (item.event) {
          await dataService.injectEvent(item.event);
        }
      }

      addToast({
        type: 'nominal',
        title: 'Custom Script Completed',
        message: `Executed ${items.length} timed event(s) successfully.`,
      });
    } catch {
      addToast({
        type: 'critical',
        title: 'JSON Parse Error',
        message: 'Invalid script format. Must be an array of { delayMs, event } objects.',
      });
    } finally {
      if (isMountedRef.current) {
        setIsRunningScript(false);
      }
    }
  };

  return (
    <aside
      aria-label="Simulation controls"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] bg-command-panel border-l border-command-border text-command-text flex flex-col pointer-events-auto font-mono text-xs"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-command-border bg-command-raised">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[1px] bg-command-bg border border-command-border flex items-center justify-center text-command-primary">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-command-heading flex items-center gap-2">
              <span>Simulation Controls</span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded-[1px] bg-command-bg text-command-primary border border-command-border">
                STAGE 6
              </span>
            </h2>
            <p className="text-[10px] text-command-muted font-mono">Dynamic Retasking & Event Injection Engine</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toggleScenarioControl(false)}
          className="text-command-muted hover:text-command-heading p-1 rounded-[1px] hover:bg-command-panel transition-none"
          title="Close Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-command-border bg-command-bg px-2 pt-1 gap-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('single')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b-2 transition-none uppercase text-xs ${
            activeTab === 'single'
              ? 'border-command-primary text-command-primary font-bold bg-command-raised/40'
              : 'border-transparent text-command-muted hover:text-command-text'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Single Events</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scripts')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 border-b-2 transition-none uppercase text-xs ${
            activeTab === 'scripts'
              ? 'border-command-primary text-command-primary font-bold bg-command-raised/40'
              : 'border-transparent text-command-muted hover:text-command-text'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Demo Scripts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-all ${
            activeTab === 'history'
              ? 'border-cyan-400 text-cyan-300 font-bold bg-ops-surface-base/80'
              : 'border-transparent text-ops-text-muted hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Event History ({events.length})</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* TAB 1: SINGLE EVENT INJECTION */}
        {activeTab === 'single' && (
          <div className="space-y-4">
            {/* Event Category Selector */}
            <div>
              <label className="block text-xs font-mono uppercase text-ops-text-muted mb-2">
                Select Operational Disruption Event
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {[
                  { id: 'THREAT_DETECTED', label: 'Threat Detected', icon: ShieldAlert },
                  { id: 'AIRCRAFT_UNSERVICEABLE', label: 'Aircraft AOG', icon: Plane },
                  { id: 'BASE_CLOSED', label: 'Runway Closed', icon: Building },
                  { id: 'WEATHER_DEGRADED', label: 'Severe Weather', icon: CloudRain },
                  { id: 'NEW_PRIORITY_MISSION', label: 'New Priority Sortie', icon: Target },
                  { id: 'CREW_UNAVAILABLE', label: 'Crew Unavailable', icon: Users },
                ].map((item) => {
                  const Icon = item.icon;
                  const isSelected = selectedEventType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedEventType(item.id as typeof selectedEventType)}
                      className={`flex items-center gap-2 p-2.5 rounded border text-left transition-all ${
                        isSelected
                          ? 'bg-cyan-950/70 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-950/50'
                          : 'bg-ops-surface-panel/40 border-ops-border text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                      <span className="text-[11px] leading-tight font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Event Form Container */}
            <div className="bg-ops-surface-panel/60 p-4 rounded-lg border border-ops-border space-y-3.5">
              {/* 1. THREAT DETECTED */}
              {selectedEventType === 'THREAT_DETECTED' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      Hostile Threat Contact Parameters
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapPlacementMode(mapPlacementMode === 'threat' ? null : 'threat')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                        mapPlacementMode === 'threat'
                          ? 'bg-red-900 border-red-400 text-white animate-pulse'
                          : 'bg-ops-surface-base border-ops-border text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5 text-red-400" />
                      <span>{mapPlacementMode === 'threat' ? 'Click Map Now...' : 'Click Map to Place'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Threat Classification</label>
                      <select
                        value={threatType}
                        onChange={(e) => setThreatType(e.target.value as typeof threatType)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      >
                        <option value="SAM">SAM (Surface-to-Air)</option>
                        <option value="Fighter">Hostile Fighter Sweep</option>
                        <option value="EW">Electronic Warfare Jammer</option>
                        <option value="Radar">Early Warning Radar</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Engagement Radius</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="20"
                          max="150"
                          step="5"
                          value={threatRangeKm}
                          onChange={(e) => setThreatRangeKm(+e.target.value)}
                          className="w-full accent-cyan-400"
                        />
                        <span className="font-mono text-xs w-12 text-right">{threatRangeKm}km</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Latitude (°N)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={threatLat}
                        onChange={(e) => setThreatLat(+e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Longitude (°E)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={threatLng}
                        onChange={(e) => setThreatLng(+e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ops-text-muted mb-1 font-mono text-xs">
                      Radar Detection Confidence: {(threatConfidence * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={threatConfidence}
                      onChange={(e) => setThreatConfidence(+e.target.value)}
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </>
              )}

              {/* 2. AIRCRAFT UNSERVICEABLE */}
              {selectedEventType === 'AIRCRAFT_UNSERVICEABLE' && (
                <>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <Plane className="w-4 h-4 text-amber-400" />
                    Airframe Grounding / Maintenance Fault
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Select Airframe</label>
                      <select
                        value={selectedAircraftId}
                        onChange={(e) => setSelectedAircraftId(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      >
                        {Object.values(aircraft).map((ac) => (
                          <option key={ac.id} value={ac.id}>
                            {ac.id} - {ac.tailNumber} ({ac.type}) [{ac.status.toUpperCase()}]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Disruption Reason</label>
                      <input
                        type="text"
                        value={aircraftReason}
                        onChange={(e) => setAircraftReason(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 3. BASE CLOSED */}
              {selectedEventType === 'BASE_CLOSED' && (
                <>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-red-400" />
                    Airbase Runway Closure / Cratering
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Target Airbase</label>
                      <select
                        value={selectedBaseId}
                        onChange={(e) => setSelectedBaseId(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        {Object.values(bases).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.id} - {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Runway Status</label>
                      <select
                        value={runwayStatus}
                        onChange={(e) => setRunwayStatus(e.target.value as 'closed' | 'degraded')}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        <option value="closed">Closed (Emergency Cratering)</option>
                        <option value="degraded">Degraded (Arresting Gear)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-ops-text-muted mb-1 font-mono text-xs">
                      Expected Outage: {runwayDuration} Hours
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="24"
                      step="2"
                      value={runwayDuration}
                      onChange={(e) => setRunwayDuration(+e.target.value)}
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </>
              )}

              {/* 4. WEATHER DEGRADED */}
              {selectedEventType === 'WEATHER_DEGRADED' && (
                <>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <CloudRain className="w-4 h-4 text-blue-400" />
                    Severe Weather Front Incursion
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Sector / Base</label>
                      <select
                        value={weatherBaseId}
                        onChange={(e) => setWeatherBaseId(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        {Object.values(bases).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.id} ({b.name})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Severity</label>
                      <select
                        value={weatherSeverity}
                        onChange={(e) => setWeatherSeverity(e.target.value as 'caution' | 'severe')}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        <option value="severe">Severe (Below Minima)</option>
                        <option value="caution">Caution (Marginal VFR)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Crosswind: {windKts} kts</label>
                      <input
                        type="range"
                        min="15"
                        max="55"
                        step="1"
                        value={windKts}
                        onChange={(e) => setWindKts(+e.target.value)}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Visibility: {visibilityKm} km</label>
                      <input
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={visibilityKm}
                        onChange={(e) => setVisibilityKm(+e.target.value)}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 5. NEW PRIORITY MISSION */}
              {selectedEventType === 'NEW_PRIORITY_MISSION' && (
                <>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-emerald-400" />
                    Urgent Preemptive Sortie Tasking
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Mission Name</label>
                      <input
                        type="text"
                        value={missionName}
                        onChange={(e) => setMissionName(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Sortie Type</label>
                      <select
                        value={missionType}
                        onChange={(e) => setMissionType(e.target.value as typeof missionType)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        <option value="CAP">CAP (Air Patrol)</option>
                        <option value="strike">Precision Strike</option>
                        <option value="recon">Reconnaissance</option>
                        <option value="airlift">Airlift</option>
                        <option value="SAR">Combat SAR</option>
                        <option value="escort">Strike Escort</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Priority</label>
                      <select
                        value={missionPriority}
                        onChange={(e) => setMissionPriority(+e.target.value as 1 | 2)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        <option value={1}>P1 - Urgent Flash</option>
                        <option value={2}>P2 - High Priority</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Launch Base</label>
                      <select
                        value={missionBase}
                        onChange={(e) => setMissionBase(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        {Object.values(bases).map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Target Coordinates</label>
                      <div className="flex gap-1 font-mono">
                        <input
                          type="number"
                          step="0.1"
                          value={missionLat}
                          onChange={(e) => setMissionLat(+e.target.value)}
                          className="w-1/2 bg-ops-surface-base border border-ops-border rounded p-1.5 text-xs"
                          placeholder="Lat"
                        />
                        <input
                          type="number"
                          step="0.1"
                          value={missionLng}
                          onChange={(e) => setMissionLng(+e.target.value)}
                          className="w-1/2 bg-ops-surface-base border border-ops-border rounded p-1.5 text-xs"
                          placeholder="Lng"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Required Airframe</label>
                      <select
                        value={missionAircraftType}
                        onChange={(e) => setMissionAircraftType(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        <option value="Fighter-A">Fighter-A</option>
                        <option value="Strike-B">Strike-B</option>
                        <option value="Transport-C">Transport-C</option>
                        <option value="Recon-D">Recon-D</option>
                        <option value="Helicopter-E">Helicopter-E</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* 6. CREW UNAVAILABLE */}
              {selectedEventType === 'CREW_UNAVAILABLE' && (
                <>
                  <div className="text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-purple-400" />
                    Aircrew Medical Hold / Duty Limit Exceeded
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Select Aircrew Member</label>
                      <select
                        value={selectedCrewId}
                        onChange={(e) => setSelectedCrewId(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      >
                        {Object.values(crew).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.id} - {c.callsign} ({c.role} @ {c.baseId}) [Fatigue: {c.fatigueIndex}%]
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-ops-text-muted mb-1 font-mono">Reason for Grounding</label>
                      <input
                        type="text"
                        value={crewReason}
                        onChange={(e) => setCrewReason(e.target.value)}
                        className="w-full bg-ops-surface-base border border-ops-border rounded p-2 text-slate-100 font-mono text-xs"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Single Event Button */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  className="w-full py-2.5 font-mono text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2"
                  onClick={handleInjectSingle}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Disrupt Baseline & Retask</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEMO SCRIPTS & REPLAY */}
        {activeTab === 'scripts' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-ops-text-muted mb-2">
                Prebuilt Retasking Demonstration Scripts
              </h3>
              <p className="text-xs text-slate-300 mb-3">
                Execute end-to-end tactical scenarios from the clean baseline. Demonstrates real-time multi-objective replanning within 2 seconds.
              </p>
            </div>

            {/* Demo 1 Card */}
            <div className="bg-ops-surface-panel/70 p-4 rounded-lg border border-ops-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-300">DEMO SCRIPT 1</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                  SAM THREAT
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white">SAM Site on Route B (M-04 Bypass)</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Detects a high-threat SAM site (<code className="text-red-400">THR-02</code>, 85km radius at 4.8°N 7.5°E) intersecting Central Precision Strike (<code className="text-cyan-400">M-04</code>). The AI replanning engine automatically computes a safe Route C southern dogleg bypass.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-full mt-2 font-mono text-xs"
                disabled={isRunningScript}
                onClick={() => handleRunDemoScript('sam-route-b')}
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                <span>Execute SAM Route B Scenario</span>
              </Button>
            </div>

            {/* Demo 2 Card */}
            <div className="bg-ops-surface-panel/70 p-4 rounded-lg border border-ops-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-300">DEMO SCRIPT 2</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                  COMPOUND DISRUPTION
                </span>
              </div>
              <h4 className="text-sm font-semibold text-white">Runway Closure + Aircraft AOG</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Emergency runway cratering at <code className="text-amber-300">BASE-B</code> combined with airframe <code className="text-red-400">AC-07</code> hydraulic failure. The engine diverts active sorties to Sector Alpha and swaps available airframes.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-full mt-2 font-mono text-xs"
                disabled={isRunningScript}
                onClick={() => handleRunDemoScript('runway-closure-aog')}
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                <span>Execute Runway + AOG Contingency</span>
              </Button>
            </div>

            {/* Custom JSON Script Replayer */}
            <div className="pt-3 border-t border-ops-border/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono uppercase tracking-wider text-ops-text-muted">
                  Custom JSON Script Replayer
                </span>
                <span className="text-[10px] font-mono text-slate-400">Timed Event Array</span>
              </div>
              <textarea
                rows={6}
                value={customScriptJson}
                onChange={(e) => setCustomScriptJson(e.target.value)}
                className="w-full bg-ops-surface-base border border-ops-border rounded p-2.5 font-mono text-[11px] text-cyan-300 focus:outline-none focus:border-cyan-400"
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full mt-2 font-mono text-xs"
                disabled={isRunningScript}
                onClick={handleRunCustomScript}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                <span>Replay Custom Script</span>
              </Button>
            </div>
          </div>
        )}

        {/* TAB 3: EVENT HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-ops-text-muted">
                Audit Timeline ({events.length} Events Logged)
              </span>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-8 text-ops-text-muted text-xs font-mono">
                No events injected in current operational session.
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded bg-ops-surface-panel/70 border border-ops-border text-xs font-mono space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300">{ev.id}</span>
                      <span className="text-ops-text-muted text-[10px]">{ev.timestamp.slice(11, 19)}Z</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase text-cyan-400 border border-slate-700">
                        {ev.type}
                      </span>
                    </div>
                    <p className="text-slate-300 font-sans text-xs pt-1">
                      {ev.description || JSON.stringify(ev.payload)}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[10px] text-ops-text-muted border-t border-ops-border/40 mt-1">
                      <span>Operator: {ev.operator || 'COMMANDER_OPS'}</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Committed</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div className="p-3 bg-ops-surface-panel/90 border-t border-ops-border text-[11px] font-mono text-ops-text-muted flex items-center justify-between">
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Core Principle 1: Decision Support, Not Autonomy</span>
        </span>
        <button
          type="button"
          onClick={() => toggleScenarioControl(false)}
          className="text-cyan-400 hover:underline"
        >
          Close
        </button>
      </div>
    </aside>
  );
};
