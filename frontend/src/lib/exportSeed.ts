import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_BASES,
  SEED_WEAPON_STOCKS,
  generateSeedAircraft,
  generateSeedCrew,
  generateSeedMissions,
  generateSeedAirspace,
  generateSeedThreats,
  generateSeedPredictions,
} from '@/services/mockDataService';
import {
  Base,
  Aircraft,
  Crew,
  Mission,
  Airspace,
  Threat,
  WeatherState,
  WeaponStock,
  Prediction,
  Recommendation,
  MapBounds,
  SimState,
} from '@/types';

export interface WireSnapshotExport {
  stateVersion: number;
  sim: SimState;
  bounds: MapBounds;
  bases: Base[];
  aircraft: Aircraft[];
  crew: Crew[];
  missions: Mission[];
  airspace: Airspace[];
  threats: Threat[];
  weather: WeatherState[];
  weaponStocks: WeaponStock[];
  recommendations: Recommendation[];
  predictions: Prediction[];
  activeEvents: unknown[];
  auditLog: unknown[];
}

/**
 * Deterministically sorts all object keys recursively at every level.
 */
export function sortKeysDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep) as unknown as T;
  }
  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(value).sort();
  for (const k of keys) {
    sortedObj[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
  }
  return sortedObj as T;
}

/**
 * Builds the canonical clean default baseline WireSnapshot conforming to API_CONTRACT.md.
 * - includeConflicts: false (VITE_MOCK_CONFLICTS=false)
 * - 4 bases, 24 aircraft, 30 crew, 10 missions (with routeOptions)
 * - stateVersion: 1
 * - sim: { time, speed: 1, paused: false }
 * - bounds: { minLat: 0, maxLat: 10, minLng: 0, maxLng: 12 }
 * - empty recommendations
 */
export function buildCleanSeedWorld(anchorTime: Date = new Date('2026-10-17T12:00:00Z')): WireSnapshotExport {
  const simTimeIso = anchorTime.toISOString();

  // 1. Bases (4) sorted by ID
  const bases: Base[] = Object.values(SEED_BASES).sort((a, b) => a.id.localeCompare(b.id));

  // 2. Aircraft (24) sorted by ID
  const aircraft: Aircraft[] = Object.values(generateSeedAircraft()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // 3. Crew (30) sorted by ID
  const crew: Crew[] = Object.values(generateSeedCrew()).sort((a, b) => a.id.localeCompare(b.id));

  // 4. Missions (10) sorted by ID (with routeOptions verified on every mission)
  const rawMissions = generateSeedMissions(false, anchorTime);
  const missions: Mission[] = Object.values(rawMissions)
    .map((m) => {
      const routeOpts = m.routeOptions && m.routeOptions.length > 0
        ? [...m.routeOptions].sort((a, b) => a.id.localeCompare(b.id))
        : [
            {
              id: 'Route A',
              name: 'Route A (Primary Planned Flightpath)',
              waypoints: m.route,
              distanceKm: 250,
              riskScore: 10,
            },
          ];
      return {
        ...m,
        routeOptions: routeOpts,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  // 5. Airspace (4) sorted by ID
  const airspace: Airspace[] = Object.values(generateSeedAirspace()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // 6. Threats (4) sorted by ID
  const threats: Threat[] = Object.values(generateSeedThreats()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  // 7. Weather (4) sorted by baseId
  const weather: WeatherState[] = bases.map((b) => b.weather).sort((a, b) =>
    (a.baseId || '').localeCompare(b.baseId || ''),
  );

  // 8. Weapon Stocks (24) sorted by baseId, then weaponType
  const weaponStocks: WeaponStock[] = [...SEED_WEAPON_STOCKS].sort((a, b) => {
    const cmp = a.baseId.localeCompare(b.baseId);
    return cmp !== 0 ? cmp : a.weaponType.localeCompare(b.weaponType);
  });

  // 9. Predictions sorted by entityId, then metric
  const predictions: Prediction[] = generateSeedPredictions(anchorTime).sort((a, b) => {
    const cmp = a.entityId.localeCompare(b.entityId);
    return cmp !== 0 ? cmp : a.metric.localeCompare(b.metric);
  });

  // 10. Map bounds (Republic of Veridia operational space)
  const bounds: MapBounds = {
    minLat: 0,
    maxLat: 10,
    minLng: 0,
    maxLng: 12,
  };

  // 11. Complete WireSnapshot object
  const rawExport: WireSnapshotExport = {
    stateVersion: 1,
    sim: {
      time: simTimeIso,
      speed: 1,
      paused: false,
    },
    bounds,
    bases,
    aircraft,
    crew,
    weaponStocks,
    missions,
    airspace,
    threats,
    weather,
    predictions,
    recommendations: [],
    activeEvents: [],
    auditLog: [],
  };

  return sortKeysDeep(rawExport);
}

/**
 * Returns the default file path to ../shared/seed/world.json
 */
export function getDefaultExportPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, '../../../shared/seed/world.json');
}

/**
 * Generates the clean baseline snapshot and writes it deterministically to disk.
 */
export function exportSeedToFile(targetFilePath?: string): {
  filePath: string;
  byteLength: number;
  data: WireSnapshotExport;
} {
  const destination = targetFilePath || getDefaultExportPath();
  const data = buildCleanSeedWorld();
  const jsonContent = JSON.stringify(data, null, 2) + '\n';

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, jsonContent, 'utf-8');

  return {
    filePath: destination,
    byteLength: Buffer.byteLength(jsonContent, 'utf-8'),
    data,
  };
}
