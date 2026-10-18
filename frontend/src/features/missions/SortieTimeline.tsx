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
  Target,
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
      className="flex flex-col rounded-[2px] border border-command-border bg-command-panel overflow-hidden"
      data-testid="sortie-timeline"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-command-raised border-b border-command-border text-xs">
        {/* Left: Title & Now marker status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-command-primary" />
            <span className="font-mono font-bold text-command-heading uppercase tracking-wider text-xs">
              Sortie Schedule Timeline
            </span>
          </div>
          <span className="text-command-border">|</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-command-primary bg-command-bg px-2 py-0.5 rounded-[1px] border border-command-border">
            <span>SIM NOW: {formatTimeZulu(simTime)}</span>
          </div>
        </div>

        {/* Center: Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-command-muted">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-command-critical" />
            <span>P1 Critical</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-command-warning" />
            <span>P2 High</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-command-secondary" />
            <span>P3 Routine</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-command-subdued" />
            <span>P4 Low</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] bg-[#1c2320] border border-command-border" />
            <span>Turnaround (45m)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[1px] border border-dashed border-[#d7dcd4] bg-[#2a3630]/40" />
            <span>Ghost (Proposed)</span>
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
            <Crosshair className="w-3.5 h-3.5 text-command-primary" />
            <span>Center on Now</span>
          </Button>

          {/* Zoom Buttons */}
          <div className="flex items-center bg-command-bg border border-command-border rounded-[1px] p-0.5">
            {(['1h', '6h', '12h', '24h'] as TimelineZoom[]).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-mono font-bold rounded-[1px] uppercase transition-none',
                  zoom === z
                    ? 'bg-command-primary text-black font-semibold'
                    : 'text-command-muted hover:text-command-heading',
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
        <div className="w-64 flex-shrink-0 bg-command-panel border-r border-command-border z-20">
          {/* Header spacer aligned with ruler */}
          <div className="h-9 px-3 flex items-center border-b border-command-border bg-command-raised text-[10px] font-mono text-command-muted uppercase tracking-wider font-bold">
            Bases & Airframes
          </div>

          {/* Base & Aircraft Rows */}
          <div className="divide-y divide-command-border/60">
            {basesList.map((base) => {
              const isCollapsed = !!collapsedBases[base.id];
              const baseAircraft = aircraftByBase[base.id] || [];

              return (
                <div key={base.id} className="flex flex-col">
                  {/* Base Header Row */}
                  <div
                    onClick={() => toggleBaseCollapse(base.id)}
                    className="h-8 px-2.5 flex items-center justify-between bg-command-raised border-b border-command-border cursor-pointer transition-none"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-command-muted" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-command-muted" />
                      )}
                      <span className="font-mono text-xs font-bold text-command-heading truncate">
                        {base.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[1px] bg-command-bg text-command-muted border border-command-border">
                      {baseAircraft.length} AC
                    </span>
                  </div>

                  {/* Aircraft Rows */}
                  {!isCollapsed &&
                    baseAircraft.map((ac) => (
                      <div
                        key={ac.id}
                        className="h-12 px-2.5 flex items-center justify-between border-t border-command-border/40 bg-command-panel/60 hover:bg-command-raised transition-none"
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Plane className="w-3.5 h-3.5 text-command-muted" />
                            <span className="font-mono text-xs font-bold text-command-heading">
                              {ac.tailNumber}
                            </span>
                            <span className="text-[10px] font-mono text-command-muted">
                              ({ac.callsign})
                            </span>
                          </div>
                          <span className="text-[10px] text-command-subdued truncate font-mono">
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
                          pulse={false}
                          className="text-[9px] px-1 py-0 rounded-[1px]"
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
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-command-bg"
        >
          <div
            style={{ width: `${totalTimelineWidthPx}px` }}
            className="relative min-h-[500px]"
          >
            {/* Top Ruler Bar */}
            <div className="sticky top-0 h-9 bg-command-raised border-b border-command-border z-10 flex">
              {rulerTicks.map((tick, idx) => (
                <div
                  key={idx}
                  style={{ left: `${tick.px}px` }}
                  className={cn(
                    'absolute top-0 bottom-0 flex flex-col justify-between border-l',
                    tick.isMajor ? 'border-command-border' : 'border-command-border/40',
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px] font-mono px-1 py-0.5 select-none',
                      tick.isMajor ? 'text-command-heading font-semibold' : 'text-command-muted',
                    )}
                  >
                    {tick.label}
                  </span>
                  <div
                    className={cn(
                      'w-0.5',
                      tick.isMajor ? 'h-2 bg-command-border-hover' : 'h-1 bg-command-border',
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
                  className="absolute top-9 bottom-0 w-px border-l border-command-border/30 pointer-events-none"
                />
              ))}

            {/* "NOW" Vertical Line (1px solid amber line) */}
            <div
              ref={currentNowRef}
              style={{ left: `${nowPx}px` }}
              className="absolute top-0 bottom-0 w-[1px] bg-command-primary z-30 pointer-events-none shadow-none"
            >
              {/* NOW flag badge */}
              <div className="sticky top-1 -ml-5 px-1.5 py-0.2 rounded-[1px] bg-command-primary text-black font-mono font-bold text-[9px] shadow-none flex items-center gap-1 select-none pointer-events-auto">
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
                              let barStyle = 'bg-command-secondary text-white border border-[#386694]';
                              if (m.priority === 1) {
                                barStyle = 'bg-command-critical text-white border border-[#a82b2b]';
                              } else if (m.priority === 2) {
                                barStyle = 'bg-command-warning text-black border border-[#b58514]';
                              } else if (m.priority === 4) {
                                barStyle = 'bg-command-subdued text-command-text border border-command-border';
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
                                      'absolute top-2 bottom-2 rounded-[1px] px-2 flex items-center justify-between border cursor-pointer transition-none select-none z-10 font-mono',
                                      m.status === 'planned'
                                        ? 'bg-transparent border-dashed border-command-border text-command-text'
                                        : barStyle,
                                      m.status === 'at-risk' &&
                                        'border-2 border-command-critical bg-command-critical-bg text-command-critical',
                                      isImpacted &&
                                        'border-2 border-command-critical bg-command-critical-bg text-command-critical animate-slow-blink z-20',
                                      m.status === 'completed' &&
                                        'opacity-40 grayscale contrast-75',
                                      isSelected &&
                                        'border-2 border-command-primary ring-1 ring-command-primary z-20',
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0 truncate">
                                      <TypeIcon className="w-3 h-3 flex-shrink-0" />
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
                                          'flex-shrink-0 ml-1 p-0.5 rounded-[1px] flex items-center justify-center',
                                          hasCritical ? 'bg-command-critical text-white' : 'bg-command-warning text-black',
                                        )}
                                        title={`${conflicts.length} Active Conflicts`}
                                      >
                                        <AlertTriangle className="w-3 h-3" />
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
                                      className="absolute top-3.5 bottom-3.5 rounded-none bg-[repeating-linear-gradient(45deg,rgba(84,99,90,0.25),rgba(84,99,90,0.25)_4px,transparent_4px,transparent_8px)] border border-command-border/60 pointer-events-none"
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
                                    'absolute top-2 bottom-2 rounded-[1px] px-2 flex items-center justify-between cursor-pointer transition-none select-none z-10 font-mono',
                                    'border border-dashed border-[#d7dcd4] bg-[repeating-linear-gradient(45deg,rgba(215,220,212,0.06),rgba(215,220,212,0.06)_4px,transparent_4px,transparent_8px)] text-[#d7dcd4] hover:bg-[#d7dcd4]/10',
                                  )}
                                  data-testid={`ghost-bar-${ghost.recId}`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                                    <Target className="w-3.5 h-3.5 text-[#d7dcd4] flex-shrink-0" />
                                    <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-[#d7dcd4] truncate">
                                      PROPOSED RETASK ({ghost.recId})
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-mono font-bold px-1 rounded-[1px] bg-command-bg text-[#d7dcd4] border border-command-border ml-1">
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
          className="z-50 w-80 p-2.5 rounded-[1px] border border-command-border bg-command-panel text-xs pointer-events-none font-mono text-command-text"
        >
          <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-command-border">
            <span className="font-mono text-command-primary font-bold">
              {activeTooltipMission.id} • {activeTooltipMission.name}
            </span>
            <span className="font-mono text-[10px] uppercase text-command-muted">
              P{activeTooltipMission.priority}
            </span>
          </div>

          <div className="space-y-0.5 text-[11px] font-mono text-command-muted mb-2">
            <div>Type: {activeTooltipMission.type}</div>
            <div>
              Window: {formatTimeZulu(activeTooltipMission.windowStart)} -{' '}
              {formatTimeZulu(activeTooltipMission.windowEnd)}
            </div>
            <div>Target: {activeTooltipMission.target.name}</div>
          </div>

          {/* Conflict warnings in tooltip */}
          {conflictsByMission.get(activeTooltipMission.id) && (
            <div className="mt-2 pt-1.5 border-t border-command-border space-y-1">
              {conflictsByMission.get(activeTooltipMission.id)?.map((cnf) => (
                <div
                  key={cnf.id}
                  className={cn(
                    'flex items-start gap-1.5 text-[10px] font-mono p-1 rounded-[1px] border',
                    cnf.severity === 'critical'
                      ? 'bg-command-critical-bg text-command-critical border-command-critical-border'
                      : 'bg-command-warning-bg text-command-warning border-command-warning-border',
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
          className="z-50 w-80 p-2.5 rounded-[1px] border border-command-border bg-command-panel text-xs pointer-events-none font-mono text-command-text"
        >
          <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-command-border">
            <div className="flex items-center gap-1.5 font-mono text-command-primary font-bold">
              <Target className="w-3.5 h-3.5 text-command-primary" />
              <span>PROPOSED RETASK</span>
            </div>
            <span className="font-mono text-[10px] text-command-primary font-bold">
              REC SCORE: {activeTooltipGhost.score}/100
            </span>
          </div>

          <p className="text-[11px] text-command-text mb-2 leading-relaxed font-mono">
            {activeTooltipGhost.summary}
          </p>

          <div className="text-[10px] font-mono text-command-muted bg-command-bg p-2 rounded-[1px] border border-command-border">
            <div>Target Sortie: {activeTooltipGhost.mission.name}</div>
            <div>
              Window: {formatTimeZulu(activeTooltipGhost.mission.windowStart)} -{' '}
              {formatTimeZulu(activeTooltipGhost.mission.windowEnd)}
            </div>
            <div className="text-command-primary mt-1 font-semibold">
              Click bar to inspect impacted mission & proposal
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
