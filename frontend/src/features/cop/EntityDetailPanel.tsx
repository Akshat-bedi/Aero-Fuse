import React, { useState } from 'react';
import {
  Base,
  Aircraft,
  Mission,
  Threat,
  Airspace,
  WeatherState,
  Crew,
} from '@/types';
import { SelectedEntity, COMBAT_RADIUS_KM } from './types';
import {
  StatusBadge,
  PriorityTag,
  ProgressBar,
  Button,
} from '@/components/ui';
import {
  X,
  Plane,
  MapPin,
  Route,
  Radio,
  Shield,
  Fuel,
  Wrench,
  User,
  ExternalLink,
  Clock,
  Wind,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { formatTimeZulu } from '@/lib/utils';
import { calculateDistanceKm, evaluateRouteRisk } from '@/lib/geo';

interface EntityDetailPanelProps {
  selectedEntity: SelectedEntity | null;
  onClose: () => void;
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  missions: Record<string, Mission>;
  threats: Record<string, Threat>;
  airspace: Record<string, Airspace>;
  weather: Record<string, WeatherState>;
  crew: Record<string, Crew>;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}

export const EntityDetailPanel: React.FC<EntityDetailPanelProps> = ({
  selectedEntity,
  onClose,
  bases,
  aircraft,
  missions,
  threats,
  airspace,
  weather,
  crew,
  onSelectEntity,
}) => {
  if (!selectedEntity) return null;

  const { type, id } = selectedEntity;

  return (
    <div className="absolute top-14 right-3 z-20 w-84 sm:w-96 max-h-[calc(100vh-4.5rem)] flex flex-col bg-command-panel/95 backdrop-blur-md rounded border border-command-border shadow-2xl overflow-hidden font-mono text-xs animate-in slide-in-from-right-4 duration-200">
      {type === 'aircraft' && (
        <AircraftDetailView
          aircraft={aircraft[id]}
          bases={bases}
          missions={missions}
          crew={crew}
          onClose={onClose}
          onSelectEntity={onSelectEntity}
        />
      )}

      {type === 'base' && (
        <BaseDetailView
          base={bases[id]}
          aircraft={aircraft}
          weather={weather[id] || bases[id]?.weather}
          onClose={onClose}
          onSelectEntity={onSelectEntity}
        />
      )}

      {type === 'mission' && (
        <MissionDetailView
          mission={missions[id]}
          bases={bases}
          aircraft={aircraft}
          crew={crew}
          threats={threats}
          airspace={airspace}
          onClose={onClose}
          onSelectEntity={onSelectEntity}
        />
      )}

      {type === 'threat' && (
        <ThreatDetailView
          threat={threats[id]}
          missions={missions}
          onClose={onClose}
          onSelectEntity={onSelectEntity}
        />
      )}

      {type === 'airspace' && (
        <AirspaceDetailView
          airspace={airspace[id]}
          missions={missions}
          onClose={onClose}
          onSelectEntity={onSelectEntity}
        />
      )}
    </div>
  );
};

/* =========================================================================
   1. AIRCRAFT DETAIL VIEW
   ========================================================================= */

interface AircraftDetailViewProps {
  aircraft?: Aircraft;
  bases: Record<string, Base>;
  missions: Record<string, Mission>;
  crew: Record<string, Crew>;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}

const AircraftDetailView: React.FC<AircraftDetailViewProps> = ({
  aircraft,
  bases,
  missions,
  crew,
  onClose,
  onSelectEntity,
}) => {
  if (!aircraft) {
    return (
      <div className="p-4 text-command-muted">
        Aircraft details not found.
        <Button variant="ghost" size="sm" onClick={onClose} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  const base = bases[aircraft.baseId];
  const mission = aircraft.assignedMissionId ? missions[aircraft.assignedMissionId] : undefined;
  const assignedCrew = mission?.assigned.crewIds[0] ? crew[mission.assigned.crewIds[0]] : undefined;
  const combatRadius = COMBAT_RADIUS_KM[aircraft.type] || 450;

  const statusMap = {
    airborne: 'info' as const,
    serviceable: 'nominal' as const,
    maintenance: 'warning' as const,
    unserviceable: 'critical' as const,
    turnaround: 'info' as const,
  };

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-command-raised/80 border-b border-command-border/80">
        <div className="flex items-center gap-2">
          <Plane className="w-4 h-4 text-command-primary" />
          <div>
            <h3 className="font-bold text-command-heading">{aircraft.tailNumber}</h3>
            <span className="text-[10px] text-command-muted">
              {aircraft.callsign || 'RESERVE'} • {aircraft.type}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            status={statusMap[aircraft.status]}
            label={aircraft.status.toUpperCase()}
            size="sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3.5 overflow-y-auto">
        {/* Fuel & Endurance */}
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-command-muted">
              <Fuel className="w-3.5 h-3.5 text-command-primary" />
              <span>Fuel Reserves:</span>
            </div>
            <span
              className={`font-bold ${
                aircraft.fuelPct <= 25
                  ? 'text-command-critical'
                  : aircraft.fuelPct <= 45
                  ? 'text-command-warning'
                  : 'text-command-nominal'
              }`}
            >
              {aircraft.fuelPct}% ({Math.round((aircraft.fuelPct / 100) * 4800)} kg)
            </span>
          </div>
          <ProgressBar
            value={aircraft.fuelPct}
            status={aircraft.fuelPct <= 25 ? 'critical' : aircraft.fuelPct <= 45 ? 'warning' : 'nominal'}
            size="sm"
          />
          <div className="flex justify-between text-[10px] text-command-subdued">
            <span>Burn: 2,400 kg/h</span>
            <span>Est. Endurance: ~{((aircraft.fuelPct / 100) * 2.8).toFixed(1)} hrs</span>
          </div>
        </div>

        {/* Tactical Telemetry Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Home Base</span>
            <div
              onClick={() => onSelectEntity({ type: 'base', id: aircraft.baseId })}
              className="text-command-primary hover:underline cursor-pointer font-bold flex items-center justify-between mt-0.5"
            >
              <span className="truncate">{base?.name || aircraft.baseId}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </div>
          </div>

          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Combat Radius</span>
            <div className="text-command-heading font-bold mt-0.5">
              {combatRadius} km (~{Math.round(combatRadius * 0.54)} NM)
            </div>
          </div>

          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Airspeed / Heading</span>
            <div className="text-command-heading font-bold mt-0.5">
              {aircraft.speed ? `${aircraft.speed} kts` : '0 kts (On ground)'} • {aircraft.heading || 0}°
            </div>
          </div>

          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Next Service In</span>
            <div className="text-command-heading font-bold mt-0.5 flex items-center gap-1">
              <Wrench className="w-3 h-3 text-command-muted" />
              <span>{aircraft.flightHoursToNextService.toFixed(1)} hrs</span>
            </div>
          </div>
        </div>

        {/* Assigned Mission */}
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1">
          <span className="text-[10px] text-command-subdued uppercase tracking-wider">
            Assigned Sortie (ATO)
          </span>
          {mission ? (
            <div
              onClick={() => onSelectEntity({ type: 'mission', id: mission.id })}
              className="group cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-bold text-command-primary group-hover:underline">
                <span>{mission.name}</span>
                <PriorityTag priority={mission.priority} size="sm" />
              </div>
              <p className="text-[10px] text-command-muted mt-0.5 font-sans">
                Target: {mission.target.name || 'Assigned patrol corridor'}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-command-muted italic font-sans">
              Not currently tasked. Available as ready alert reserve.
            </p>
          )}
        </div>

        {/* Assigned Pilot / Crew */}
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1">
          <span className="text-[10px] text-command-subdued uppercase tracking-wider">
            Designated Aircrew
          </span>
          {assignedCrew ? (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-command-primary" />
                <span className="font-bold text-command-heading">
                  {assignedCrew.callsign} ({assignedCrew.role})
                </span>
              </div>
              <span className="text-[10px] text-command-muted font-mono">
                Fatigue: {assignedCrew.fatigueIndex}/100
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-command-muted italic font-sans">
              Crew roster unassigned.
            </p>
          )}
        </div>

        {/* Weapons Loadout */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-command-subdued uppercase tracking-wider font-bold">
            Hardpoint Weapons Configuration
          </span>
          {aircraft.weaponLoad.length === 0 ? (
            <p className="text-[11px] text-command-muted italic font-sans">
              Clean station configuration (Unarmed / Transport).
            </p>
          ) : (
            <div className="space-y-1">
              {aircraft.weaponLoad.map((w, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-1.5 rounded bg-command-bg border border-command-border/60 text-[11px]"
                >
                  <span className="font-bold text-command-heading">{w.weaponType}</span>
                  <span className="text-command-primary font-bold">Qty: {w.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   2. AIR BASE DETAIL VIEW
   ========================================================================= */

interface BaseDetailViewProps {
  base?: Base;
  aircraft: Record<string, Aircraft>;
  weather?: WeatherState;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}

const BaseDetailView: React.FC<BaseDetailViewProps> = ({
  base,
  aircraft,
  weather,
  onClose,
  onSelectEntity,
}) => {
  if (!base) return null;

  const stationedAircraft = Object.values(aircraft).filter((a) => a.baseId === base.id);
  const serviceableCount = stationedAircraft.filter((a) => a.status === 'serviceable').length;
  const airborneCount = stationedAircraft.filter((a) => a.status === 'airborne').length;
  const unserviceableCount = stationedAircraft.filter((a) => a.status === 'unserviceable').length;

  const runwayStatusMap = {
    open: 'nominal' as const,
    degraded: 'warning' as const,
    closed: 'critical' as const,
  };

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-command-raised/80 border-b border-command-border/80">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-command-primary" />
          <div>
            <h3 className="font-bold text-command-heading">{base.name}</h3>
            <span className="text-[10px] text-command-muted font-mono">
              {base.code || base.id} • {base.location.lat.toFixed(2)}°N {base.location.lng.toFixed(2)}°E
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            status={runwayStatusMap[base.runwayStatus]}
            label={`RUNWAY ${base.runwayStatus.toUpperCase()}`}
            size="sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3.5 overflow-y-auto">
        {/* Readiness Gauges */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1">
            <span className="text-[10px] text-command-subdued uppercase">Aviation Fuel Stock</span>
            <div className="text-command-heading font-bold text-sm">{base.fuelStockPct}%</div>
            <ProgressBar
              value={base.fuelStockPct}
              status={base.fuelStockPct <= 30 ? 'critical' : base.fuelStockPct <= 50 ? 'warning' : 'nominal'}
              size="sm"
            />
          </div>

          <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1">
            <span className="text-[10px] text-command-subdued uppercase">Shelter Capacity</span>
            <div className="text-command-heading font-bold text-sm">
              {stationedAircraft.length} / {base.shelterCapacity} Bays
            </div>
            <ProgressBar
              value={(stationedAircraft.length / base.shelterCapacity) * 100}
              status="info"
              size="sm"
            />
          </div>
        </div>

        {/* Weather METAR Observation */}
        {weather && (
          <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-command-heading">
                <Wind className="w-3.5 h-3.5 text-command-primary" />
                <span>Surface Weather (METAR)</span>
              </div>
              <StatusBadge
                status={
                  weather.severity === 'severe'
                    ? 'critical'
                    : weather.severity === 'caution'
                    ? 'warning'
                    : 'nominal'
                }
                label={weather.severity.toUpperCase()}
                size="sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px] text-command-muted">
              <div>
                <span className="text-command-subdued block">WIND:</span>
                <span className="font-bold text-command-text">{weather.windKts} kts</span>
              </div>
              <div>
                <span className="text-command-subdued block">VISIBILITY:</span>
                <span className="font-bold text-command-text">{weather.visibilityKm} km</span>
              </div>
              <div>
                <span className="text-command-subdued block">CEILING:</span>
                <span className="font-bold text-command-text">{weather.cloudBaseFt} ft</span>
              </div>
            </div>

            {weather.forecast && weather.forecast.length > 0 && (
              <div className="border-t border-command-border/40 pt-1.5 space-y-1">
                <span className="text-[10px] text-command-subdued uppercase block">
                  6-Hour Aerodrome Forecast
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {weather.forecast.map((fc, i) => (
                    <div
                      key={i}
                      className="p-1 rounded bg-command-panel text-[10px] flex items-center justify-between"
                    >
                      <span>{formatTimeZulu(fc.time)}</span>
                      <span
                        className={`font-bold uppercase ${
                          fc.severity === 'severe'
                            ? 'text-command-critical'
                            : fc.severity === 'caution'
                            ? 'text-command-warning'
                            : 'text-command-nominal'
                        }`}
                      >
                        {fc.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stationed Aircraft Roster */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-command-heading uppercase">
              Stationed Airframes ({stationedAircraft.length})
            </span>
            <div className="flex items-center gap-2 text-[10px] text-command-muted">
              <span>{serviceableCount} Ready</span>
              <span>•</span>
              <span className="text-cyan-400">{airborneCount} Flown</span>
              <span>•</span>
              <span className="text-red-400">{unserviceableCount} AOG</span>
            </div>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {stationedAircraft.map((a) => (
              <div
                key={a.id}
                onClick={() => onSelectEntity({ type: 'aircraft', id: a.id })}
                className="flex items-center justify-between p-1.5 rounded bg-command-bg hover:bg-command-raised border border-command-border/60 cursor-pointer transition-colors text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <Plane className="w-3.5 h-3.5 text-command-primary" />
                  <span className="font-bold text-command-text">{a.tailNumber}</span>
                  <span className="text-[10px] text-command-muted">({a.type})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-command-subdued font-mono">
                    {a.fuelPct}% Fuel
                  </span>
                  <StatusBadge
                    status={
                      a.status === 'airborne'
                        ? 'info'
                        : a.status === 'serviceable'
                        ? 'nominal'
                        : a.status === 'unserviceable'
                        ? 'critical'
                        : 'warning'
                    }
                    label={a.status}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   3. MISSION DETAIL VIEW & ROUTE OPTIONS
   ========================================================================= */

interface MissionDetailViewProps {
  mission?: Mission;
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  threats: Record<string, Threat>;
  airspace: Record<string, Airspace>;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}

const MissionDetailView: React.FC<MissionDetailViewProps> = ({
  mission,
  bases,
  aircraft,
  crew,
  threats,
  airspace,
  onClose,
  onSelectEntity,
}) => {
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  if (!mission) return null;

  const launchBase = bases[mission.launchBaseId];
  const assignedAc = mission.assigned.aircraftIds[0] ? aircraft[mission.assigned.aircraftIds[0]] : undefined;
  const assignedPilot = mission.assigned.crewIds[0] ? crew[mission.assigned.crewIds[0]] : undefined;

  const activeThreatsList = Object.values(threats);
  const activeAirspaceList = Object.values(airspace);

  const routeOptions = mission.routeOptions || [
    {
      id: 'Route A',
      name: 'Default Planned Route',
      waypoints: mission.route,
      distanceKm: 310,
    },
  ];

  const currentRouteOption = routeOptions[selectedRouteIdx] || routeOptions[0];
  const currentRisk = evaluateRouteRisk(
    currentRouteOption.waypoints,
    activeThreatsList,
    activeAirspaceList,
  );

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-command-raised/80 border-b border-command-border/80">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-command-secondary" />
          <div>
            <h3 className="font-bold text-command-heading">{mission.name}</h3>
            <span className="text-[10px] text-command-muted">
              {mission.id} • {mission.type.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PriorityTag priority={mission.priority} size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3.5 overflow-y-auto">
        {/* Risk Assessment Banner */}
        {currentRisk.isCompromised ? (
          <div className="p-2.5 rounded bg-red-950/40 border border-red-500/50 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-command-critical">
              <AlertTriangle className="w-4 h-4" />
              <span>COMPROMISED ROUTE RISK (Score: {currentRisk.riskScore}/100)</span>
            </div>
            <p className="text-[11px] text-red-200/90 font-sans">
              {currentRisk.warnings[0] || 'Intersects hostile weapon engagement envelope'}
            </p>
          </div>
        ) : (
          <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/40 flex items-center gap-2 text-emerald-400 text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Flight path clear of active SAM envelopes & no-fly zones</span>
          </div>
        )}

        {/* Route Alternatives Selector (Route A / B / C) */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-command-subdued uppercase font-bold tracking-wider">
            Alternative Route Profiles (CP-SAT Solver Options)
          </span>
          <div className="space-y-1.5">
            {routeOptions.map((opt, idx) => {
              const optRisk = evaluateRouteRisk(opt.waypoints, activeThreatsList, activeAirspaceList);
              const isSelected = selectedRouteIdx === idx;

              return (
                <div
                  key={opt.id}
                  onClick={() => setSelectedRouteIdx(idx)}
                  className={`p-2 rounded border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-command-raised border-command-primary text-command-heading'
                      : 'bg-command-bg border-command-border/60 hover:bg-command-panel text-command-muted'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>{opt.name}</span>
                    <span
                      className={`text-[10px] font-mono ${
                        optRisk.isCompromised
                          ? 'text-command-critical'
                          : 'text-command-nominal'
                      }`}
                    >
                      {optRisk.isCompromised ? 'HIGH RISK' : 'CLEAR'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-command-subdued mt-1">
                    <span>Dist: ~{opt.distanceKm || 320} km</span>
                    <span>Waypoints: {opt.waypoints.length}</span>
                    <span>Risk: {optRisk.riskScore}/100</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Flight Time Window */}
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-1">
          <div className="flex items-center gap-1.5 text-command-muted text-[11px]">
            <Clock className="w-3.5 h-3.5 text-command-primary" />
            <span>Operational Time Window</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-command-heading">
            <span>START: {formatTimeZulu(mission.windowStart)}</span>
            <span>END: {formatTimeZulu(mission.windowEnd)}</span>
          </div>
        </div>

        {/* Assigned Assets */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Assigned Airframe</span>
            {assignedAc ? (
              <div
                onClick={() => onSelectEntity({ type: 'aircraft', id: assignedAc.id })}
                className="text-command-primary hover:underline cursor-pointer font-bold mt-0.5 flex items-center justify-between"
              >
                <span>{assignedAc.tailNumber}</span>
                <ExternalLink className="w-3 h-3" />
              </div>
            ) : (
              <div className="text-command-muted italic mt-0.5">Unassigned</div>
            )}
          </div>

          <div className="p-2 rounded bg-command-bg border border-command-border">
            <span className="text-[10px] text-command-subdued uppercase">Assigned Pilot</span>
            {assignedPilot ? (
              <div className="text-command-heading font-bold mt-0.5">
                {assignedPilot.callsign}
              </div>
            ) : (
              <div className="text-command-muted italic mt-0.5">Unassigned</div>
            )}
          </div>
        </div>

        {/* Launch Base & Target */}
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-2 text-[11px]">
          <div>
            <span className="text-[10px] text-command-subdued uppercase block">Launch Station</span>
            <div
              onClick={() => onSelectEntity({ type: 'base', id: mission.launchBaseId })}
              className="text-command-primary hover:underline cursor-pointer font-bold flex items-center justify-between"
            >
              <span>{launchBase?.name || mission.launchBaseId}</span>
              <ExternalLink className="w-3 h-3" />
            </div>
          </div>

          <div className="border-t border-command-border/40 pt-1.5">
            <span className="text-[10px] text-command-subdued uppercase block">Mission Target</span>
            <span className="font-bold text-command-heading">
              {mission.target.name || 'Assigned Sector'} (
              {mission.target.lat.toFixed(2)}°N {mission.target.lng.toFixed(2)}°E)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   4. THREAT DETAIL VIEW
   ========================================================================= */

interface ThreatDetailViewProps {
  threat?: Threat;
  missions: Record<string, Mission>;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}

const ThreatDetailView: React.FC<ThreatDetailViewProps> = ({
  threat,
  missions,
  onClose,
  onSelectEntity,
}) => {
  if (!threat) return null;

  // Find missions that intersect this threat
  const intersectingMissions = Object.values(missions).filter((m) => {
    return m.route.some((pt) => calculateDistanceKm(pt, threat.position) <= threat.rangeKm + 10);
  });

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-command-raised/80 border-b border-command-border/80">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-command-critical" />
          <div>
            <h3 className="font-bold text-command-heading">{threat.id}</h3>
            <span className="text-[10px] text-command-muted">
              {threat.type} ENVELOPE • {threat.rangeKm} KM
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            status={threat.status === 'active' ? 'critical' : 'warning'}
            label={threat.status.toUpperCase()}
            size="sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3.5 overflow-y-auto">
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-command-subdued">Threat Classification:</span>
            <span className="font-bold text-command-heading">{threat.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-command-subdued">Engagement Radius:</span>
            <span className="font-bold text-command-critical">
              {threat.rangeKm} km (~{Math.round(threat.rangeKm * 0.54)} NM)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-command-subdued">Detection Confidence:</span>
            <span className="font-bold text-command-primary">
              {Math.round(threat.confidence * 100)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-command-subdued">Coordinates:</span>
            <span className="font-bold text-command-heading">
              {threat.position.lat.toFixed(4)}°N {threat.position.lng.toFixed(4)}°E
            </span>
          </div>
        </div>

        {/* Intersecting Missions */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-command-subdued uppercase font-bold tracking-wider">
            Impacted Mission Sorties ({intersectingMissions.length})
          </span>
          {intersectingMissions.length === 0 ? (
            <p className="text-[11px] text-command-muted italic font-sans">
              No active ATO sorties intersecting weapon engagement envelope.
            </p>
          ) : (
            <div className="space-y-1">
              {intersectingMissions.map((m) => (
                <div
                  key={m.id}
                  onClick={() => onSelectEntity({ type: 'mission', id: m.id })}
                  className="flex items-center justify-between p-2 rounded bg-command-bg hover:bg-command-raised border border-command-border/60 cursor-pointer text-[11px]"
                >
                  <span className="font-bold text-command-text">{m.name}</span>
                  <span className="text-red-400 font-bold">AT RISK</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   5. AIRSPACE DETAIL VIEW
   ========================================================================= */

interface AirspaceDetailViewProps {
  airspace?: Airspace;
  missions: Record<string, Mission>;
  onClose: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}

const AirspaceDetailView: React.FC<AirspaceDetailViewProps> = ({
  airspace,
  onClose,
}) => {
  if (!airspace) return null;

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-command-raised/80 border-b border-command-border/80">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <div>
            <h3 className="font-bold text-command-heading">{airspace.name}</h3>
            <span className="text-[10px] text-command-muted font-mono">{airspace.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            status={airspace.type === 'no-fly' ? 'critical' : 'warning'}
            label={airspace.type.toUpperCase()}
            size="sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-3.5 overflow-y-auto text-[11px]">
        <div className="p-2.5 rounded bg-command-bg border border-command-border space-y-2">
          <div className="flex justify-between">
            <span className="text-command-subdued">Airspace Classification:</span>
            <span className="font-bold text-command-heading uppercase">{airspace.type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-command-subdued">Vertical Limits:</span>
            <span className="font-bold text-command-heading">
              FL{Math.round((airspace.floorFt || 0) / 100)} to FL{Math.round((airspace.ceilingFt || 60000) / 100)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-command-subdued">Validity Window:</span>
            <span className="font-bold text-command-primary">
              {formatTimeZulu(airspace.activeFrom)} – {formatTimeZulu(airspace.activeTo)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
