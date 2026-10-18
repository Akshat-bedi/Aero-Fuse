import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import {
  Base,
  Aircraft,
  Mission,
  Threat,
  Airspace,
  WeatherState,
  LatLng,
} from '@/types';
import { useUiStore } from '@/store/uiStore';
import { useRecommendationsStore } from '@/store/recommendationsStore';
import { SelectedEntity, LayerVisibilityState, COMBAT_RADIUS_KM } from './types';
import { generateCirclePolygon, evaluateRouteRisk } from '@/lib/geo';
import landmassGeoJson from '@/assets/geo/landmass.json';
import terrainGeoJson from '@/assets/geo/terrain.json';
import riversGeoJson from '@/assets/geo/rivers.json';
import regionsGeoJson from '@/assets/geo/regions.json';
import graticuleGeoJson from '@/assets/geo/graticule.json';
import {
  Compass,
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface TacticalMapProps {
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  missions: Record<string, Mission>;
  threats: Record<string, Threat>;
  airspace: Record<string, Airspace>;
  weather: Record<string, WeatherState>;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity | null) => void;
  layers: LayerVisibilityState;
}

const OFFLINE_BASE_STYLE: StyleSpecification = {
  version: 8,
  name: 'AirOps-Tactical-Offline',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#080b11', // Near-black tactical base surface
      },
    },
  ],
};

export const TacticalMap: React.FC<TacticalMapProps> = ({
  bases,
  aircraft,
  missions,
  threats,
  airspace,
  weather,
  selectedEntity,
  onSelectEntity,
  layers,
}) => {
  const { mapPlanView, mapPlacementMode, impactedMissionIds } = useUiStore();
  const recommendations = useRecommendationsStore((s) => s.recommendations);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const isLoadedRef = useRef(false);
  const trailsRef = useRef<Record<string, LatLng[]>>({});

  const [cursorCoords, setCursorCoords] = useState<LatLng | null>(null);
  const [mapBearing, setMapBearing] = useState(0);

  const updateAllDynamicSourcesRef = useRef<(map: MapLibreMap) => void>(() => {});

  // Update cursor on map placement mode
  useEffect(() => {
    if (!mapRef.current) return;
    if (mapPlacementMode === 'threat') {
      mapRef.current.getCanvas().style.cursor = 'crosshair';
    } else {
      mapRef.current.getCanvas().style.cursor = '';
    }
  }, [mapPlacementMode]);

  // Initialize MapLibre GL map instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OFFLINE_BASE_STYLE,
      center: [6.0, 5.0], // Center on Republic of Veridia [lng, lat]
      zoom: 6.2,
      minZoom: 4.8,
      maxZoom: 13,
      bearing: 0,
      pitch: 0,
      maxBounds: [
        [-2.5, -2.0], // Southwest [lng, lat]
        [14.5, 12.0], // Northeast [lng, lat]
      ],
      attributionControl: false,
    });

    // Add scale bar in lower-left
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      isLoadedRef.current = true;
      setupStaticVectorSources(map);
      setupDynamicSources(map);
      updateAllDynamicSourcesRef.current(map);
    });

    map.on('mousemove', (e) => {
      setCursorCoords({
        lat: +e.lngLat.lat.toFixed(4),
        lng: +e.lngLat.lng.toFixed(4),
      });
    });

    map.on('mouseout', () => {
      setCursorCoords(null);
    });

    map.on('rotate', () => {
      setMapBearing(Math.round(map.getBearing()));
    });

    // Interactive clicking on vector entities
    const interactiveLayers = [
      'airbases-outer-ring',
      'aircraft-symbols',
      'mission-routes-layer',
      'threat-zones-fill',
      'airspace-fill',
    ];

    interactiveLayers.forEach((layerId) => {
      map.on('click', layerId, (e) => {
        if (useUiStore.getState().mapPlacementMode === 'threat') {
          return;
        }
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const entityType = feat.properties?.entityType;
        const entityId = feat.properties?.entityId || feat.properties?.id;

        if (entityType && entityId) {
          e.originalEvent.stopPropagation();
          onSelectEntity({ type: entityType, id: entityId });
        }
      });

      map.on('mouseenter', layerId, () => {
        if (useUiStore.getState().mapPlacementMode !== 'threat') {
          map.getCanvas().style.cursor = 'pointer';
        }
      });

      map.on('mouseleave', layerId, () => {
        if (useUiStore.getState().mapPlacementMode !== 'threat') {
          map.getCanvas().style.cursor = '';
        }
      });
    });

    // Clicking on map (or empty space)
    map.on('click', (e) => {
      if (useUiStore.getState().mapPlacementMode === 'threat') {
        useUiStore.getState().setPendingThreatCoords({
          lat: +e.lngLat.lat.toFixed(4),
          lng: +e.lngLat.lng.toFixed(4),
        });
        useUiStore.getState().setMapPlacementMode(null);
        return;
      }
      if (e.defaultPrevented) return;
      // If clicked on empty space, deselect
      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      if (features.length === 0) {
        onSelectEntity(null);
      }
    });

    mapRef.current = map;

    return () => {
      isLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectEntity]);

  // Setup static fictional geography vectors
  const setupStaticVectorSources = (map: MapLibreMap) => {
    // 1. Graticule
    map.addSource('veridia-graticule', {
      type: 'geojson',
      data: graticuleGeoJson as unknown as GeoJSON.FeatureCollection,
    });
    map.addLayer({
      id: 'graticule-lines',
      type: 'line',
      source: 'veridia-graticule',
      paint: {
        'line-color': '#1d2a44',
        'line-opacity': 0.45,
        'line-width': 1,
        'line-dasharray': [2, 4],
      },
    });
    map.addLayer({
      id: 'graticule-labels',
      type: 'symbol',
      source: 'veridia-graticule',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Open Sans Regular'],
        'text-size': 9,
        'text-offset': [0, 0.6],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#475569',
      },
    });

    // 2. Landmass
    map.addSource('veridia-landmass', {
      type: 'geojson',
      data: landmassGeoJson as unknown as GeoJSON.FeatureCollection,
    });
    map.addLayer({
      id: 'landmass-fill',
      type: 'fill',
      source: 'veridia-landmass',
      paint: {
        'line-color': '#0e1422',
        'fill-color': '#0e1422',
        'fill-opacity': 0.95,
      },
    });
    map.addLayer({
      id: 'landmass-coastline',
      type: 'line',
      source: 'veridia-landmass',
      paint: {
        'line-color': '#2a3b5c',
        'line-width': 1.8,
        'line-opacity': 0.9,
      },
    });

    // 3. Terrain
    map.addSource('veridia-terrain', {
      type: 'geojson',
      data: terrainGeoJson as unknown as GeoJSON.FeatureCollection,
    });
    map.addLayer({
      id: 'terrain-fill',
      type: 'fill',
      source: 'veridia-terrain',
      paint: {
        'fill-color': '#151e32',
        'fill-opacity': 0.7,
      },
    });
    map.addLayer({
      id: 'terrain-stroke',
      type: 'line',
      source: 'veridia-terrain',
      paint: {
        'line-color': '#1f2e4a',
        'line-width': 1,
        'line-dasharray': [3, 2],
      },
    });

    // 4. Rivers
    map.addSource('veridia-rivers', {
      type: 'geojson',
      data: riversGeoJson as unknown as GeoJSON.FeatureCollection,
    });
    map.addLayer({
      id: 'rivers-line',
      type: 'line',
      source: 'veridia-rivers',
      paint: {
        'line-color': '#1e3a5f',
        'line-width': 1.6,
        'line-opacity': 0.75,
      },
    });

    // 5. Regions
    map.addSource('veridia-regions', {
      type: 'geojson',
      data: regionsGeoJson as unknown as GeoJSON.FeatureCollection,
    });
    map.addLayer({
      id: 'regions-boundary',
      type: 'line',
      source: 'veridia-regions',
      paint: {
        'line-color': '#223354',
        'line-width': 1.2,
        'line-dasharray': [4, 4],
        'line-opacity': 0.6,
      },
    });
    map.addLayer({
      id: 'regions-labels',
      type: 'symbol',
      source: 'veridia-regions',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': 11,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.15,
      },
      paint: {
        'text-color': '#475569',
        'text-opacity': 0.65,
      },
    });
  };

  // Setup dynamic entity sources & visual layers
  const setupDynamicSources = (map: MapLibreMap) => {
    // Airspace
    map.addSource('airspace-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'airspace-fill',
      type: 'fill',
      source: 'airspace-source',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['get', 'fillOpacity'],
      },
    });
    map.addLayer({
      id: 'airspace-stroke',
      type: 'line',
      source: 'airspace-source',
      paint: {
        'line-color': ['get', 'strokeColor'],
        'line-width': 1.8,
        'line-dasharray': ['get', 'dashArray'],
      },
    });
    map.addLayer({
      id: 'airspace-labels',
      type: 'symbol',
      source: 'airspace-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-font': ['Open Sans Regular'],
      },
      paint: {
        'text-color': ['get', 'strokeColor'],
        'text-halo-color': '#080b11',
        'text-halo-width': 1.5,
      },
    });

    // Threat Zones
    map.addSource('threat-zones-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'threat-zones-fill',
      type: 'fill',
      source: 'threat-zones-source',
      paint: {
        'fill-color': '#ef4444',
        'fill-opacity': ['get', 'fillOpacity'],
      },
    });
    map.addLayer({
      id: 'threat-zones-stroke',
      type: 'line',
      source: 'threat-zones-source',
      paint: {
        'line-color': '#ef4444',
        'line-width': 1.5,
        'line-dasharray': ['get', 'dashArray'],
      },
    });
    map.addLayer({
      id: 'threat-zones-labels',
      type: 'symbol',
      source: 'threat-zones-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-font': ['Open Sans Regular'],
      },
      paint: {
        'text-color': '#f87171',
        'text-halo-color': '#080b11',
        'text-halo-width': 2,
      },
    });

    // Combat Radius Range Rings
    map.addSource('range-rings-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'range-rings-line',
      type: 'line',
      source: 'range-rings-source',
      paint: {
        'line-color': '#06b6d4',
        'line-width': 1.5,
        'line-dasharray': [3, 3],
        'line-opacity': 0.85,
      },
    });
    map.addLayer({
      id: 'range-rings-labels',
      type: 'symbol',
      source: 'range-rings-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
      },
      paint: {
        'text-color': '#22d3ee',
        'text-halo-color': '#080b11',
        'text-halo-width': 2,
      },
    });

    // Mission Routes
    map.addSource('mission-routes-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'mission-routes-layer',
      type: 'line',
      source: 'mission-routes-source',
      paint: {
        'line-color': ['get', 'routeColor'],
        'line-width': ['get', 'lineWidth'],
        'line-opacity': ['get', 'lineOpacity'],
        'line-dasharray': ['get', 'lineDash'],
      },
    });

    // Mission Route Risk Warning Segments
    map.addSource('mission-risk-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'mission-risk-layer',
      type: 'line',
      source: 'mission-risk-source',
      paint: {
        'line-color': '#ef4444',
        'line-width': 4,
        'line-dasharray': [2, 2],
        'line-opacity': 0.95,
      },
    });

    // Mission Waypoints & Targets
    map.addSource('mission-waypoints-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'mission-waypoints-circles',
      type: 'circle',
      source: 'mission-waypoints-source',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#f8fafc',
      },
    });
    map.addLayer({
      id: 'mission-waypoints-labels',
      type: 'symbol',
      source: 'mission-waypoints-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 9,
        'text-offset': [0, 1.2],
      },
      paint: {
        'text-color': '#e2e8f0',
        'text-halo-color': '#080b11',
        'text-halo-width': 2,
      },
    });

    // Flight Trails (Breadcrumbs)
    map.addSource('flight-trails-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'flight-trails-layer',
      type: 'line',
      source: 'flight-trails-source',
      paint: {
        'line-color': '#06b6d4',
        'line-width': 1.5,
        'line-opacity': 0.45,
        'line-dasharray': [1, 2],
      },
    });

    // Air Bases
    map.addSource('airbases-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'airbases-outer-ring',
      type: 'circle',
      source: 'airbases-source',
      paint: {
        'circle-radius': 11,
        'circle-color': 'transparent',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': ['get', 'statusColor'],
      },
    });
    map.addLayer({
      id: 'airbases-inner-dot',
      type: 'circle',
      source: 'airbases-source',
      paint: {
        'circle-radius': 5,
        'circle-color': '#06b6d4',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addLayer({
      id: 'airbases-labels',
      type: 'symbol',
      source: 'airbases-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0, 1.6],
        'text-font': ['Open Sans Regular'],
      },
      paint: {
        'text-color': '#f8fafc',
        'text-halo-color': '#080b11',
        'text-halo-width': 2,
      },
    });

    // Aircraft Tracks
    map.addSource('aircraft-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'aircraft-symbols',
      type: 'circle',
      source: 'aircraft-source',
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'statusColor'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#080b11',
      },
    });
    map.addLayer({
      id: 'aircraft-labels',
      type: 'symbol',
      source: 'aircraft-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 10,
        'text-offset': [0, 1.4],
        'text-font': ['Open Sans Regular'],
      },
      paint: {
        'text-color': '#22d3ee',
        'text-halo-color': '#080b11',
        'text-halo-width': 2,
      },
    });

    // Weather overlay
    map.addSource('weather-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'weather-badges',
      type: 'circle',
      source: 'weather-source',
      paint: {
        'circle-radius': 14,
        'circle-color': ['get', 'severityBg'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': ['get', 'severityColor'],
        'circle-opacity': 0.8,
      },
    });
    map.addLayer({
      id: 'weather-labels',
      type: 'symbol',
      source: 'weather-source',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 9,
      },
      paint: {
        'text-color': '#f8fafc',
        'text-halo-color': '#080b11',
        'text-halo-width': 1.5,
      },
    });
  };

  // Updates GeoJSON data for all operational layers without recreating MapLibre instance
  const updateAllDynamicSources = useCallback((map: MapLibreMap) => {
    if (!isLoadedRef.current) return;

    // 1. Airbases
    const baseFeatures = Object.values(bases).map((b) => ({
      type: 'Feature' as const,
      properties: {
        entityType: 'base',
        entityId: b.id,
        id: b.id,
        label: b.code || b.id,
        name: b.name,
        status: b.runwayStatus,
        statusColor:
          b.runwayStatus === 'open'
            ? '#10b981'
            : b.runwayStatus === 'degraded'
            ? '#f59e0b'
            : '#ef4444',
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [b.location.lng, b.location.lat],
      },
    }));
    (map.getSource('airbases-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: baseFeatures,
    });

    // 2. Aircraft & Flight Trails
    const aircraftList = Object.values(aircraft);
    const aircraftFeatures: GeoJSON.Feature[] = [];
    const trailFeatures: GeoJSON.Feature[] = [];

    aircraftList.forEach((ac) => {
      const pos = ac.position || bases[ac.baseId]?.location;
      if (!pos) return;

      // Track trail
      if (ac.status === 'airborne') {
        const hist = trailsRef.current[ac.id] || [];
        const lastPt = hist[hist.length - 1];
        if (!lastPt || lastPt.lat !== pos.lat || lastPt.lng !== pos.lng) {
          hist.push(pos);
          if (hist.length > 6) hist.shift();
          trailsRef.current[ac.id] = hist;
        }

        if (hist.length >= 2) {
          trailFeatures.push({
            type: 'Feature',
            properties: { id: ac.id },
            geometry: {
              type: 'LineString',
              coordinates: hist.map((p) => [p.lng, p.lat]),
            },
          });
        }
      }

      const isSelected = selectedEntity?.type === 'aircraft' && selectedEntity.id === ac.id;
      const statusColor =
        ac.status === 'airborne'
          ? isSelected
            ? '#22d3ee'
            : '#06b6d4'
          : ac.status === 'unserviceable'
          ? '#ef4444'
          : ac.status === 'maintenance'
          ? '#f59e0b'
          : '#10b981';

      aircraftFeatures.push({
        type: 'Feature',
        properties: {
          entityType: 'aircraft',
          entityId: ac.id,
          id: ac.id,
          callsign: ac.callsign || ac.tailNumber,
          label: `${ac.callsign || ac.tailNumber} (${ac.type})`,
          heading: ac.heading || 0,
          status: ac.status,
          statusColor,
          fuelPct: ac.fuelPct,
        },
        geometry: {
          type: 'Point',
          coordinates: [pos.lng, pos.lat],
        },
      });
    });

    (map.getSource('aircraft-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: aircraftFeatures,
    });

    (map.getSource('flight-trails-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: trailFeatures,
    });

    // 3. Combat Radius Range Rings (for selected aircraft)
    const rangeRingFeatures: GeoJSON.Feature[] = [];
    if (selectedEntity?.type === 'aircraft') {
      const selectedAc = aircraft[selectedEntity.id];
      if (selectedAc) {
        const acPos = selectedAc.position || bases[selectedAc.baseId]?.location;
        const radius = COMBAT_RADIUS_KM[selectedAc.type] || 450;
        if (acPos) {
          const ringCoords = generateCirclePolygon(acPos, radius);
          rangeRingFeatures.push({
            type: 'Feature',
            properties: {
              label: `${selectedAc.type} Combat Radius: ${radius}km`,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ringCoords],
            },
          });
        }
      }
    }
    (map.getSource('range-rings-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: rangeRingFeatures,
    });

    // 4. Mission Routes, Risk Highlights, and Waypoints
    const isAnyMissionSelected = selectedEntity?.type === 'mission';
    const missionRouteFeatures: GeoJSON.Feature[] = [];
    const missionRiskFeatures: GeoJSON.Feature[] = [];
    const waypointFeatures: GeoJSON.Feature[] = [];

    const activeThreatsList = Object.values(threats);
    const activeAirspacesList = Object.values(airspace);

    // Identify proposed reroutes from pending recommendations
    const pendingRecs = Object.values(recommendations).filter((r) => r.status === 'pending');
    const proposedReroutes: Record<string, string> = {};
    pendingRecs.forEach((r) => {
      r.changes?.forEach((c) => {
        if (c.kind === 'reroute' || c.type === 'MODIFY_ROUTE') {
          proposedReroutes[c.missionId] = String(c.after || c.toValue || 'Route C');
        }
      });
    });

    const isAfterPlanActive = mapPlanView === 'after';
    const hasAnyReroutes = Object.keys(proposedReroutes).length > 0;

    Object.values(missions).forEach((msn) => {
      const isImpacted = impactedMissionIds.includes(msn.id);
      const isThisSelected = isAnyMissionSelected && selectedEntity.id === msn.id;
      const hasProposedChange = Boolean(proposedReroutes[msn.id]);

      let routeToRender = msn.route;
      let isProposedOverlay = false;

      if (isAfterPlanActive && hasProposedChange && msn.routeOptions) {
        const proposedRouteName = proposedReroutes[msn.id];
        const matchOption =
          msn.routeOptions.find((ro) => ro.name === proposedRouteName) ||
          msn.routeOptions.find((ro) => ro.name.includes('Route C')) ||
          msn.routeOptions[2] ||
          msn.routeOptions[msn.routeOptions.length - 1];
        if (matchOption && matchOption.waypoints && matchOption.waypoints.length >= 2) {
          routeToRender = matchOption.waypoints;
          isProposedOverlay = true;
        }
      }

      if (!routeToRender || routeToRender.length < 2) return;

      // Color code by priority: P1 Red, P2 Amber, P3 Cyan, P4 Slate
      let pColor =
        msn.priority === 1
          ? '#ef4444'
          : msn.priority === 2
          ? '#f59e0b'
          : msn.priority === 3
          ? '#06b6d4'
          : '#64748b';

      if (isProposedOverlay) {
        pColor = '#22d3ee'; // High visibility glowing cyan polyline for proposed bypass
      } else if (isImpacted && !isAfterPlanActive) {
        pColor = '#ef4444'; // Pulsing red alert on impacted baseline
      }

      let lineOpacity = isAnyMissionSelected && !isThisSelected ? 0.15 : isThisSelected ? 1.0 : 0.75;
      if (isAfterPlanActive && hasAnyReroutes) {
        if (isProposedOverlay) {
          lineOpacity = 1.0;
        } else if (!isThisSelected) {
          lineOpacity = 0.15; // Unchanged routes are dimmed
        }
      }

      const lineWidth = isProposedOverlay ? 5.0 : isThisSelected ? 4.5 : isImpacted ? 4.0 : 2.5;
      const lineDash = isProposedOverlay ? [3, 2] : msn.status === 'in-progress' ? [1] : [2, 2];

      missionRouteFeatures.push({
        type: 'Feature',
        properties: {
          entityType: 'mission',
          entityId: msn.id,
          id: msn.id,
          name: isProposedOverlay ? `${msn.name} (PROPOSED BYPASS)` : msn.name,
          routeColor: pColor,
          lineWidth,
          lineOpacity,
          lineDash,
        },
        geometry: {
          type: 'LineString',
          coordinates: routeToRender.map((p) => [p.lng, p.lat]),
        },
      });

      // Evaluate route risk segments
      const riskAnalysis = evaluateRouteRisk(routeToRender, activeThreatsList, activeAirspacesList);
      riskAnalysis.segments.forEach((seg) => {
        if (seg.status === 'critical' || seg.status === 'caution') {
          missionRiskFeatures.push({
            type: 'Feature',
            properties: {
              missionId: msn.id,
              warning: seg.warningMessage,
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [seg.p1.lng, seg.p1.lat],
                [seg.p2.lng, seg.p2.lat],
              ],
            },
          });
        }
      });

      // Target and waypoints
      if (msn.target) {
        waypointFeatures.push({
          type: 'Feature',
          properties: {
            label: `TGT: ${msn.target.name || msn.name}`,
            color: '#ef4444',
            radius: isThisSelected ? 6 : 4,
          },
          geometry: {
            type: 'Point',
            coordinates: [msn.target.lng, msn.target.lat],
          },
        });
      }
    });

    (map.getSource('mission-routes-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: missionRouteFeatures,
    });

    (map.getSource('mission-risk-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: missionRiskFeatures,
    });

    (map.getSource('mission-waypoints-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: waypointFeatures,
    });

    // 5. Threat Zones
    const threatFeatures: GeoJSON.Feature[] = [];
    Object.values(threats).forEach((thr) => {
      const coords = generateCirclePolygon(thr.position, thr.rangeKm);
      const isSuspected = thr.status === 'suspected';
      threatFeatures.push({
        type: 'Feature',
        properties: {
          entityType: 'threat',
          entityId: thr.id,
          id: thr.id,
          label: `${thr.id} (${thr.type} ${thr.rangeKm}km - ${Math.round(thr.confidence * 100)}%)`,
          fillOpacity: isSuspected ? 0.12 : Math.min(0.35, Math.max(0.18, thr.confidence * 0.35)),
          dashArray: isSuspected ? [3, 3] : [1],
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coords],
        },
      });
    });
    (map.getSource('threat-zones-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: threatFeatures,
    });

    // 6. Airspace
    const airspaceFeatures: GeoJSON.Feature[] = [];
    Object.values(airspace).forEach((as) => {
      const isNoFly = as.type === 'no-fly';
      const isRestricted = as.type === 'restricted';
      const isCorridor = as.type === 'corridor';

      const fillColor = isNoFly
        ? '#ef4444'
        : isRestricted
        ? '#f59e0b'
        : isCorridor
        ? '#06b6d4'
        : '#f97316';

      const strokeColor = isNoFly
        ? '#ef4444'
        : isRestricted
        ? '#f59e0b'
        : isCorridor
        ? '#22d3ee'
        : '#ea580c';

      const dashArray = isCorridor ? [4, 2] : [1];

      airspaceFeatures.push({
        type: 'Feature',
        properties: {
          entityType: 'airspace',
          entityId: as.id,
          id: as.id,
          label: `${as.name} (${as.type.toUpperCase()})`,
          fillColor,
          strokeColor,
          fillOpacity: isNoFly ? 0.22 : 0.12,
          dashArray,
        },
        geometry: as.polygon as GeoJSON.Polygon,
      });
    });
    (map.getSource('airspace-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: airspaceFeatures,
    });

    // 7. Weather overlay
    const weatherFeatures: GeoJSON.Feature[] = [];
    Object.entries(weather).forEach(([baseId, w]) => {
      const b = bases[baseId];
      if (!b) return;

      const severityColor =
        w.severity === 'severe'
          ? '#ef4444'
          : w.severity === 'caution'
          ? '#f59e0b'
          : '#10b981';

      const severityBg =
        w.severity === 'severe'
          ? 'rgba(239, 68, 68, 0.25)'
          : w.severity === 'caution'
          ? 'rgba(245, 158, 11, 0.25)'
          : 'rgba(16, 185, 129, 0.25)';

      weatherFeatures.push({
        type: 'Feature',
        properties: {
          id: baseId,
          label: `${w.windKts}kt | ${w.visibilityKm}km`,
          severityColor,
          severityBg,
        },
        geometry: {
          type: 'Point',
          coordinates: [b.location.lng, b.location.lat],
        },
      });
    });
    (map.getSource('weather-source') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: weatherFeatures,
    });
  }, [bases, aircraft, missions, threats, airspace, weather, selectedEntity, mapPlanView, impactedMissionIds, recommendations]);

  updateAllDynamicSourcesRef.current = updateAllDynamicSources;

  // Synchronize on data updates
  useEffect(() => {
    if (mapRef.current && isLoadedRef.current) {
      updateAllDynamicSources(mapRef.current);
    }
  }, [updateAllDynamicSources]);

  // Synchronize layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    const setVisibility = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    // Static layers
    setVisibility('landmass-fill', layers.landmass);
    setVisibility('landmass-coastline', layers.landmass);
    setVisibility('terrain-fill', layers.terrain);
    setVisibility('terrain-stroke', layers.terrain);
    setVisibility('rivers-line', layers.rivers);
    setVisibility('regions-boundary', layers.regions);
    setVisibility('regions-labels', layers.regions);
    setVisibility('graticule-lines', layers.graticule);
    setVisibility('graticule-labels', layers.graticule);

    // Dynamic layers
    setVisibility('airbases-outer-ring', layers.airbases);
    setVisibility('airbases-inner-dot', layers.airbases);
    setVisibility('airbases-labels', layers.airbases);

    setVisibility('aircraft-symbols', layers.aircraft);
    setVisibility('aircraft-labels', layers.aircraft);
    setVisibility('flight-trails-layer', layers.flightTrails);

    setVisibility('mission-routes-layer', layers.missionRoutes);
    setVisibility('mission-waypoints-circles', layers.missionRoutes);
    setVisibility('mission-waypoints-labels', layers.missionRoutes);
    setVisibility('mission-risk-layer', layers.routeRisk);

    setVisibility('threat-zones-fill', layers.threatZones);
    setVisibility('threat-zones-stroke', layers.threatZones);
    setVisibility('threat-zones-labels', layers.threatZones);

    setVisibility('airspace-fill', layers.airspace);
    setVisibility('airspace-stroke', layers.airspace);
    setVisibility('airspace-labels', layers.airspace);

    setVisibility('weather-badges', layers.weatherOverlay);
    setVisibility('weather-labels', layers.weatherOverlay);

    setVisibility('range-rings-line', layers.rangeRings);
    setVisibility('range-rings-labels', layers.rangeRings);
  }, [layers]);

  // Pan / Fit theater bounds
  const handleResetView = () => {
    mapRef.current?.flyTo({
      center: [6.0, 5.0],
      zoom: 6.2,
      bearing: 0,
      pitch: 0,
      duration: 1000,
    });
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  return (
    <div className="relative w-full h-full bg-command-bg overflow-hidden select-none">
      {/* MapLibre GL Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full cursor-crosshair" />

      {/* Top Left: Theater & Operational Sector HUD */}
      <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1 z-10">
        <div className="flex items-center gap-2 bg-command-panel/90 backdrop-blur-md px-3 py-1.5 rounded border border-command-border/80 shadow-lg font-mono text-xs">
          <Crosshair className="w-3.5 h-3.5 text-command-primary animate-pulse" />
          <span className="font-bold text-command-heading tracking-wide">
            THEATER: REPUBLIC OF VERIDIA
          </span>
          <span className="text-[10px] text-command-muted border-l border-command-border pl-2">
            GRID: WGS-84 / VERIDIA LOCAL
          </span>
        </div>
      </div>

      {/* Top Right: Tactical Map Navigation & Zoom Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        <div className="flex flex-col bg-command-panel/90 backdrop-blur-md rounded border border-command-border/80 shadow-lg overflow-hidden">
          <button
            type="button"
            title="Reset North & Theater View"
            onClick={handleResetView}
            className="p-2 hover:bg-command-raised text-command-muted hover:text-command-primary transition-colors border-b border-command-border/60 flex items-center justify-center"
          >
            <Compass
              className="w-4 h-4 transition-transform duration-300"
              style={{ transform: `rotate(${-mapBearing}deg)` }}
            />
          </button>
          <button
            type="button"
            title="Zoom In"
            onClick={handleZoomIn}
            className="p-2 hover:bg-command-raised text-command-muted hover:text-command-primary transition-colors border-b border-command-border/60"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Zoom Out"
            onClick={handleZoomOut}
            className="p-2 hover:bg-command-raised text-command-muted hover:text-command-primary transition-colors border-b border-command-border/60"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Reset View"
            onClick={handleResetView}
            className="p-2 hover:bg-command-raised text-command-muted hover:text-command-primary transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Center: Live Cursor Coordinates HUD */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-command-panel/90 backdrop-blur-md px-4 py-1.5 rounded border border-command-border/80 shadow-xl font-mono text-xs flex items-center gap-4 text-command-muted">
          <div>
            LAT:{' '}
            <span className="text-command-heading font-bold">
              {cursorCoords ? `${cursorCoords.lat.toFixed(4)}°N` : '05.0000°N'}
            </span>
          </div>
          <div className="border-l border-command-border pl-4">
            LNG:{' '}
            <span className="text-command-heading font-bold">
              {cursorCoords ? `${cursorCoords.lng.toFixed(4)}°E` : '06.0000°E'}
            </span>
          </div>
          <div className="border-l border-command-border pl-4 text-[10px] text-command-primary">
            ELEV: ~1,400 FT MSL
          </div>
        </div>
      </div>
    </div>
  );
};
