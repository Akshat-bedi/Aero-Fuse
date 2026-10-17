import React, { useState } from 'react';
import { LayerVisibilityState } from './types';
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Shield,
  Plane,
  Radio,
  CloudRain,
  MapPin,
  Compass,
  AlertTriangle,
  Route,
} from 'lucide-react';

interface LayerControlPanelProps {
  layers: LayerVisibilityState;
  onToggleLayer: (layerKey: keyof LayerVisibilityState) => void;
  onSetAllLayers: (visible: boolean) => void;
}

export const LayerControlPanel: React.FC<LayerControlPanelProps> = ({
  layers,
  onToggleLayer,
  onSetAllLayers,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'legend'>('layers');

  const layerItems: {
    key: keyof LayerVisibilityState;
    label: string;
    icon: React.ReactNode;
    desc: string;
  }[] = [
    {
      key: 'airbases',
      label: 'Air Bases & Runways',
      icon: <MapPin className="w-3.5 h-3.5 text-command-primary" />,
      desc: 'Base locations with runway status rings',
    },
    {
      key: 'aircraft',
      label: 'Aircraft Tracks',
      icon: <Plane className="w-3.5 h-3.5 text-cyan-400" />,
      desc: 'Airframe positions, callsigns & headings',
    },
    {
      key: 'flightTrails',
      label: 'Flight Breadcrumbs',
      icon: <Route className="w-3.5 h-3.5 text-cyan-300" />,
      desc: 'Recent position trail for airborne sorties',
    },
    {
      key: 'missionRoutes',
      label: 'Mission Flight Paths',
      icon: <Route className="w-3.5 h-3.5 text-command-secondary" />,
      desc: 'Waypoints & priority-colored polylines',
    },
    {
      key: 'routeRisk',
      label: 'Route Risk Highlighting',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-command-critical" />,
      desc: 'Red glowing breach on compromised segments',
    },
    {
      key: 'threatZones',
      label: 'Threat Envelopes',
      icon: <Radio className="w-3.5 h-3.5 text-command-critical" />,
      desc: 'SAM & radar circles with confidence opacity',
    },
    {
      key: 'airspace',
      label: 'Airspace Sectors',
      icon: <Shield className="w-3.5 h-3.5 text-amber-400" />,
      desc: 'No-fly, restricted, corridors & danger zones',
    },
    {
      key: 'weatherOverlay',
      label: 'Weather Observation',
      icon: <CloudRain className="w-3.5 h-3.5 text-blue-400" />,
      desc: 'Base METAR severity badges & wind readings',
    },
    {
      key: 'rangeRings',
      label: 'Combat Radius Rings',
      icon: <Compass className="w-3.5 h-3.5 text-command-primary" />,
      desc: 'Endurance radius for selected airframe',
    },
    {
      key: 'graticule',
      label: 'Coordinate Graticule',
      icon: <Layers className="w-3.5 h-3.5 text-slate-400" />,
      desc: 'Tactical lat/long 1-degree coordinate grid',
    },
  ];

  return (
    <div className="absolute top-14 left-3 z-20 max-w-xs w-72">
      <div className="bg-command-panel/95 backdrop-blur-md rounded border border-command-border shadow-2xl overflow-hidden font-mono text-xs">
        {/* Header Bar */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Tactical Layers & Legend"
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between p-2.5 bg-command-raised/80 hover:bg-command-raised cursor-pointer border-b border-command-border/60 transition-colors"
        >
          <div className="flex items-center gap-2 text-command-heading font-bold">
            <Layers className="w-4 h-4 text-command-primary" />
            <span>TACTICAL OVERLAYS</span>
          </div>

          <div className="flex items-center gap-1.5 text-command-muted">
            <span className="text-[10px] uppercase font-sans">
              {isOpen ? 'Collapse' : 'Expand'}
            </span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {/* Collapsible Body */}
        {isOpen && (
          <div className="p-3 space-y-3">
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-0.5 rounded bg-command-bg border border-command-border text-center text-[11px]">
              <button
                type="button"
                onClick={() => setActiveTab('layers')}
                className={`py-1 rounded font-bold transition-colors ${
                  activeTab === 'layers'
                    ? 'bg-command-primary text-black'
                    : 'text-command-muted hover:text-command-text'
                }`}
              >
                Layer Toggles
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('legend')}
                className={`py-1 rounded font-bold transition-colors ${
                  activeTab === 'legend'
                    ? 'bg-command-primary text-black'
                    : 'text-command-muted hover:text-command-text'
                }`}
              >
                Symbology Legend
              </button>
            </div>

            {/* Tab Content: Layer Toggles */}
            {activeTab === 'layers' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-command-border/40 text-[10px] text-command-muted">
                  <span>ACTIVE OVERLAYS</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSetAllLayers(true)}
                      className="hover:text-command-primary transition-colors"
                    >
                      All On
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => onSetAllLayers(false)}
                      className="hover:text-command-primary transition-colors"
                    >
                      All Off
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {layerItems.map((item) => {
                    const isVisible = layers[item.key];
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors border ${
                          isVisible
                            ? 'bg-command-raised/50 border-command-border/80 text-command-text'
                            : 'bg-command-bg/40 border-transparent text-command-muted/70 hover:bg-command-bg'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => onToggleLayer(item.key)}
                          className="mt-0.5 rounded bg-command-panel border-command-border text-command-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </div>
                          <p className="text-[10px] text-command-subdued font-sans truncate">
                            {item.desc}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Tab Content: Symbology Legend */
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 text-[11px] font-sans">
                {/* Airbase Status */}
                <div>
                  <h4 className="font-mono text-[10px] font-bold text-command-muted uppercase mb-1">
                    Airbase Runway Status
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-cyan-500/30" />
                      <span className="text-command-text">Runway Open (Nominal ops)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-amber-500 bg-cyan-500/30" />
                      <span className="text-command-text">Runway Degraded (Crosswinds)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border-2 border-red-500 bg-cyan-500/30" />
                      <span className="text-command-text">Runway Closed (Divert required)</span>
                    </div>
                  </div>
                </div>

                {/* Mission Priorities */}
                <div className="border-t border-command-border/40 pt-2">
                  <h4 className="font-mono text-[10px] font-bold text-command-muted uppercase mb-1">
                    Mission Routes & Priorities
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-red-500" />
                      <span className="text-command-text">P1 Critical Urgent (Solid = Airborne)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-amber-500" />
                      <span className="text-command-text">P2 High Priority Sortie</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-cyan-400" />
                      <span className="text-command-text">P3 Routine Patrol / Airlift</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 border-t border-dashed border-red-500" />
                      <span className="text-red-400 font-medium">Glowing Red = Threat Breach</span>
                    </div>
                  </div>
                </div>

                {/* Threat Envelopes */}
                <div className="border-t border-command-border/40 pt-2">
                  <h4 className="font-mono text-[10px] font-bold text-command-muted uppercase mb-1">
                    Threat Envelopes
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
                      <span className="text-command-text">Active SAM / Fighter Ring</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500/15 border border-dashed border-red-400" />
                      <span className="text-command-text">Suspected Radar Contact</span>
                    </div>
                  </div>
                </div>

                {/* Airspace Types */}
                <div className="border-t border-command-border/40 pt-2">
                  <h4 className="font-mono text-[10px] font-bold text-command-muted uppercase mb-1">
                    Airspace Classifications
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-red-500/25 border border-red-500" />
                      <span className="text-command-text">No-Fly Zone (Strictly Prohibited)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500" />
                      <span className="text-command-text">Restricted Test Area</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded bg-cyan-500/15 border border-dashed border-cyan-400" />
                      <span className="text-command-text">Transit Airway Corridor</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
