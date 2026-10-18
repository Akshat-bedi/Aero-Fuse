import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useEntitiesStore, useUiStore } from '@/store';
import { dataService } from '@/services';
import {
  TacticalMap,
  LayerControlPanel,
  EntityDetailPanel,
  TimeControls,
  RouteRiskIndicator,
  ImpactBanner,
  PlanCompareToggle,
} from '@/features/cop';
import {
  SelectedEntity,
  LayerVisibilityState,
  DEFAULT_LAYER_VISIBILITY,
} from './types';
import { ReadinessStrip } from '@/features/resources';
import { ReplanProgressIndicator, RecommendationPreviewCard } from '@/features/recommendations';
import { ScenarioControlPanel } from '@/features/scenarios';
import {
  Plane,
  ShieldAlert,
  Route,
  Search,
  Sliders,
} from 'lucide-react';

export const CopPage: React.FC = () => {
  // Global domain state from Zustand store using narrow selectors
  const bases = useEntitiesStore((s) => s.bases);
  const aircraft = useEntitiesStore((s) => s.aircraft);
  const missions = useEntitiesStore((s) => s.missions);
  const threats = useEntitiesStore((s) => s.threats);
  const airspace = useEntitiesStore((s) => s.airspace);
  const weather = useEntitiesStore((s) => s.weather);
  const crew = useEntitiesStore((s) => s.crew);
  const simTime = useEntitiesStore((s) => s.simTime);
  const speedMultiplier = useEntitiesStore((s) => s.speedMultiplier);
  const updateMission = useEntitiesStore((s) => s.updateMission);

  const selectedMissionId = useUiStore((s) => s.selectedMissionId);
  const selectMission = useUiStore((s) => s.selectMission);
  const toggleScenarioControl = useUiStore((s) => s.toggleScenarioControl);

  // Selected tactical entity
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  // Sync selectedEntity with global selectedMissionId
  useEffect(() => {
    if (selectedMissionId) {
      setSelectedEntity((prev) => {
        if (prev?.type === 'mission' && prev.id === selectedMissionId) return prev;
        return { type: 'mission', id: selectedMissionId };
      });
    }
  }, [selectedMissionId]);

  const handleSelectEntity = useCallback(
    (entity: SelectedEntity | null) => {
      setSelectedEntity(entity);
      if (entity?.type === 'mission') {
        selectMission(entity.id);
      } else if (entity?.type === 'aircraft') {
        const ac = useEntitiesStore.getState().aircraft[entity.id];
        selectMission(ac?.assignedMissionId || null);
      } else if (entity === null) {
        selectMission(null);
      }
    },
    [selectMission],
  );

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
      <div className="relative z-10 flex items-center justify-between px-2.5 py-1.5 bg-command-panel border-b border-command-border">
        {/* Left: Situational Summary Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border">
            <Plane className="w-3.5 h-3.5 text-command-primary" />
            <span className="text-command-muted text-[10px]">AIRBORNE:</span>
            <span className="text-command-primary font-bold tabular-nums">{airborneCount}</span>
            <span className="text-command-subdued text-[10px] tabular-nums">
              / {airborneCount + serviceableCount} RDY
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border">
            <Route className="w-3.5 h-3.5 text-command-primary" />
            <span className="text-command-muted text-[10px]">ACTIVE SORTIES:</span>
            <span className="text-command-heading font-bold tabular-nums">{activeMissionsCount}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-[1px] bg-command-bg border border-command-border">
            <ShieldAlert className="w-3.5 h-3.5 text-command-critical" />
            <span className="text-command-muted text-[10px]">THREATS:</span>
            <span className="text-command-critical font-bold tabular-nums">{activeThreatsCount} ACT</span>
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

        {/* Right: Simulation Controls & Quick Entity Navigation Jump */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleScenarioControl()}
            aria-label="Simulation Controls"
            className="flex items-center gap-1.5 px-2 py-1 rounded-[1px] bg-command-bg hover:bg-command-raised text-command-primary border border-command-border text-xs font-mono transition-none"
            title="Open Simulation Controls (Event Injection & Demo Scripts)"
          >
            <Sliders className="w-3.5 h-3.5 text-command-primary" />
            <span className="hidden sm:inline">SIM CONTROLS</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsJumpOpen(!isJumpOpen)}
              aria-label="Tactical Jump"
              title="Tactical Jump"
              className="flex items-center gap-1.5 px-2 py-1 rounded-[1px] bg-command-bg hover:bg-command-raised text-command-text border border-command-border text-xs font-mono transition-none"
            >
              <Search className="w-3.5 h-3.5 text-command-muted" />
              <span className="hidden sm:inline">JUMP</span>
            </button>

            {isJumpOpen && (
              <div className="absolute right-0 mt-1 w-60 bg-command-panel border border-command-border rounded-[1px] p-1.5 z-30 font-mono text-xs">
                <div className="text-[10px] text-command-muted uppercase font-bold px-1.5 py-1 border-b border-command-border">
                  Quick Focus Entities
                </div>
                <div className="py-1 max-h-56 overflow-y-auto space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'mission', id: 'M-04' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-[1px] hover:bg-command-raised text-command-primary flex items-center justify-between"
                  >
                    <span>M-04 Strike (SAM Risk)</span>
                    <span className="text-[10px] text-command-critical font-bold">P1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'threat', id: 'THR-02' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-[1px] hover:bg-command-raised text-command-critical flex items-center justify-between"
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
                    className="w-full text-left px-2 py-1 rounded-[1px] hover:bg-command-raised text-command-text flex items-center justify-between"
                  >
                    <span>AC-01 (Fighter-A CAP)</span>
                    <span className="text-[10px] text-command-info">Airborne</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntity({ type: 'base', id: 'BASE-B' });
                      setIsJumpOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 rounded-[1px] hover:bg-command-raised text-command-text flex items-center justify-between"
                  >
                    <span>BASE-B Bastion Strike</span>
                    <span className="text-[10px] text-command-warning">Degraded</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tactical Readiness Strip at the top of COP screen */}
      <div className="relative z-10 px-3 py-1 bg-command-panel/90 border-b border-command-border/60 flex items-center justify-between overflow-x-auto gap-3">
        <ReadinessStrip isCompact className="border-0 bg-transparent p-0 shadow-none" />
        <div className="flex items-center gap-3 shrink-0">
          <PlanCompareToggle />
          <div className="hidden md:flex items-center gap-2 font-mono text-[10px] text-command-subdued">
            <span className="w-1.5 h-1.5 rounded-[1px] bg-command-nominal" />
            <span>THEATRE: NOMINAL</span>
          </div>
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
          onSelectEntity={handleSelectEntity}
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
            onClose={() => handleSelectEntity(null)}
            bases={bases}
            aircraft={aircraft}
            missions={missions}
            threats={threats}
            airspace={airspace}
            weather={weather}
            crew={crew}
            onSelectEntity={handleSelectEntity}
          />
        )}

        {/* Stage 6: Operational Impact Advisory Banner */}
        <ImpactBanner />

        {/* Stage 6: AI Retasking Progression Bar */}
        <ReplanProgressIndicator />

        {/* Stage 6: Recommendation Decision Preview Card */}
        <RecommendationPreviewCard />

        {/* Stage 6: Scenario Control Panel (Slide-over drawer) */}
        <ScenarioControlPanel />

        {/* Bottom Status Bar */}
        <div className="absolute bottom-1 right-2 z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-command-panel px-2 py-0.5 rounded-[1px] border border-command-border text-[9px] font-mono text-command-muted">
            <span className="inline-block w-1.5 h-1.5 rounded-[1px] bg-command-nominal" />
            <span>LOCAL VECTOR ENGINE: 60 FPS NOMINAL</span>
            <span className="text-command-subdued">/</span>
            <span>VERIDIA THEATRE [EXERCISE]</span>
          </div>
        </div>
      </div>
    </div>
  );
};
