import React from 'react';
import { Aircraft, Base, Mission, Crew } from '@/types';
import { StatusBadge, ProgressBar, PriorityTag, Button } from '@/components/ui';
import {
  X,
  Plane,
  Fuel,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  User,
  Route,
  Calendar,
} from 'lucide-react';

interface AircraftDetailDrawerProps {
  aircraft: Aircraft | null;
  onClose: () => void;
  bases: Record<string, Base>;
  missions: Record<string, Mission>;
  crew: Record<string, Crew>;
}

export const AircraftDetailDrawer: React.FC<AircraftDetailDrawerProps> = ({
  aircraft,
  onClose,
  bases,
  missions,
  crew,
}) => {
  if (!aircraft) return null;

  const base = bases[aircraft.baseId];
  const assignedMission = aircraft.assignedMissionId
    ? missions[aircraft.assignedMissionId]
    : undefined;
  const assignedCrew = assignedMission?.assigned.crewIds[0]
    ? crew[assignedMission.assigned.crewIds[0]]
    : undefined;

  // Maintenance forecast metrics
  const hoursToService = aircraft.flightHoursToNextService;
  const isUrgentMaint = hoursToService <= 15;
  const isCautionMaint = hoursToService <= 35;
  const healthPct = Math.min(100, Math.round((hoursToService / 100) * 100));

  const statusMap = {
    serviceable: 'nominal' as const,
    airborne: 'info' as const,
    turnaround: 'info' as const,
    maintenance: 'warning' as const,
    unserviceable: 'critical' as const,
  };

  return (
    <div
      data-testid="aircraft-detail-drawer"
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-command-panel/95 backdrop-blur-md border-l border-command-border shadow-2xl flex flex-col font-mono text-xs animate-in slide-in-from-right duration-200"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between p-3.5 bg-command-raised/90 border-b border-command-border/80">
        <div className="flex items-center gap-2.5">
          <Plane className="w-4 h-4 text-command-primary" />
          <div>
            <h3 className="font-bold text-sm text-command-heading">{aircraft.tailNumber}</h3>
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
            aria-label="Close drawer"
            className="p-1 rounded hover:bg-command-panel text-command-muted hover:text-command-heading transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawer Body */}
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Maintenance Forecast Card (Hero Section) */}
        <div
          className={`p-3.5 rounded border space-y-2.5 ${
            isUrgentMaint
              ? 'bg-red-950/30 border-red-500/70'
              : isCautionMaint
              ? 'bg-amber-950/20 border-amber-500/60'
              : 'bg-command-bg border-command-border'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-1.5 text-command-heading">
              <Wrench className="w-4 h-4 text-command-warning" />
              <span>MAINTENANCE FORECAST & SCHEDULE</span>
            </div>
            <span
              className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                isUrgentMaint
                  ? 'bg-red-900/60 text-red-200'
                  : isCautionMaint
                  ? 'bg-amber-900/60 text-amber-200'
                  : 'bg-emerald-950 text-emerald-300'
              }`}
            >
              {isUrgentMaint ? 'Critical Due' : isCautionMaint ? 'Inspection Soon' : 'Nominal'}
            </span>
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-command-muted">Hours to Depot Service:</span>
              <span className="font-bold text-command-heading">{hoursToService.toFixed(1)} hrs</span>
            </div>
            <ProgressBar
              value={healthPct}
              status={isUrgentMaint ? 'critical' : isCautionMaint ? 'warning' : 'nominal'}
              size="sm"
            />
            <span className="text-[10px] text-command-subdued block mt-1">
              Threshold: mandatory 50-hour cycle inspection
            </span>
          </div>

          {/* Component Health Telemetry Matrix */}
          <div className="space-y-1.5 pt-1.5 border-t border-command-border/50 text-[11px]">
            <span className="text-[10px] text-command-subdued uppercase font-semibold">
              Component Health Status:
            </span>
            <div className="space-y-1">
              <div className="flex items-center justify-between p-1.5 rounded bg-command-panel/60">
                <span className="text-command-muted">Turbofan Engine Core</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  96% (Oil PSI Nominal)
                </span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-command-panel/60">
                <span className="text-command-muted">Hydraulic Actuators</span>
                <span
                  className={`font-bold flex items-center gap-1 ${
                    isUrgentMaint ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {isUrgentMaint ? (
                    <>
                      <AlertTriangle className="w-3 h-3" />
                      74% (Pump Telemetry)
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      92% Nominal
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded bg-command-panel/60">
                <span className="text-command-muted">Avionics Radar & Datalink</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  99% Calibrated
                </span>
              </div>
            </div>
          </div>

          {/* Next Projected Inspection Window */}
          <div className="pt-1.5 border-t border-command-border/50 text-[11px] text-command-muted space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-command-primary" />
              <span>
                Projected Service Window:{' '}
                <strong className="text-command-text">T+{(hoursToService / 2.2).toFixed(0)}h sorties</strong>
              </span>
            </div>
            <p className="text-[10px] text-command-subdued font-sans">
              Required Bay: Shelter Bay at {base?.name || aircraft.baseId} • 2 Technicians allocated
            </p>
          </div>
        </div>

        {/* Tactical Telemetry */}
        <div className="p-3.5 rounded bg-command-bg border border-command-border space-y-2">
          <span className="text-[10px] text-command-subdued uppercase font-semibold">
            Flight Readiness & Fuel
          </span>
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1 text-command-muted">
              <Fuel className="w-3.5 h-3.5 text-command-primary" />
              <span>Fuel Reserves:</span>
            </div>
            <span className="font-bold text-command-heading">
              {aircraft.fuelPct}% ({Math.round((aircraft.fuelPct / 100) * 4800)} kg)
            </span>
          </div>
          <ProgressBar
            value={aircraft.fuelPct}
            status={aircraft.fuelPct <= 25 ? 'critical' : aircraft.fuelPct <= 45 ? 'warning' : 'nominal'}
            size="sm"
          />
          <div className="grid grid-cols-2 gap-2 text-[10px] text-command-subdued pt-1">
            <div>
              <span>Airspeed: </span>
              <strong className="text-command-text">{aircraft.speed || 0} kts</strong>
            </div>
            <div>
              <span>Heading: </span>
              <strong className="text-command-text">{aircraft.heading || 0}°</strong>
            </div>
          </div>
        </div>

        {/* Assigned Sortie (ATO) */}
        <div className="p-3.5 rounded bg-command-bg border border-command-border space-y-2">
          <span className="text-[10px] text-command-subdued uppercase font-semibold">
            Tasked Mission (ATO)
          </span>
          {assignedMission ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-command-primary">{assignedMission.name}</span>
                <PriorityTag priority={assignedMission.priority} size="sm" />
              </div>
              <p className="text-[10px] text-command-muted font-sans">
                Target: {assignedMission.target.name || 'Patrol Anchor'}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-command-muted">
                <Route className="w-3 h-3 text-command-secondary" />
                <span>Mission Status: {assignedMission.status.toUpperCase()}</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-command-subdued italic font-sans">
              Currently unassigned. Ready on alert line.
            </p>
          )}
        </div>

        {/* Designated Pilot */}
        <div className="p-3.5 rounded bg-command-bg border border-command-border space-y-2">
          <span className="text-[10px] text-command-subdued uppercase font-semibold">
            Designated Aircrew
          </span>
          {assignedCrew ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-command-primary" />
                <div>
                  <span className="font-bold text-command-heading">{assignedCrew.callsign}</span>
                  <p className="text-[10px] text-command-muted font-sans">{assignedCrew.role}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-command-muted">Fatigue:</span>
                <span className="font-bold text-command-text ml-1">{assignedCrew.fatigueIndex}/100</span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-command-subdued italic font-sans">
              No flight crew designated. Available for assignment.
            </p>
          )}
        </div>

        {/* Weapons Loadout */}
        <div className="p-3.5 rounded bg-command-bg border border-command-border space-y-2">
          <span className="text-[10px] text-command-subdued uppercase font-semibold">
            Hardpoint Weapons Configuration
          </span>
          {aircraft.weaponLoad && aircraft.weaponLoad.length > 0 ? (
            <div className="space-y-1">
              {aircraft.weaponLoad.map((w, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-1.5 rounded bg-command-panel/70 text-[11px]"
                >
                  <span className="text-command-text">{w.weaponType}</span>
                  <span className="font-bold text-command-primary">x {w.quantity}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-command-subdued italic font-sans">
              Clean airframe configuration (No external ordnance).
            </p>
          )}
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="p-3 bg-command-raised/90 border-t border-command-border/80 flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close Inspection
        </Button>
      </div>
    </div>
  );
};
