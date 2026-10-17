import React, { useState, useCallback, useMemo } from 'react';
import { useEntitiesStore } from '@/store';
import { dataService } from '@/services';
import {
  TacticalMap,
  LayerControlPanel,
  EntityDetailPanel,
  TimeControls,
  RouteRiskIndicator,
} from '@/features/cop';
import {
  SelectedEntity,
  LayerVisibilityState,
  DEFAULT_LAYER_VISIBILITY,
} from './types';
import { ReadinessStrip } from '@/features/resources';
import {
  Plane,
  ShieldAlert,
  Route,
  Search,
} from 'lucide-react';

export const CopPage: React.FC = () => {
  // Global domain state from Zustand store
  const {
    bases,
    aircraft,
    missions,
    threats,
    airspace,
    weather,
    crew,
    simTime,
    speedMultiplier,
    updateMission,
  } = useEntitiesStore();

  // Selected tactical entity
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  // Layer visibility toggles
  const [layers, setLayers] = useState<LayerVisibilityState>(DEFAULT_LAYER_VISIBILITY);

  // Simulation execution state
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Quick asset search / jumping dropdown
  const [isJumpOpen, setIsJumpOpen] = useState<boolean>(false);

  // Toggle single layer
  const handleToggleLayer = useCallback((layerKey: keyof LayerVisibilityState) => {
    setLayers((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  }, []);

  // Set all layers
  const handleSetAllLayers = useCallback((visible: boolean) => {
    setLayers({
      landmass: visible,
      terrain: visible,
      rivers: visible,
      regions: visible,
      graticule: visible,
      airbases: visible,
      aircraft: visible,
      flightTrails: visible,
      missionRoutes: visible,
      threatZones: visible,
      airspace: visible,
      weatherOverlay: visible,
      rangeRings: visible,
      routeRisk: visible,
    });
  }, []);

  // Time / Speed Controls
  const handleSpeedChange = useCallback(
    (speed: 1 | 5 | 20) => {
      useEntitiesStore.setState({ speedMultiplier: speed });
      dataService.setSpeedMultiplier(speed);
      dataService.controlSimulation?.('speed', speed);
    },
    [],
  );

  const handleTogglePause = useCallback(() => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    dataService.controlSimulation?.(nextPaused ? 'pause' : 'resume');
  }, [isPaused]);

  const handleResetSim = useCallback(() => {
    setIsPaused(false);
    useEntitiesStore.setState({ speedMultiplier: 1 });
    dataService.controlSimulation?.('reset');
  }, []);

  // Selected mission (if any)
  const selectedMission = useMemo(() => {
    if (selectedEntity?.type === 'mission') {
      return missions[selectedEntity.id];
    }
    // If an aircraft is selected that has an assigned mission, grab that mission
    if (selectedEntity?.type === 'aircraft') {
      const ac = aircraft[selectedEntity.id];
      if (ac?.assignedMissionId) {
        return missions[ac.assignedMissionId];
      }
    }
    return undefined;
  }, [selectedEntity, missions, aircraft]);

  // Route alternative selection handler (e.g. Route C Detour)
  const handleSelectRouteOption = useCallback(
    (routeId: string) => {
      if (!selectedMission || !selectedMission.routeOptions) return;
      const option = selectedMission.routeOptions.find((r) => r.id === routeId);
      if (option && option.waypoints) {
        updateMission({
          id: selectedMission.id,
          route: option.waypoints,
        });
      }
    },
    [selectedMission, updateMission],
  );

  // Operational metrics for the tactical HUD
  const airborneCount = useMemo(
    () => Object.values(aircraft).filter((a) => a.status === 'airborne').length,
    [aircraft],
  );
  const serviceableCount = useMemo(
    () => Object.values(aircraft).filter((a) => a.status === 'serviceable').length,
    [aircraft],
  );
  const activeThreatsCount = useMemo(
    () => Object.values(threats).filter((t) => t.status === 'active').length,
    [threats],
  );
  const activeMissionsCount = useMemo(
    () => Object.values(missions).filter((m) => m.status === 'in-progress').length,
    [missions],
  );

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-command-bg select-none">
      {/* Tactical COP Header Bar */}
      <div className="relative z-10 flex items-center justify-between px-3 py-2 bg-command-panel/95 border-b border-command-border/80 backdrop-blur-md shadow-md">
        {/* Left: Situational Summary Badges */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-command-bg border border-command-border">
            <Plane className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-command-muted text-[10px]">AIRBORNE:</span>
            <span className="text-command-primary font-bold">{airborneCount}</span>
            <span className="text-command-subdued text-[10px]">
              / {airborneCount + serviceableCount} Ready
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-command-bg border border-command-border">
            <Route className="w-3.5 h-3.5 text-command-secondary" />
            <span className="text-command-muted text-[10px]">ACTIVE SORTIES:</span>
            <span className="text-command-heading font-bold">{activeMissionsCount}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-command-bg border border-command-border">
            <ShieldAlert className="w-3.5 h-3.5 text-command-critical" />
            <span className="text-command-muted text-[10px]">THREATS:</span>
            <span className="text-command-critical font-bold">{activeThreatsCount} Active</span>
          </div>
        </div>

        {/* Center: Simulation Clock & Speed Controls */}
        <TimeControls
          simTime={simTime}
          speedMultiplier={speedMultiplier}
          isPaused={isPaused}
          onSpeedChange={handleSpeedChange}
          onTogglePause={handleTogglePause}
          onReset={handleResetSim}
        />

        {/* Right: Quick Entity Navigation Jump */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsJumpOpen(!isJumpOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-command-bg hover:bg-command-raised text-command-text border border-command-border text-xs font-mono transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-command-muted" />
              <span className="hidden sm:inline">Tactical Jump</span>
            </button>

            {isJumpOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-command-panel border border-command-border rounded shadow-2xl p-2 z-30 font-mono text-xs">
                <div className="text-[10px] text-command-subdued uppercase font-bold px-1.5 py-1 border-b border-command-border/50">
                  Quick Focus Entities
                </div>
                <div className="py-1 max-h-56 overflow-y-auto space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'mission', id: 'M-04' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-command-raised text-command-secondary flex items-center justify-between"
                  >
                    <span>M-04 Strike (SAM Risk)</span>
                    <span className="text-[10px] text-red-400">P1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'threat', id: 'THR-02' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-command-raised text-command-critical flex items-center justify-between"
                  >
                    <span>THR-02 Long-Range SAM</span>
                    <span className="text-[10px]">85km</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'aircraft', id: 'AC-01' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-command-raised text-command-text flex items-center justify-between"
                  >
                    <span>AC-01 (Fighter-A CAP)</span>
                    <span className="text-[10px] text-cyan-400">Airborne</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'base', id: 'BASE-B' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded hover:bg-command-raised text-command-text flex items-center justify-between"
                  >
                    <span>BASE-B Bastion Strike</span>
                    <span className="text-[10px] text-amber-400">Degraded</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tactical Readiness Strip at the top of COP screen */}
      <div className="relative z-10 px-3 py-1 bg-command-panel/90 border-b border-command-border/60 flex items-center justify-between overflow-x-auto">
        <ReadinessStrip isCompact className="border-0 bg-transparent p-0 shadow-none" />
        <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-command-subdued">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>THEATRE READINESS: NOMINAL</span>
        </div>
      </div>

      {/* Main Map Canvas Stage */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {/* Tactical MapLibre GL Canvas */}
        <TacticalMap
          bases={bases}
          aircraft={aircraft}
          missions={missions}
          threats={threats}
          airspace={airspace}
          weather={weather}
          selectedEntity={selectedEntity}
          onSelectEntity={setSelectedEntity}
          layers={layers}
        />

        {/* Collapsible Layer Control & Symbology Legend */}
        <LayerControlPanel
          layers={layers}
          onToggleLayer={handleToggleLayer}
          onSetAllLayers={handleSetAllLayers}
        />

        {/* Route Risk Alert Banner (when selected mission penetrates threat zones) */}
        {selectedMission && (
          <RouteRiskIndicator
            mission={selectedMission}
            threats={threats}
            airspace={airspace}
            onSelectRouteOption={handleSelectRouteOption}
          />
        )}

        {/* Right Detail Inspection Drawer (when an entity is selected) */}
        {selectedEntity && (
          <EntityDetailPanel
            selectedEntity={selectedEntity}
            onClose={() => setSelectedEntity(null)}
            bases={bases}
            aircraft={aircraft}
            missions={missions}
            threats={threats}
            airspace={airspace}
            weather={weather}
            crew={crew}
            onSelectEntity={setSelectedEntity}
          />
        )}

        {/* Bottom Status Bar */}
        <div className="absolute bottom-1 right-2 z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-command-panel/85 backdrop-blur-md px-2.5 py-1 rounded border border-command-border/70 text-[10px] font-mono text-command-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>LOCAL VECTOR ENGINE: 60 FPS NOMINAL</span>
            <span className="text-command-subdued">|</span>
            <span>VERIDIA THEATRE [EXERCISE]</span>
          </div>
        </div>
      </div>
    </div>
  );
};
