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
      icon: <Plane className="w-3.5 h-3.5 text-command-primary" />,
      desc: 'Airframe positions, callsigns & headings',
    },
    {
      key: 'flightTrails',
      label: 'Flight Breadcrumbs',
      icon: <Route className="w-3.5 h-3.5 text-command-secondary" />,
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
    <div className="absolute top-12 left-2 z-20 max-w-xs w-72">
      <div className="bg-command-panel rounded-[2px] border border-command-border overflow-hidden font-mono text-xs">
        {/* Header Bar */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Tactical Layers & Legend"
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between p-2 bg-command-raised hover:bg-command-raised-hover cursor-pointer border-b border-command-border transition-none"
        >
          <div className="flex items-center gap-2 text-command-heading font-bold">
            <Layers className="w-4 h-4 text-command-primary" />
            <span>TACTICAL OVERLAYS</span>
          </div>

          <div className="flex items-center gap-1.5 text-command-muted">
            <span className="text-[10px] uppercase font-mono">
              {isOpen ? 'Collapse' : 'Expand'}
            </span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {/* Collapsible Body */}
        {isOpen && (
          <div className="p-2.5 space-y-2.5">
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-0.5 rounded-[1px] bg-command-bg border border-command-border text-center text-[10px]">
              <button
                type="button"
                onClick={() => setActiveTab('layers')}
                className={`py-1 rounded-[1px] font-bold font-mono uppercase transition-none ${
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
                className={`py-1 rounded-[1px] font-bold font-mono uppercase transition-none ${
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
                <div className="flex items-center justify-between pb-1 border-b border-command-border text-[10px] text-command-muted">
                  <span>ACTIVE OVERLAYS</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSetAllLayers(true)}
                      className="hover:text-command-primary transition-none"
                    >
                      All On
                    </button>
                    <span>/</span>
                    <button
                      type="button"
                      onClick={() => onSetAllLayers(false)}
                      className="hover:text-command-primary transition-none"
                    >
                      All Off
                    </button>
                  </div>
                </div>

                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {layerItems.map((item) => {
                    const isVisible = layers[item.key];
                    return (
                      <label
                        key={item.key}
                        className={`flex items-start gap-2 p-1.5 rounded-[1px] cursor-pointer transition-none border ${
                          isVisible
                            ? 'bg-command-raised/50 border-command-border text-command-text'
                            : 'bg-command-bg/40 border-transparent text-command-muted/70 hover:bg-command-bg'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => onToggleLayer(item.key)}
                          className="mt-0.5 rounded-[1px] bg-command-panel border-command-border text-command-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            {item.icon}
                            <span className="truncate">{item.label}</span>
                          </div>
                          <p className="text-[10px] text-command-subdued font-mono truncate">
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
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 text-[10px] font-mono">
                {/* Airbase Status */}
                <div>
                  <h4 className="text-[10px] font-bold text-command-muted uppercase mb-1">
                    Airbase Runway Status
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] border border-command-nominal bg-command-panel" />
                      <span className="text-command-text">Runway Open (Nominal)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] border border-command-warning bg-command-panel" />
                      <span className="text-command-text">Runway Degraded (Caution)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] border border-command-critical bg-command-panel" />
                      <span className="text-command-text">Runway Closed (Divert)</span>
                    </div>
                  </div>
                </div>

                {/* Mission Priorities */}
                <div className="border-t border-command-border pt-2">
                  <h4 className="text-[10px] font-bold text-command-muted uppercase mb-1">
                    Mission Routes & Priorities
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-command-critical" />
                      <span className="text-command-text">P1 Critical (2.5px)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-command-warning" />
                      <span className="text-command-text">P2 High Priority (2.0px)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 bg-[#4a7bb0]" />
                      <span className="text-command-text">P3 Routine Patrol (1.5px)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-0.5 border-t border-dashed border-command-critical" />
                      <span className="text-command-critical font-medium">Compromised Segment Warning</span>
                    </div>
                  </div>
                </div>

                {/* Threat Envelopes */}
                <div className="border-t border-command-border pt-2">
                  <h4 className="text-[10px] font-bold text-command-muted uppercase mb-1">
                    Threat Envelopes
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] bg-command-critical/10 border border-command-critical" />
                      <span className="text-command-text">Confirmed SAM / Radar Zone</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] bg-command-warning/10 border border-dashed border-command-warning" />
                      <span className="text-command-text">Suspected Radar Contact</span>
                    </div>
                  </div>
                </div>

                {/* Airspace Types */}
                <div className="border-t border-command-border pt-2">
                  <h4 className="text-[10px] font-bold text-command-muted uppercase mb-1">
                    Airspace Classifications
                  </h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] bg-command-critical/15 border border-command-critical" />
                      <span className="text-command-text">No-Fly Zone (Restricted)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] bg-command-warning/15 border border-command-warning" />
                      <span className="text-command-text">Caution Area (Military)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[1px] bg-[#5b8ec2]/15 border border-dashed border-[#5b8ec2]" />
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
