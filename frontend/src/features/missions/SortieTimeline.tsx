import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Mission,
  Base,
  Aircraft,
  Crew,
  Recommendation,
  Change,
} from '@/types';
import { ConflictItem, TimelineZoom, MISSION_TYPE_CONFIG } from './types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatTimeZulu, cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Sparkles,
  Plane,
  Crosshair,
} from 'lucide-react';

export interface SortieTimelineProps {
  missions: Mission[];
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  recommendations?: Record<string, Recommendation>;
  conflictsByMission: Map<string, ConflictItem[]>;
  simTime: string;
  selectedMissionId: string | null;
  onSelectMission: (id: string) => void;
  proposedChanges?: Change[];
}

const ZOOM_CONFIG: Record<
  TimelineZoom,
  {
    pxPerHour: number;
    tickIntervalMinutes: number;
    label: string;
  }
> = {
  '1h': { pxPerHour: 480, tickIntervalMinutes: 15, label: '1 Hour Window' },
  '6h': { pxPerHour: 220, tickIntervalMinutes: 60, label: '6 Hour Window' },
  '12h': { pxPerHour: 130, tickIntervalMinutes: 120, label: '12 Hour Window' },
  '24h': { pxPerHour: 80, tickIntervalMinutes: 180, label: '24 Hour Window' },
};

export const SortieTimeline: React.FC<SortieTimelineProps> = ({
  missions,
  bases,
  aircraft,
  crew: _crew,
  recommendations = {},
  conflictsByMission,
  simTime,
  selectedMissionId,
  onSelectMission,
  proposedChanges,
}) => {
  const impactedMissionIds = useUiStore((s) => s.impactedMissionIds);
  const [zoom, setZoom] = useState<TimelineZoom>('12h');
  const [collapsedBases, setCollapsedBases] = useState<Record<string, boolean>>({});
  const [hoveredMissionId, setHoveredMissionId] = useState<string | null>(null);
  const [hoveredGhostId, setHoveredGhostId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentNowRef = useRef<HTMLDivElement>(null);

  const currentSimDate = useMemo(() => new Date(simTime), [simTime]);

  // Timeline anchors: from -5 hours before now to +19 hours after now (24 hours span)
  const timelineStartMs = useMemo(() => {
    return currentSimDate.getTime() - 5 * 3600000;
  }, [currentSimDate]);

  const totalHours = 26; // spans -5h to +21h
  const timelineEndMs = timelineStartMs + totalHours * 3600000;

  const currentZoomConfig = ZOOM_CONFIG[zoom];
  const pxPerHour = currentZoomConfig.pxPerHour;
  const totalTimelineWidthPx = totalHours * pxPerHour;

  // Helper to convert timestamp to X coordinate
  const timeToPx = (isoString: string): number => {
    const timeMs = new Date(isoString).getTime();
    const elapsedHours = (timeMs - timelineStartMs) / 3600000;
    return elapsedHours * pxPerHour;
  };

  const nowPx = timeToPx(simTime);

  // Center timeline scroll on "NOW"
  const centerOnNow = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const targetScroll = nowPx - containerWidth / 2;
    scrollContainerRef.current.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  }, [nowPx]);

  useEffect(() => {
    // Initial center on load
    const timer = setTimeout(() => {
      centerOnNow();
    }, 200);
    return () => clearTimeout(timer);
  }, [zoom, centerOnNow]);

  const toggleBaseCollapse = (baseId: string) => {
    setCollapsedBases((prev) => ({
      ...prev,
      [baseId]: !prev[baseId],
    }));
  };

  // Group aircraft by base
  const basesList = Object.values(bases);
  const aircraftByBase = useMemo(() => {
    const map: Record<string, Aircraft[]> = {};
    basesList.forEach((b) => {
      map[b.id] = [];
    });

    Object.values(aircraft).forEach((ac) => {
      if (map[ac.baseId]) {
        map[ac.baseId].push(ac);
      } else {
        map[ac.baseId] = [ac];
      }
    });

    // Sort aircraft by tail number
    Object.keys(map).forEach((bId) => {
      map[bId].sort((a, b) => a.tailNumber.localeCompare(b.tailNumber));
    });

    return map;
  }, [aircraft, basesList]);

  // Extract pending recommendation or proposedChanges ghost bars
  const ghostSorties = useMemo(() => {
    const ghosts: {
      recId: string;
      score: number;
      aircraftId: string;
      mission: Mission;
      summary: string;
    }[] = [];

    // From recommendations
    if (recommendations) {
      Object.values(recommendations)
        .filter((r) => r.status === 'pending')
        .forEach((rec) => {
          rec.changes?.forEach((ch) => {
            if (ch.kind === 'aircraft_swap' && typeof ch.after === 'string') {
              const m = missions.find((ms) => ms.id === ch.missionId);
              if (m) {
                ghosts.push({
                  recId: rec.id,
                  score: rec.score,
                  aircraftId: ch.after,
                  mission: m,
                  summary: rec.summary,
                });
              }
            }
          });
        });
    }

    // Direct proposed changes prop (for Stage 6 previewing)
    if (proposedChanges && proposedChanges.length > 0) {
      proposedChanges.forEach((ch, idx) => {
        if (ch.kind === 'aircraft_swap' && typeof ch.after === 'string') {
          const m = missions.find((ms) => ms.id === ch.missionId);
          if (m) {
            ghosts.push({
              recId: `proposal-${idx}-${ch.missionId}`,
              score: 95,
              aircraftId: ch.after,
              mission: m,
              summary: ch.note || `Proposed aircraft swap to ${ch.after}`,
            });
          }
        }
      });
    }

    return ghosts;
  }, [recommendations, missions, proposedChanges]);

  // Generate ruler tick marks
  const rulerTicks = useMemo(() => {
    const ticks: { time: Date; px: number; label: string; isMajor: boolean }[] = [];
    const intervalMinutes = currentZoomConfig.tickIntervalMinutes;
    const intervalMs = intervalMinutes * 60 * 1000;

    let current = Math.floor(timelineStartMs / intervalMs) * intervalMs;
    while (current <= timelineEndMs) {
      const d = new Date(current);
      const px = ((current - timelineStartMs) / 3600000) * pxPerHour;
      const isMajor = d.getUTCMinutes() === 0;
      ticks.push({
        time: d,
        px,
        label: formatTimeZulu(d),
        isMajor,
      });
      current += intervalMs;
    }
    return ticks;
  }, [timelineStartMs, timelineEndMs, pxPerHour, currentZoomConfig]);

  // Find hovered mission object for tooltip
  const activeTooltipMission = useMemo(() => {
    if (!hoveredMissionId) return null;
    return missions.find((m) => m.id === hoveredMissionId) || null;
  }, [hoveredMissionId, missions]);

  const activeTooltipGhost = useMemo(() => {
    if (!hoveredGhostId) return null;
    return ghostSorties.find((g) => g.recId === hoveredGhostId) || null;
  }, [hoveredGhostId, ghostSorties]);

  return (
    <div
      className="flex flex-col rounded-lg border border-slate-800 bg-command-panel/90 shadow-xl overflow-hidden"
      data-testid="sortie-timeline"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-command-base/90 border-b border-slate-800 text-xs">
        {/* Left: Title & Now marker status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="font-mono font-bold text-slate-200 uppercase tracking-wider">
              Sortie Schedule Timeline
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span>SIM NOW: {formatTimeZulu(simTime)}</span>
          </div>
        </div>

        {/* Center: Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-slate-300">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600" />
            <span>P1 Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            <span>P2 High</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
            <span>P3 Routine</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
            <span>P4 Low</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-900/60 border border-dashed border-amber-500" />
            <span>Turnaround (45m)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-950/80 border border-dashed border-cyan-400" />
            <span>Ghost (AI Proposed)</span>
          </div>
        </div>

        {/* Right: Controls (Zoom + Center on Now) */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={centerOnNow}
            className="text-[11px] font-mono gap-1"
            title="Pan view to current simulation time"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span>Center on Now</span>
          </Button>

          {/* Zoom Buttons */}
          <div className="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
            {(['1h', '6h', '12h', '24h'] as TimelineZoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase transition-colors',
                  zoom === z
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Gantt Body: Left Track Names + Right Horizontally Scrollable Timeline Area */}
      <div className="flex flex-row relative select-none">
        {/* Left Track Column: Bases & Aircraft Info */}
        <div className="w-64 flex-shrink-0 bg-command-base/95 border-r border-slate-800 z-20 shadow-md">
          {/* Header spacer aligned with ruler */}
          <div className="h-10 px-3 flex items-center border-b border-slate-800 bg-slate-900/90 text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">
            Bases & Airframes
          </div>

          {/* Base & Aircraft Rows */}
          <div className="divide-y divide-slate-800/80">
            {basesList.map((base) => {
              const isCollapsed = !!collapsedBases[base.id];
              const baseAircraft = aircraftByBase[base.id] || [];

              return (
                <div key={base.id} className="flex flex-col">
                  {/* Base Header Row */}
                  <div
                    onClick={() => toggleBaseCollapse(base.id)}
                    className="h-9 px-3 flex items-center justify-between bg-slate-900/60 hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="font-mono text-xs font-bold text-cyan-300 truncate">
                        {base.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {baseAircraft.length} AC
                    </span>
                  </div>

                  {/* Aircraft Rows */}
                  {!isCollapsed &&
                    baseAircraft.map((ac) => (
                      <div
                        key={ac.id}
                        className="h-14 px-3 flex items-center justify-between border-t border-slate-800/40 bg-command-panel/40 hover:bg-slate-800/30 transition-colors"
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Plane className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-xs font-bold text-slate-200">
                              {ac.tailNumber}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ({ac.callsign})
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate">
                            {ac.type} • {ac.fuelPct}% fuel
                          </span>
                        </div>

                        <StatusBadge
                          status={
                            ac.status === 'airborne'
                              ? 'nominal'
                              : ac.status === 'serviceable'
                              ? 'nominal'
                              : ac.status === 'turnaround'
                              ? 'warning'
                              : ac.status === 'maintenance'
                              ? 'warning'
                              : 'critical'
                          }
                          label={ac.status}
                          size="sm"
                          showIcon={false}
                          pulse={ac.status === 'airborne'}
                          className="text-[9px] px-1 py-0"
                        />
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Timeline Canvas (Scrollable) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-command-base"
        >
          <div
            style={{ width: `${totalTimelineWidthPx}px` }}
            className="relative min-h-[500px]"
          >
            {/* Top Ruler Bar */}
            <div className="sticky top-0 h-10 bg-slate-900/95 border-b border-slate-800 z-10 flex">
              {rulerTicks.map((tick, idx) => (
                <div
                  key={idx}
                  style={{ left: `${tick.px}px` }}
                  className={cn(
                    'absolute top-0 bottom-0 flex flex-col justify-between border-l',
                    tick.isMajor ? 'border-slate-700/80' : 'border-slate-800/50',
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-mono px-1 py-1 select-none',
                      tick.isMajor ? 'text-slate-300 font-semibold' : 'text-slate-400',
                    )}
                  >
                    {tick.label}
                  </span>
                  <div
                    className={cn(
                      'w-0.5',
                      tick.isMajor ? 'h-2 bg-slate-600' : 'h-1 bg-slate-800',
                    )}
                  />
                </div>
              ))}
            </div>

            {/* Vertical Grid Lines across entire timeline */}
            {rulerTicks
              .filter((t) => t.isMajor)
              .map((tick, idx) => (
                <div
                  key={`grid-${idx}`}
                  style={{ left: `${tick.px}px` }}
                  className="absolute top-10 bottom-0 w-px border-l border-slate-800/40 pointer-events-none"
                />
              ))}

            {/* "NOW" Vertical Line (Bright Cyan with animated indicator) */}
            <div
              ref={currentNowRef}
              style={{ left: `${nowPx}px` }}
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none shadow-[0_0_10px_rgba(34,211,238,0.8)]"
            >
              {/* NOW flag badge */}
              <div className="sticky top-1 -ml-7 px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 font-mono font-bold text-[9px] shadow-lg flex items-center gap-1 select-none pointer-events-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
                <span>NOW</span>
              </div>
            </div>

            {/* Timeline Rows matching Left Track Column */}
            <div className="divide-y divide-slate-800/80">
              {basesList.map((base) => {
                const isCollapsed = !!collapsedBases[base.id];
                const baseAircraft = aircraftByBase[base.id] || [];

                return (
                  <div key={base.id} className="flex flex-col">
                    {/* Base Row spacer */}
                    <div className="h-9 bg-slate-900/40 border-b border-slate-800/30" />

                    {/* Aircraft Sortie Track Rows */}
                    {!isCollapsed &&
                      baseAircraft.map((ac) => {
                        // Find active missions assigned to this aircraft
                        const assignedMissions = missions.filter((m) =>
                          m.assigned.aircraftIds.includes(ac.id),
                        );

                        // Find ghost missions proposed for this aircraft
                        const acGhosts = ghostSorties.filter(
                          (g) => g.aircraftId === ac.id,
                        );

                        return (
                          <div
                            key={ac.id}
                            className="h-14 relative border-t border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                          >
                            {/* Maintenance or Turnaround status hatched block if applicable */}
                            {ac.status === 'maintenance' && (
                              <div
                                style={{
                                  left: 0,
                                  width: `${totalTimelineWidthPx}px`,
                                }}
                                className="absolute top-1 bottom-1 bg-[repeating-linear-gradient(45deg,rgba(239,68,68,0.08),rgba(239,68,68,0.08)_10px,transparent_10px,transparent_20px)] border-y border-red-900/40 flex items-center px-4"
                              >
                                <span className="text-[10px] font-mono text-red-400 font-semibold uppercase tracking-wider opacity-60">
                                  Depot Maintenance Block — Airframe Grounded
                                </span>
                              </div>
                            )}

                            {/* Render Sortie Bars */}
                            {assignedMissions.map((m) => {
                              const leftPx = timeToPx(m.windowStart);
                              const rightPx = timeToPx(m.windowEnd);
                              const widthPx = Math.max(30, rightPx - leftPx);

                              const isSelected = selectedMissionId === m.id;
                              const isImpacted = impactedMissionIds.includes(m.id);
                              const conflicts = conflictsByMission.get(m.id) || [];
                              const hasCritical = conflicts.some(
                                (c) => c.severity === 'critical',
                              );

                              // Turnaround block (45 minutes post-sortie)
                              const turnaroundStartMs = new Date(m.windowEnd).getTime();
                              const turnaroundEndMs = turnaroundStartMs + 45 * 60 * 1000;
                              const taLeftPx = timeToPx(new Date(turnaroundStartMs).toISOString());
                              const taRightPx = timeToPx(new Date(turnaroundEndMs).toISOString());
                              const taWidthPx = Math.max(16, taRightPx - taLeftPx);

                              // Bar styling based on priority & status
                              let barStyle = 'bg-cyan-800/80 border-cyan-500 text-cyan-100';
                              if (m.priority === 1) {
                                barStyle = 'bg-red-800/80 border-red-500 text-red-100';
                              } else if (m.priority === 2) {
                                barStyle = 'bg-amber-800/80 border-amber-500 text-amber-100';
                              } else if (m.priority === 4) {
                                barStyle = 'bg-slate-800/80 border-slate-600 text-slate-200';
                              }

                              const typeCfg =
                                MISSION_TYPE_CONFIG[m.type] || MISSION_TYPE_CONFIG.CAP;
                              const TypeIcon = typeCfg.icon;

                              return (
                                <React.Fragment key={m.id}>
                                  {/* Sortie Bar */}
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    style={{
                                      left: `${leftPx}px`,
                                      width: `${widthPx}px`,
                                    }}
                                    onClick={() => onSelectMission(m.id)}
                                    onMouseEnter={(e) => {
                                      setHoveredMissionId(m.id);
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setTooltipPos({ x: rect.left, y: rect.bottom + 8 });
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredMissionId(null);
                                      setTooltipPos(null);
                                    }}
                                    className={cn(
                                      'absolute top-2 bottom-2 rounded px-2 flex items-center justify-between border cursor-pointer transition-all duration-150 select-none z-10',
                                      barStyle,
                                      m.status === 'planned' && 'border-dashed bg-opacity-40',
                                      m.status === 'at-risk' &&
                                        'border-red-500 border-2 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
                                      isImpacted &&
                                        'border-red-500 border-2 ring-2 ring-red-500/80 shadow-[0_0_14px_rgba(239,68,68,0.8)] animate-pulse z-20',
                                      m.status === 'completed' &&
                                        'opacity-50 grayscale contrast-75',
                                      isSelected &&
                                        'ring-2 ring-cyan-400 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.6)] z-20',
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                                      <TypeIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="font-mono font-bold text-[11px] truncate">
                                        {m.id}
                                      </span>
                                      <span className="text-[10px] font-medium truncate opacity-90 hidden sm:inline">
                                        {m.name}
                                      </span>
                                    </div>

                                    {/* Conflict alert indicator on bar */}
                                    {conflicts.length > 0 && (
                                      <div
                                        className={cn(
                                          'flex-shrink-0 ml-1 p-0.5 rounded animate-pulse',
                                          hasCritical ? 'bg-red-600' : 'bg-amber-600',
                                        )}
                                        title={`${conflicts.length} Active Conflicts`}
                                      >
                                        <AlertTriangle className="w-3 h-3 text-white" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Hatched Turnaround Bar (45 min) */}
                                  {m.status !== 'completed' && (
                                    <div
                                      style={{
                                        left: `${taLeftPx}px`,
                                        width: `${taWidthPx}px`,
                                      }}
                                      className="absolute top-3.5 bottom-3.5 rounded-sm bg-[repeating-linear-gradient(45deg,rgba(245,158,11,0.25),rgba(245,158,11,0.25)_4px,transparent_4px,transparent_8px)] border border-amber-600/40 pointer-events-none"
                                      title="Turnaround Window (45m)"
                                    />
                                  )}
                                </React.Fragment>
                              );
                            })}

                            {/* Render Ghost Bars (AI Proposed Retasking Recommendations) */}
                            {acGhosts.map((ghost) => {
                              const leftPx = timeToPx(ghost.mission.windowStart);
                              const rightPx = timeToPx(ghost.mission.windowEnd);
                              const widthPx = Math.max(30, rightPx - leftPx);

                              return (
                                <div
                                  key={`ghost-${ghost.recId}`}
                                  role="button"
                                  tabIndex={0}
                                  style={{
                                    left: `${leftPx}px`,
                                    width: `${widthPx}px`,
                                  }}
                                  onClick={() => onSelectMission(ghost.mission.id)}
                                  onMouseEnter={(e) => {
                                    setHoveredGhostId(ghost.recId);
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setTooltipPos({ x: rect.left, y: rect.bottom + 8 });
                                  }}
                                  onMouseLeave={() => {
                                    setHoveredGhostId(null);
                                    setTooltipPos(null);
                                  }}
                                  className={cn(
                                    'absolute top-2 bottom-2 rounded px-2 flex items-center justify-between cursor-pointer transition-all duration-150 select-none z-10',
                                    'bg-cyan-950/50 border-2 border-dashed border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.3)] hover:bg-cyan-900/60',
                                  )}
                                  data-testid={`ghost-bar-${ghost.recId}`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 animate-pulse" />
                                    <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-cyan-200 truncate">
                                      PROPOSED RETASK ({ghost.recId})
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-mono font-bold px-1 rounded bg-cyan-900/80 text-cyan-300 border border-cyan-600/60 ml-1">
                                    SCORE {ghost.score}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Hover Tooltip for Sortie */}
      {activeTooltipMission && tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 320, Math.max(16, tooltipPos.x))}px`,
            top: `${Math.min(window.innerHeight - 200, tooltipPos.y)}px`,
          }}
          className="z-50 w-80 p-3 rounded-lg border border-slate-700 bg-slate-900/95 shadow-2xl text-xs pointer-events-none backdrop-blur-md animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
            <span className="font-mono text-cyan-400 font-bold">
              {activeTooltipMission.id} • {activeTooltipMission.name}
            </span>
            <span className="font-mono text-[10px] uppercase text-slate-400">
              P{activeTooltipMission.priority}
            </span>
          </div>

          <div className="space-y-1 text-[11px] font-mono text-slate-300 mb-2">
            <div>Type: {activeTooltipMission.type}</div>
            <div>
              Window: {formatTimeZulu(activeTooltipMission.windowStart)} -{' '}
              {formatTimeZulu(activeTooltipMission.windowEnd)}
            </div>
            <div>Target: {activeTooltipMission.target.name}</div>
          </div>

          {/* Conflict warnings in tooltip */}
          {conflictsByMission.get(activeTooltipMission.id) && (
            <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
              {conflictsByMission.get(activeTooltipMission.id)?.map((cnf) => (
                <div
                  key={cnf.id}
                  className={cn(
                    'flex items-start gap-1.5 text-[10px] font-mono p-1 rounded',
                    cnf.severity === 'critical'
                      ? 'bg-red-950/80 text-red-300'
                      : 'bg-amber-950/80 text-amber-300',
                  )}
                >
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{cnf.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Hover Tooltip for Ghost Recommendation Bar */}
      {activeTooltipGhost && tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: `${Math.min(window.innerWidth - 320, Math.max(16, tooltipPos.x))}px`,
            top: `${Math.min(window.innerHeight - 200, tooltipPos.y)}px`,
          }}
          className="z-50 w-80 p-3 rounded-lg border border-cyan-500/80 bg-slate-950/95 shadow-[0_0_16px_rgba(34,211,238,0.3)] text-xs pointer-events-none backdrop-blur-md animate-in fade-in duration-100"
        >
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-cyan-800/60">
            <div className="flex items-center gap-1.5 font-mono text-cyan-300 font-bold">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI DSS PROPOSED RETASK</span>
            </div>
            <span className="font-mono text-[10px] text-cyan-400 font-bold">
              REC SCORE: {activeTooltipGhost.score}/100
            </span>
          </div>

          <p className="text-[11px] text-slate-200 mb-2 leading-relaxed">
            {activeTooltipGhost.summary}
          </p>

          <div className="text-[10px] font-mono text-slate-400 bg-slate-900/80 p-2 rounded border border-slate-800">
            <div>Target Sortie: {activeTooltipGhost.mission.name}</div>
            <div>
              Window: {formatTimeZulu(activeTooltipGhost.mission.windowStart)} -{' '}
              {formatTimeZulu(activeTooltipGhost.mission.windowEnd)}
            </div>
            <div className="text-cyan-400 mt-1 font-semibold">
              Click bar to inspect impacted mission & proposal
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
