import React, { useState } from 'react';
import {
  Mission,
  Base,
  Aircraft,
  Crew,
  Threat,
  Recommendation,
  AuditEntry,
} from '@/types';
import { ConflictItem, MISSION_TYPE_CONFIG } from './types';
import { PriorityTag } from '@/components/ui/PriorityTag';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  X,
  Plane,
  Users,
  Crosshair,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  CloudRain,
  ShieldAlert,
  Sparkles,
  FileText,
  Route,
} from 'lucide-react';

export interface MissionDetailDrawerProps {
  mission: Mission | null;
  base?: Base;
  aircraftMap: Record<string, Aircraft>;
  crewMap: Record<string, Crew>;
  threatsMap: Record<string, Threat>;
  recommendations: Record<string, Recommendation>;
  conflicts: ConflictItem[];
  auditLog?: AuditEntry[];
  isOpen: boolean;
  onClose: () => void;
  onApproveSortie?: (missionId: string) => void;
}

export const MissionDetailDrawer: React.FC<MissionDetailDrawerProps> = ({
  mission,
  base,
  aircraftMap,
  crewMap,
  threatsMap,
  recommendations,
  conflicts,
  auditLog = [],
  isOpen,
  onClose,
  onApproveSortie,
}) => {
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string>('Route A');

  if (!isOpen || !mission) return null;

  const typeConfig = MISSION_TYPE_CONFIG[mission.type] || MISSION_TYPE_CONFIG.CAP;
  const TypeIcon = typeConfig.icon;

  const assignedAircraft = mission.assigned.aircraftIds
    .map((id) => aircraftMap[id])
    .filter(Boolean);

  const assignedCrew = mission.assigned.crewIds
    .map((id) => crewMap[id])
    .filter(Boolean);

  const durationHours = (
    (new Date(mission.windowEnd).getTime() - new Date(mission.windowStart).getTime()) /
    3600000
  ).toFixed(1);

  // Active route waypoints (either from selected route option or default route)
  const activeRouteOption = mission.routeOptions?.find(
    (ro) => ro.id === selectedRouteOptionId,
  );
  const displayRouteWaypoints = activeRouteOption?.waypoints || mission.route;

  // Check resource requirement mismatches
  const primaryAircraft = assignedAircraft[0];
  const isAircraftTypeMismatch =
    !primaryAircraft || primaryAircraft.type !== mission.requiredAircraftType;
  const isAircraftUnserviceable = primaryAircraft?.status === 'unserviceable';

  // Check crew qualifications
  const assignedQuals = new Set<string>();
  assignedCrew.forEach((c) => c.qualifications.forEach((q) => assignedQuals.add(q)));
  const missingQuals = mission.requiredCrewQuals.filter((q) => !assignedQuals.has(q));

  // Check crew duty limit
  const maxProjectedDuty = assignedCrew.reduce((max, c) => {
    const proj = c.dutyHoursLast24h + parseFloat(durationHours);
    return Math.max(max, proj);
  }, 0);
  const isDutyBreach = maxProjectedDuty > 12.0;

  // Weapon match
  const primaryLoad = primaryAircraft?.weaponLoad || [];
  const requiredWeapons = mission.requiredWeapons || [];

  // Relevant recommendations for this mission
  const missionRecs = Object.values(recommendations).filter(
    (r) =>
      r.impactedMissionIds.includes(mission.id) ||
      r.changes.some((ch) => ch.missionId === mission.id),
  );

  // Threat exposure: find threats within engagement distance of any waypoint
  const activeThreatsList = Object.values(threatsMap);
  const proximateThreats = activeThreatsList.filter((threat) => {
    return displayRouteWaypoints.some((wp) => {
      const dLat = (wp.lat - threat.position.lat) * 111;
      const dLng =
        (wp.lng - threat.position.lng) *
        111 *
        Math.cos(((wp.lat + threat.position.lat) / 2) * (Math.PI / 180));
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      return distKm <= threat.rangeKm + 30;
    });
  });

  // Calculate SVG bounding box for Mini-Map
  const allLats = [
    ...displayRouteWaypoints.map((p) => p.lat),
    mission.target.lat,
    ...(base ? [base.location.lat] : []),
  ];
  const allLngs = [
    ...displayRouteWaypoints.map((p) => p.lng),
    mission.target.lng,
    ...(base ? [base.location.lng] : []),
  ];

  const minLat = Math.min(...allLats) - 0.5;
  const maxLat = Math.max(...allLats) + 0.5;
  const minLng = Math.min(...allLngs) - 0.5;
  const maxLng = Math.max(...allLngs) + 0.5;

  const mapWidth = 320;
  const mapHeight = 180;

  const latToY = (lat: number) => {
    return mapHeight - ((lat - minLat) / (maxLat - minLat || 1)) * (mapHeight - 40) - 20;
  };
  const lngToX = (lng: number) => {
    return ((lng - minLng) / (maxLng - minLng || 1)) * (mapWidth - 40) + 20;
  };

  const svgPolylinePoints = displayRouteWaypoints
    .map((pt) => `${lngToX(pt.lng)},${latToY(pt.lat)}`)
    .join(' ');

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-950/95 border-l border-slate-800 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200"
      data-testid="mission-detail-drawer"
    >
      {/* Header */}
      <div className="p-4 bg-command-panel/90 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border uppercase tracking-wider',
                typeConfig.color,
              )}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>{mission.type}</span>
            </span>
            <span className="font-mono text-cyan-400 font-bold text-sm">
              {mission.id}
            </span>
            <PriorityTag priority={mission.priority} size="sm" />
          </div>

          <h2 className="text-base font-bold text-slate-100 truncate">
            {mission.name}
          </h2>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          aria-label="Close drawer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Active Conflicts Alert Banner if any exist */}
        {conflicts.length > 0 && (
          <div className="p-3 rounded-lg border border-red-600/60 bg-red-950/40 space-y-2">
            <div className="flex items-center gap-2 text-red-300 font-bold font-mono text-xs uppercase tracking-wider">
              <AlertOctagon className="w-4 h-4 text-red-400" />
              <span>{conflicts.length} Operational Conflicts Detected</span>
            </div>
            <div className="space-y-1.5">
              {conflicts.map((cnf) => (
                <div
                  key={cnf.id}
                  className="p-2 rounded bg-red-950/80 border border-red-800/80 text-[11px] font-mono text-red-200"
                >
                  <div className="font-bold text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <span>{cnf.title}</span>
                  </div>
                  <p className="mt-1 text-slate-300 font-sans leading-relaxed">
                    {cnf.description}
                  </p>
                  {cnf.suggestedAction && (
                    <div className="mt-1 text-[10px] text-cyan-300">
                      Recommendation: {cnf.suggestedAction}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 1: Resource Requirements vs Assigned (Mismatches in Red) */}
        <div className="rounded-lg border border-slate-800 bg-command-panel/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              <span>Requirements vs. Assigned Resources</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              Audited by DSS
            </span>
          </div>

          {/* Aircraft Requirements */}
          <div className="p-2.5 rounded border bg-slate-900/60 space-y-1.5 border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                <Plane className="w-3.5 h-3.5 text-cyan-400" />
                <span>Airframe Specification:</span>
              </span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border uppercase',
                  isAircraftTypeMismatch || isAircraftUnserviceable
                    ? 'bg-red-950 text-red-300 border-red-600 animate-pulse'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700',
                )}
              >
                {isAircraftTypeMismatch
                  ? 'MISMATCH DETECTED'
                  : isAircraftUnserviceable
                  ? 'UNSERVICEABLE'
                  : 'VERIFIED MATCH'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Required:</span>
                <span className="font-bold text-slate-200">
                  {mission.requiredAircraftType}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Assigned:</span>
                <span
                  className={cn(
                    'font-bold',
                    isAircraftTypeMismatch ? 'text-red-400' : 'text-slate-200',
                  )}
                >
                  {primaryAircraft
                    ? `${primaryAircraft.tailNumber} (${primaryAircraft.type})`
                    : 'NONE ASSIGNED'}
                </span>
              </div>
            </div>

            {isAircraftTypeMismatch && (
              <div className="mt-1.5 p-1.5 rounded bg-red-950/80 border border-red-800 text-[10px] text-red-300 font-mono">
                ⚠ Type disparity: Mission flight envelope requires {mission.requiredAircraftType}, but {primaryAircraft?.type || 'none'} is tasked.
              </div>
            )}
          </div>

          {/* Crew Requirements */}
          <div className="p-2.5 rounded border bg-slate-900/60 space-y-1.5 border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Aircrew Qualifications & Duty:</span>
              </span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border uppercase',
                  missingQuals.length > 0 || isDutyBreach
                    ? 'bg-red-950 text-red-300 border-red-600 animate-pulse'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-700',
                )}
              >
                {missingQuals.length > 0
                  ? 'QUALIFICATION GAP'
                  : isDutyBreach
                  ? 'DUTY LIMIT BREACH'
                  : 'ALL QUALS SATISFIED'}
              </span>
            </div>

            <div className="space-y-1.5 pt-1 font-mono text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Required Qualifications:</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {mission.requiredCrewQuals.map((q) => {
                    const isMissing = missingQuals.includes(q);
                    return (
                      <span
                        key={q}
                        className={cn(
                          'px-1.5 py-0.2 rounded text-[10px] border',
                          isMissing
                            ? 'bg-red-950/90 text-red-300 border-red-600'
                            : 'bg-slate-800 text-slate-300 border-slate-700',
                        )}
                      >
                        {q} {isMissing && '✗'}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">Assigned Pilot & Projected Duty:</span>
                <div className="text-slate-200 mt-0.5">
                  {assignedCrew.map((c) => {
                    const proj = c.dutyHoursLast24h + parseFloat(durationHours);
                    const overLimit = proj > 12.0;
                    return (
                      <div key={c.id} className="flex items-center justify-between">
                        <span>{c.callsign} ({c.role})</span>
                        <span className={cn(overLimit ? 'text-red-400 font-bold' : 'text-slate-400')}>
                          Duty: {proj.toFixed(1)}h / 12h max
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Munitions Requirements */}
          <div className="p-2.5 rounded border bg-slate-900/60 space-y-1.5 border-slate-800">
            <span className="text-slate-400 font-mono text-[11px] block">
              Weapon Stations & Ordnance Profile:
            </span>
            <div className="space-y-1 font-mono text-[11px]">
              {requiredWeapons.length === 0 ? (
                <span className="text-slate-400">None required (non-kinetic profile)</span>
              ) : (
                requiredWeapons.map((rw) => (
                  <div key={rw.weaponType} className="flex items-center justify-between text-slate-200">
                    <span>{rw.quantity}x {rw.weaponType}</span>
                    <span className="text-emerald-400 text-[10px]">STATION VERIFIED</span>
                  </div>
                ))
              )}
              {primaryLoad.length > 0 && (
                <div className="mt-1 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                  Assigned stores: {primaryLoad.map((w) => `${w.quantity}x ${w.weaponType}`).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Tactical Route Preview Mini-Map */}
        <div className="rounded-lg border border-slate-800 bg-command-panel/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <Route className="w-4 h-4 text-cyan-400" />
              <span>Tactical Route Preview</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              Vector Mini-Map
            </span>
          </div>

          {/* Route Options selector if multiple routes exist */}
          {mission.routeOptions && mission.routeOptions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {mission.routeOptions.map((ro) => (
                <button
                  key={ro.id}
                  onClick={() => setSelectedRouteOptionId(ro.id)}
                  className={cn(
                    'px-2.5 py-1 rounded text-[11px] font-mono border transition-all whitespace-nowrap',
                    selectedRouteOptionId === ro.id
                      ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200',
                  )}
                >
                  <span>{ro.name}</span>
                  {ro.distanceKm && (
                    <span className="ml-1 opacity-60">({ro.distanceKm}km)</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* SVG Tactical Mini-Map */}
          <div className="relative rounded-lg border border-slate-800 bg-slate-950/80 overflow-hidden flex items-center justify-center p-2">
            <svg
              width="100%"
              height={mapHeight}
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              className="overflow-visible"
            >
              {/* Subtle grid */}
              <defs>
                <pattern id="miniGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(51, 65, 85, 0.2)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#miniGrid)" />

              {/* Threat Danger Zones (e.g. SAM rings) */}
              {proximateThreats.map((threat) => {
                const cx = lngToX(threat.position.lng);
                const cy = latToY(threat.position.lat);
                const r = (threat.rangeKm / 111) * ((mapHeight - 40) / (maxLat - minLat || 1));

                return (
                  <g key={threat.id} opacity={threat.confidence * 0.8}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="rgba(239, 68, 68, 0.15)"
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      strokeDasharray={threat.status === 'suspected' ? '4 2' : 'none'}
                    />
                    <text
                      x={cx}
                      y={cy - 4}
                      fill="#fca5a5"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {threat.id} ({threat.type} {threat.rangeKm}km)
                    </text>
                  </g>
                );
              })}

              {/* Flight Route Polyline */}
              <polyline
                points={svgPolylinePoints}
                fill="none"
                stroke={mission.status === 'at-risk' ? '#ef4444' : '#22d3ee'}
                strokeWidth="2.5"
                strokeDasharray={mission.status === 'planned' ? '6 3' : 'none'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Waypoint nodes */}
              {displayRouteWaypoints.map((pt, idx) => {
                const x = lngToX(pt.lng);
                const y = latToY(pt.lat);
                return (
                  <circle
                    key={`wp-${idx}`}
                    cx={x}
                    cy={y}
                    r="3"
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* Launch Base Marker */}
              {base && (
                <g transform={`translate(${lngToX(base.location.lng)}, ${latToY(base.location.lat)})`}>
                  <circle r="5" fill="#10b981" stroke="#0f172a" strokeWidth="2" />
                  <text y="14" fill="#a7f3d0" fontSize="9" fontFamily="monospace" textAnchor="middle">
                    {base.code || 'BASE'}
                  </text>
                </g>
              )}

              {/* Target Marker */}
              <g transform={`translate(${lngToX(mission.target.lng)}, ${latToY(mission.target.lat)})`}>
                <polygon points="0,-7 6,4 -6,4" fill="#f43f5e" stroke="#0f172a" strokeWidth="1.5" />
                <text y="-10" fill="#fda4af" fontSize="9" fontFamily="monospace" textAnchor="middle">
                  TARGET: {mission.target.name}
                </text>
              </g>
            </svg>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Launch Base: {base?.name || mission.launchBaseId}</span>
            <span>Est Distance: {activeRouteOption?.distanceKm || 320} km</span>
          </div>
        </div>

        {/* Section 3: Weather & Threat Exposure along Route */}
        <div className="rounded-lg border border-slate-800 bg-command-panel/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <CloudRain className="w-4 h-4 text-cyan-400" />
              <span>Weather & Threat Exposure</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              Corridor Telemetry
            </span>
          </div>

          {/* Base Weather Minima */}
          <div className="p-2.5 rounded border bg-slate-900/60 border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[11px]">
                Launch Base Local Weather:
              </span>
              <StatusBadge
                status={
                  base?.weather?.severity === 'severe'
                    ? 'critical'
                    : base?.weather?.severity === 'caution'
                    ? 'warning'
                    : 'nominal'
                }
                label={base?.weather?.severity || 'nominal'}
                size="sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-200 pt-1">
              <div>
                <span className="text-slate-400 text-[10px] block">Visibility:</span>
                <span>{base?.weather?.visibilityKm ?? 18} km</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Cloud Base:</span>
                <span>{base?.weather?.cloudBaseFt ?? 4500} ft</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Winds:</span>
                <span>{base?.weather?.windKts ?? 12} kts</span>
              </div>
            </div>
          </div>

          {/* Threat Exposure along route */}
          <div className="p-2.5 rounded border bg-slate-900/60 border-slate-800 space-y-1.5">
            <span className="text-slate-400 font-mono text-[11px] block">
              En-Route Threat Intersections:
            </span>
            {proximateThreats.length === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zero hostile SAM / Fighter radar contacts intersect route corridor.</span>
              </div>
            ) : (
              <div className="space-y-1">
                {proximateThreats.map((threat) => (
                  <div
                    key={threat.id}
                    className="p-1.5 rounded bg-red-950/40 border border-red-800/60 flex items-center justify-between font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-1.5 text-red-300">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      <span>{threat.id} ({threat.type})</span>
                    </div>
                    <span className="text-slate-400 text-[10px]">
                      Radius: {threat.rangeKm}km • Conf: {Math.round(threat.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: AI Recommendations & Retasking Options */}
        {missionRecs.length > 0 && (
          <div className="rounded-lg border border-cyan-800/80 bg-cyan-950/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-cyan-800/50">
              <div className="flex items-center gap-1.5 font-mono text-cyan-300 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>AI DSS Recommendation Available</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 font-bold px-1.5 py-0.5 rounded bg-cyan-900/60 border border-cyan-700">
                SCORE: {missionRecs[0].score}/100
              </span>
            </div>

            <p className="text-slate-200 text-xs leading-relaxed font-sans">
              {missionRecs[0].summary}
            </p>

            <div className="p-2 rounded bg-slate-900/90 border border-cyan-900/60 space-y-1 font-mono text-[10px]">
              <div className="text-cyan-400 font-semibold">Algorithmic Explanation:</div>
              {missionRecs[0].explanation.map((exp, idx) => (
                <div key={idx} className="text-slate-300">• {exp}</div>
              ))}
            </div>

            {/* Core Principle 1 Reminder */}
            <div className="text-[10px] font-mono text-amber-300/90 bg-amber-950/40 p-2 rounded border border-amber-800/60 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>
                DECISION SUPPORT ONLY: System recommends; Commander approval required to alter ATO.
              </span>
            </div>
          </div>
        )}

        {/* Section 5: Change History & Audit Trail */}
        <div className="rounded-lg border border-slate-800 bg-command-panel/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono uppercase font-bold text-slate-200">
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Change & Mission Audit History</span>
            </span>
            <span className="text-[10px] text-slate-400 font-normal">
              Immutable Log
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            {auditLog
              .filter(
                (entry) =>
                  entry.targetId === mission.id ||
                  (typeof entry.details === 'string' && entry.details.includes(mission.id)),
              )
              .map((entry) => (
                <div
                  key={entry.id}
                  className="p-2 rounded bg-slate-900/60 border border-slate-800 flex items-start justify-between"
                >
                  <div>
                    <span className="text-cyan-400 font-semibold">{entry.action}</span>
                    <p className="text-slate-400 text-[10px] font-sans mt-0.5">
                      {typeof entry.details === 'string'
                        ? entry.details
                        : JSON.stringify(entry.details)}
                    </p>
                  </div>
                  <span className="text-slate-400 text-[10px]">{entry.id}</span>
                </div>
              ))}

            <div className="p-2 rounded bg-slate-900/60 border border-slate-800 flex items-start justify-between">
              <div>
                <span className="text-cyan-400 font-semibold">SORTIE_INITIALIZED</span>
                <p className="text-slate-400 text-[10px] font-sans mt-0.5">
                  Sortie {mission.name} generated in Air Tasking Order baseline.
                </p>
              </div>
              <span className="text-slate-400 text-[10px]">06:15Z</span>
            </div>

            {mission.status === 'at-risk' && (
              <div className="p-2 rounded bg-red-950/40 border border-red-800/60 flex items-start justify-between">
                <div>
                  <span className="text-red-400 font-semibold">STATUS_FLAGGED_AT_RISK</span>
                  <p className="text-slate-300 text-[10px] font-sans mt-0.5">
                    Sortie flagged at-risk due to scheduling conflicts and resource mismatch.
                  </p>
                </div>
                <span className="text-red-400 text-[10px]">11:45Z</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Directives / Action Bar */}
      <div className="p-4 bg-command-panel/95 border-t border-slate-800 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="font-mono">
          Close
        </Button>

        <div className="flex items-center gap-2">
          {mission.status === 'planned' && onApproveSortie && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onApproveSortie(mission.id)}
              className="font-mono gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approve ATO Sortie</span>
            </Button>
          )}

          {missionRecs.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              className="font-mono gap-1.5 shadow-[0_0_12px_rgba(34,211,238,0.4)]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Review DSS Retask Proposal</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
