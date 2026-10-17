export type EntityType = 'aircraft' | 'base' | 'mission' | 'threat' | 'airspace';

export interface SelectedEntity {
  type: EntityType;
  id: string;
}

export interface LayerVisibilityState {
  landmass: boolean;
  terrain: boolean;
  rivers: boolean;
  regions: boolean;
  graticule: boolean;
  airbases: boolean;
  aircraft: boolean;
  flightTrails: boolean;
  missionRoutes: boolean;
  threatZones: boolean;
  airspace: boolean;
  weatherOverlay: boolean;
  rangeRings: boolean;
  routeRisk: boolean;
}

export const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = {
  landmass: true,
  terrain: true,
  rivers: true,
  regions: true,
  graticule: true,
  airbases: true,
  aircraft: true,
  flightTrails: true,
  missionRoutes: true,
  threatZones: true,
  airspace: true,
  weatherOverlay: true,
  rangeRings: true,
  routeRisk: true,
};

export const COMBAT_RADIUS_KM: Record<string, number> = {
  'Fighter-A': 450,
  'Strike-B': 650,
  'Transport-C': 1100,
  'Recon-D': 800,
  'Helicopter-E': 220,
};
