import {
  IDataService,
  ModificationValidationResult,
  EligibleResourcesResult,
  AuditVerificationResult,
  DemoScriptItem,
} from './dataService';
import {
  OperationalSnapshot,
  OpsEvent,
  Recommendation,
  ScenarioParams,
  ScenarioResult,
  AuditEntry,
  Base,
  Aircraft,
  Crew,
  Mission,
  Airspace,
  Threat,
  WeaponStock,
  Prediction,
  MapBounds,
  RetaskProgressState,
  ImpactAnalysisPayload,
  RetaskStage,
  AircraftType,
} from '@/types';
import { mockRetaskEngine } from './mockRetaskEngine';
import { serviceConfig } from './config';

/* =========================================================================
   FICTIONAL INITIAL SEED DATA ("Republic of Veridia")
   Strictly generic & fictional order-of-battle (Core Principle 3 & context.md)
   Operational Bounding Box: lat 0.0 - 10.0, lng 0.0 - 12.0
   ========================================================================= */

export const MOCK_MAP_BOUNDS: MapBounds = {
  minLat: 0.0,
  maxLat: 10.0,
  minLng: 0.0,
  maxLng: 12.0,
};

const SEED_BASES: Record<string, Base> = {
  'BASE-A': {
    id: 'BASE-A',
    name: 'Sector Alpha Fighter Base',
    code: 'BASE-A',
    location: { lat: 8.5, lng: 3.5 },
    runwayStatus: 'open',
    fuelStockPct: 92,
    shelterCapacity: 16,
    weather: {
      baseId: 'BASE-A',
      visibilityKm: 18,
      cloudBaseFt: 4500,
      windKts: 12,
      severity: 'nominal',
      forecast: [
        { time: '2026-10-17T12:00:00Z', severity: 'nominal', visibilityKm: 18, windKts: 12 },
        { time: '2026-10-17T18:00:00Z', severity: 'nominal', visibilityKm: 16, windKts: 14 },
      ],
    },
  },
  'BASE-B': {
    id: 'BASE-B',
    name: 'North Bastion Strike Base',
    code: 'BASE-B',
    location: { lat: 5.2, lng: 6.8 },
    runwayStatus: 'degraded',
    fuelStockPct: 65,
    shelterCapacity: 24,
    weather: {
      baseId: 'BASE-B',
      visibilityKm: 6,
      cloudBaseFt: 1200,
      windKts: 28,
      severity: 'caution',
      forecast: [
        { time: '2026-10-17T12:00:00Z', severity: 'caution', visibilityKm: 6, windKts: 28 },
        { time: '2026-10-17T18:00:00Z', severity: 'severe', visibilityKm: 3, windKts: 36 },
      ],
    },
  },
  'BASE-C': {
    id: 'BASE-C',
    name: 'Charlie Logistics & Transport Hub',
    code: 'BASE-C',
    location: { lat: 1.8, lng: 4.2 },
    runwayStatus: 'open',
    fuelStockPct: 88,
    shelterCapacity: 20,
    weather: {
      baseId: 'BASE-C',
      visibilityKm: 22,
      cloudBaseFt: 5000,
      windKts: 10,
      severity: 'nominal',
      forecast: [
        { time: '2026-10-17T12:00:00Z', severity: 'nominal', visibilityKm: 22, windKts: 10 },
        { time: '2026-10-17T18:00:00Z', severity: 'nominal', visibilityKm: 20, windKts: 12 },
      ],
    },
  },
  'BASE-D': {
    id: 'BASE-D',
    name: 'Delta Eastern Forward Strip',
    code: 'BASE-D',
    location: { lat: 4.6, lng: 10.5 },
    runwayStatus: 'open',
    fuelStockPct: 78,
    shelterCapacity: 10,
    weather: {
      baseId: 'BASE-D',
      visibilityKm: 25,
      cloudBaseFt: 6000,
      windKts: 8,
      severity: 'nominal',
      forecast: [
        { time: '2026-10-17T12:00:00Z', severity: 'nominal', visibilityKm: 25, windKts: 8 },
        { time: '2026-10-17T18:00:00Z', severity: 'nominal', visibilityKm: 24, windKts: 10 },
      ],
    },
  },
};

const SEED_WEAPON_STOCKS: WeaponStock[] = [
  // BASE-A (Fighter Intercept Focus)
  { baseId: 'BASE-A', weaponType: 'GENERIC-AAM-M', quantity: 64 },
  { baseId: 'BASE-A', weaponType: 'GENERIC-AAM-S', quantity: 96 },
  { baseId: 'BASE-A', weaponType: 'PGM-Mk2', quantity: 24 },
  { baseId: 'BASE-A', weaponType: 'GENERIC-ANTIRADAR', quantity: 6 }, // LOW STOCK
  { baseId: 'BASE-A', weaponType: 'GENERIC-CARGO-PALLET', quantity: 18 },
  { baseId: 'BASE-A', weaponType: 'GENERIC-RECON-POD', quantity: 8 },

  // BASE-B (Strike Bastion)
  { baseId: 'BASE-B', weaponType: 'GENERIC-AAM-M', quantity: 48 },
  { baseId: 'BASE-B', weaponType: 'GENERIC-AAM-S', quantity: 52 },
  { baseId: 'BASE-B', weaponType: 'PGM-Mk2', quantity: 48 },
  { baseId: 'BASE-B', weaponType: 'GENERIC-ANTIRADAR', quantity: 18 },
  { baseId: 'BASE-B', weaponType: 'GENERIC-CARGO-PALLET', quantity: 22 },
  { baseId: 'BASE-B', weaponType: 'GENERIC-RECON-POD', quantity: 4 }, // LOW STOCK

  // BASE-C (Transport & Logistics Hub)
  { baseId: 'BASE-C', weaponType: 'GENERIC-AAM-M', quantity: 14 }, // LOW STOCK
  { baseId: 'BASE-C', weaponType: 'GENERIC-AAM-S', quantity: 32 },
  { baseId: 'BASE-C', weaponType: 'PGM-Mk2', quantity: 12 }, // LOW STOCK
  { baseId: 'BASE-C', weaponType: 'GENERIC-ANTIRADAR', quantity: 0 }, // OUT OF STOCK
  { baseId: 'BASE-C', weaponType: 'GENERIC-CARGO-PALLET', quantity: 120 },
  { baseId: 'BASE-C', weaponType: 'GENERIC-RECON-POD', quantity: 2 }, // LOW STOCK

  // BASE-D (Eastern Forward Recon Strip)
  { baseId: 'BASE-D', weaponType: 'GENERIC-AAM-M', quantity: 16 }, // LOW STOCK
  { baseId: 'BASE-D', weaponType: 'GENERIC-AAM-S', quantity: 24 },
  { baseId: 'BASE-D', weaponType: 'PGM-Mk2', quantity: 8 }, // LOW STOCK
  { baseId: 'BASE-D', weaponType: 'GENERIC-ANTIRADAR', quantity: 4 }, // LOW STOCK
  { baseId: 'BASE-D', weaponType: 'GENERIC-CARGO-PALLET', quantity: 14 },
  { baseId: 'BASE-D', weaponType: 'GENERIC-RECON-POD', quantity: 12 },
];

export function generateSeedAircraft(): Record<string, Aircraft> {
  const aircraft: Record<string, Aircraft> = {};

  // 8 x Fighter-A (AC-01 .. AC-08)
  for (let i = 1; i <= 8; i++) {
    const id = `AC-${i.toString().padStart(2, '0')}`;
    const baseId = i <= 5 ? 'BASE-A' : i <= 7 ? 'BASE-B' : 'BASE-D';
    const isAirborne = i === 1 || i === 3;
    aircraft[id] = {
      id,
      tailNumber: `VR-F0${i}`,
      callsign: `VAPOR-1${i}`,
      type: 'Fighter-A',
      baseId,
      status: isAirborne ? 'airborne' : i === 2 ? 'unserviceable' : i === 6 ? 'maintenance' : 'serviceable',
      fuelPct: isAirborne ? 74 : i === 2 ? 18 : 95,
      flightHoursToNextService: i * 18 + 25,
      weaponLoad: [
        { weaponType: 'GENERIC-AAM-M', quantity: 2 },
        { weaponType: 'GENERIC-AAM-S', quantity: 2 },
      ],
      position: isAirborne
        ? i === 1
          ? { lat: 8.6, lng: 4.8 }
          : { lat: 2.2, lng: 5.1 }
        : { ...SEED_BASES[baseId].location },
      heading: isAirborne ? 65 : 0,
      speed: isAirborne ? 420 : 0,
      assignedMissionId: i === 1 ? 'M-01' : i === 3 ? 'M-03' : undefined,
    };
  }

  // 6 x Strike-B (AC-09 .. AC-14)
  // AC-07 from context.md example:
  // "id": "AC-07", "tailNumber": "VR-S07", "type": "Strike-B", "baseId": "BASE-B", "status": "airborne",
  // "fuelPct": 62.5, "flightHoursToNextService": 18.4, "weaponLoad": [{"weaponType": "PGM-Mk2", "quantity": 4}],
  // "position": {"lat": 4.21, "lng": 6.88}, "heading": 74, "speed": 430, "assignedMissionId": "M-04"
  aircraft['AC-07'] = {
    id: 'AC-07',
    tailNumber: 'VR-S07',
    callsign: 'HAMMER-07',
    type: 'Strike-B',
    baseId: 'BASE-B',
    status: 'airborne',
    fuelPct: 62.5,
    flightHoursToNextService: 18.4,
    weaponLoad: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
    position: { lat: 4.21, lng: 6.88 },
    heading: 74,
    speed: 430,
    assignedMissionId: 'M-04',
  };

  for (let i = 9; i <= 14; i++) {
    const id = `AC-${i.toString().padStart(2, '0')}`;
    const isServiceable = i !== 14;
    aircraft[id] = {
      id,
      tailNumber: `VR-S${i.toString().padStart(2, '0')}`,
      callsign: `STRIKER-${i}`,
      type: 'Strike-B',
      baseId: 'BASE-B',
      status: isServiceable ? 'serviceable' : 'turnaround',
      fuelPct: isServiceable ? 88 : 42,
      flightHoursToNextService: i * 15 + 12,
      weaponLoad: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      position: { ...SEED_BASES['BASE-B'].location },
      heading: 0,
      speed: 0,
      assignedMissionId: i === 9 ? 'M-07' : undefined,
    };
  }

  // 4 x Transport-C (AC-15 .. AC-18)
  for (let i = 15; i <= 18; i++) {
    const id = `AC-${i.toString().padStart(2, '0')}`;
    const isAirborne = i === 15;
    aircraft[id] = {
      id,
      tailNumber: `VR-T${i}`,
      callsign: `HERC-2${i - 14}`,
      type: 'Transport-C',
      baseId: 'BASE-C',
      status: isAirborne ? 'airborne' : 'serviceable',
      fuelPct: isAirborne ? 82 : 98,
      flightHoursToNextService: 140,
      weaponLoad: [],
      position: isAirborne ? { lat: 3.2, lng: 5.5 } : { ...SEED_BASES['BASE-C'].location },
      heading: isAirborne ? 45 : 0,
      speed: isAirborne ? 310 : 0,
      assignedMissionId: i === 15 ? 'M-05' : undefined,
    };
  }

  // 3 x Recon-D (AC-19 .. AC-21)
  for (let i = 19; i <= 21; i++) {
    const id = `AC-${i.toString().padStart(2, '0')}`;
    const isAirborne = i === 19;
    aircraft[id] = {
      id,
      tailNumber: `VR-R${i}`,
      callsign: `SHADOW-3${i - 18}`,
      type: 'Recon-D',
      baseId: 'BASE-D',
      status: isAirborne ? 'airborne' : 'serviceable',
      fuelPct: isAirborne ? 68 : 94,
      flightHoursToNextService: 85,
      weaponLoad: [{ weaponType: 'GENERIC-RECON-POD', quantity: 1 }],
      position: isAirborne ? { lat: 5.8, lng: 9.6 } : { ...SEED_BASES['BASE-D'].location },
      heading: isAirborne ? 180 : 0,
      speed: isAirborne ? 380 : 0,
      assignedMissionId: i === 19 ? 'M-02' : undefined,
    };
  }

  // 3 x Helicopter-E (AC-22 .. AC-24)
  for (let i = 22; i <= 24; i++) {
    const id = `AC-${i.toString().padStart(2, '0')}`;
    aircraft[id] = {
      id,
      tailNumber: `VR-H${i}`,
      callsign: `DUSTOFF-4${i - 21}`,
      type: 'Helicopter-E',
      baseId: i === 22 ? 'BASE-D' : 'BASE-A',
      status: 'serviceable',
      fuelPct: 90,
      flightHoursToNextService: 45,
      weaponLoad: [],
      position: { ...(i === 22 ? SEED_BASES['BASE-D'].location : SEED_BASES['BASE-A'].location) },
      heading: 0,
      speed: 0,
      assignedMissionId: i === 22 ? 'M-08' : undefined,
    };
  }

  return aircraft;
}

export function generateSeedCrew(): Record<string, Crew> {
  const crew: Record<string, Crew> = {};
  const CALLSIGNS = [
    'VIPER', 'HAWK', 'RAVEN', 'MAVERICK', 'COBRA', 'EAGLE', 'SPECTRE', 'VALKYRIE',
    'SHADOW', 'TALON', 'BOLT', 'APEX', 'HUNTER', 'SENTRY', 'FALCON', 'ARCHER',
    'GRIFFIN', 'CYCLONE', 'STORM', 'BLIZZARD', 'THUNDER', 'DAGGER', 'SABRE', 'ARROW',
    'ORBIT', 'VECTOR', 'PHOENIX', 'TITAN', 'HERCULES', 'CHOPPER',
  ];

  for (let i = 1; i <= 30; i++) {
    const id = `CR-${i.toString().padStart(2, '0')}`;
    const baseId = i <= 10 ? 'BASE-A' : i <= 18 ? 'BASE-B' : i <= 24 ? 'BASE-D' : 'BASE-C';
    const isOnMission = i === 1 || i === 3 || i === 4 || i === 7 || i === 15 || i === 19;
    const isCritical = i === 8;
    const isWarning1 = i === 14;
    const isWarning2 = i === 21;
    const isCR22 = i === 22;

    const fatigue = isCritical ? 86 : isWarning1 ? 78 : isWarning2 ? 72 : isCR22 ? 28 : isOnMission ? 52 : ((i * 7 + 11) % 35) + 12;
    const dutyHours = isCritical ? 11.2 : isWarning1 ? 10.5 : isWarning2 ? 9.8 : isCR22 ? 4.2 : isOnMission ? 6.4 : +(((i * 3 + 5) % 8) + 1.5).toFixed(1);

    const qualifications =
      i <= 10
        ? ['AAM_COMBAT', 'NIGHT_OPS', 'TACTICAL_DATALINK', 'HIGH_G_QUAL']
        : i <= 18
        ? ['PGM_DELIVERY', 'SEAD_STRIKE', 'TACTICAL_DATALINK', 'LOW_LEVEL_INGRESS']
        : i <= 24
        ? ['OPTICAL_RECON', 'SAR_RADAR', 'INSTRUMENT_RATING', 'EW_ANALYSIS']
        : ['HEAVY_AIRLIFT', 'INSTRUMENT_RATING', 'AERIAL_REFUEL', 'MEDEVAC'];

    crew[id] = {
      id,
      callsign: CALLSIGNS[i - 1] || `PILOT-${i}`,
      role: i <= 10 ? 'Lead Fighter Pilot' : i <= 18 ? 'Strike Weapons Officer' : i <= 24 ? 'Recon Systems Operator' : 'Heavy Transport Captain',
      qualifications,
      baseId,
      fatigueIndex: fatigue,
      dutyHoursLast24h: dutyHours,
      status: isOnMission ? 'on-mission' : isCritical ? 'unavailable' : i % 5 === 0 ? 'resting' : 'available',
    };
  }

  return crew;
}

export function generateSeedMissions(includeConflicts = false, baseTime?: Date): Record<string, Mission> {
  const now = baseTime || new Date();
  const isoNow = now.toISOString();
  const isoMinus4h = new Date(now.getTime() - 4 * 3600000).toISOString();
  const isoPlus4h = new Date(now.getTime() + 4 * 3600000).toISOString();
  const isoPlus5h = new Date(now.getTime() + 5 * 3600000).toISOString();
  const isoPlus7h = new Date(now.getTime() + 7 * 3600000).toISOString();
  const isoPlus8h = new Date(now.getTime() + 8 * 3600000).toISOString();
  const isoPlus8h15m = new Date(now.getTime() + (8 * 3600000 + 15 * 60000)).toISOString();
  const isoPlus11h = new Date(now.getTime() + 11 * 3600000).toISOString();

  const missions: Record<string, Mission> = {
    'M-01': {
      id: 'M-01',
      name: 'Northern Sentinel (CAP)',
      type: 'CAP',
      priority: 1,
      status: 'in-progress',
      launchBaseId: 'BASE-A',
      target: { lat: 8.8, lng: 5.2, name: 'CAP Anchor Point Alpha' },
      route: [
        { lat: 8.5, lng: 3.5 },
        { lat: 8.6, lng: 4.5 },
        { lat: 8.8, lng: 5.2 },
        { lat: 8.7, lng: 4.8 },
        { lat: 8.5, lng: 3.5 },
      ],
      routeOptions: [
        {
          id: 'Route A',
          name: 'Route A (Direct High-Altitude)',
          waypoints: [
            { lat: 8.5, lng: 3.5 },
            { lat: 8.6, lng: 4.5 },
            { lat: 8.8, lng: 5.2 },
            { lat: 8.5, lng: 3.5 },
          ],
          distanceKm: 240,
          riskScore: 12,
        },
        {
          id: 'Route B',
          name: 'Route B (Buffer Patrol)',
          waypoints: [
            { lat: 8.5, lng: 3.5 },
            { lat: 8.9, lng: 4.2 },
            { lat: 8.8, lng: 5.2 },
            { lat: 8.5, lng: 3.5 },
          ],
          distanceKm: 285,
          riskScore: 28,
        },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Fighter-A',
      requiredCrewQuals: ['AAM_COMBAT'],
      requiredWeapons: [{ weaponType: 'GENERIC-AAM-M', quantity: 2 }],
      assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-01'] },
      currentWaypointIndex: 1,
    },
    'M-02': {
      id: 'M-02',
      name: 'Eastern Border Recon Orbit',
      type: 'recon',
      priority: 2,
      status: 'in-progress',
      launchBaseId: 'BASE-D',
      target: { lat: 6.5, lng: 9.8, name: 'Recon Sector Echo' },
      route: [
        { lat: 4.6, lng: 10.5 },
        { lat: 5.5, lng: 10.2 },
        { lat: 6.5, lng: 9.8 },
        { lat: 5.8, lng: 9.6 },
        { lat: 4.6, lng: 10.5 },
      ],
      routeOptions: [
        {
          id: 'Route A',
          name: 'Route A (Baseline Orbit)',
          waypoints: [
            { lat: 4.6, lng: 10.5 },
            { lat: 5.8, lng: 9.6 },
            { lat: 6.5, lng: 9.8 },
            { lat: 4.6, lng: 10.5 },
          ],
          distanceKm: 320,
          riskScore: 18,
        },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Recon-D',
      requiredCrewQuals: ['INSTRUMENT_RATING'],
      requiredWeapons: [{ weaponType: 'GENERIC-RECON-POD', quantity: 1 }],
      assigned: { aircraftIds: ['AC-19'], crewIds: ['CR-19'] },
      currentWaypointIndex: 2,
    },
    'M-03': {
      id: 'M-03',
      name: 'Southern Sea Approach Patrol',
      type: 'CAP',
      priority: 2,
      status: 'in-progress',
      launchBaseId: 'BASE-C',
      target: { lat: 2.5, lng: 5.5, name: 'South Channel Anchor' },
      route: [
        { lat: 1.8, lng: 4.2 },
        { lat: 2.1, lng: 4.8 },
        { lat: 2.5, lng: 5.5 },
        { lat: 2.0, lng: 5.0 },
        { lat: 1.8, lng: 4.2 },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Fighter-A',
      requiredCrewQuals: ['AAM_COMBAT'],
      requiredWeapons: [{ weaponType: 'GENERIC-AAM-M', quantity: 2 }],
      assigned: { aircraftIds: ['AC-03'], crewIds: ['CR-03'] },
      currentWaypointIndex: 1,
    },
    'M-04': {
      id: 'M-04',
      name: 'Central Precision Strike Sortie',
      type: 'strike',
      priority: 1,
      status: 'in-progress',
      launchBaseId: 'BASE-B',
      target: { lat: 4.5, lng: 8.5, name: 'Contested Logistics Hub Oscar' },
      route: [
        { lat: 5.2, lng: 6.8 },
        { lat: 4.8, lng: 7.4 },
        { lat: 4.5, lng: 8.5 },
        { lat: 5.2, lng: 6.8 },
      ],
      routeOptions: [
        {
          id: 'Route A',
          name: 'Route A (Northern Approach)',
          waypoints: [
            { lat: 5.2, lng: 6.8 },
            { lat: 5.8, lng: 7.6 },
            { lat: 4.5, lng: 8.5 },
            { lat: 5.2, lng: 6.8 },
          ],
          distanceKm: 340,
          riskScore: 22,
        },
        {
          id: 'Route B',
          name: 'Route B (Direct Corridor - Intersects SAM THR-02)',
          waypoints: [
            { lat: 5.2, lng: 6.8 },
            { lat: 4.8, lng: 7.4 },
            { lat: 4.5, lng: 8.5 },
            { lat: 5.2, lng: 6.8 },
          ],
          distanceKm: 310,
          riskScore: 88,
        },
        {
          id: 'Route C',
          name: 'Route C (Southern Dogleg Bypass)',
          waypoints: [
            { lat: 5.2, lng: 6.8 },
            { lat: 3.8, lng: 6.0 },
            { lat: 3.2, lng: 6.8 },
            { lat: 3.8, lng: 7.8 },
            { lat: 4.5, lng: 8.5 },
            { lat: 3.8, lng: 7.8 },
            { lat: 3.2, lng: 6.8 },
            { lat: 3.8, lng: 6.0 },
            { lat: 5.2, lng: 6.8 },
          ],
          distanceKm: 395,
          riskScore: 10,
        },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Strike-B',
      requiredCrewQuals: ['TACTICAL_DATALINK'],
      requiredWeapons: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      assigned: { aircraftIds: ['AC-07'], crewIds: ['CR-07'] },
      currentWaypointIndex: 1,
    },
    'M-05': {
      id: 'M-05',
      name: 'Inter-Base Munitions Airlift',
      type: 'airlift',
      priority: 3,
      status: 'in-progress',
      launchBaseId: 'BASE-C',
      target: { lat: 5.2, lng: 6.8, name: 'BASE-B Munitions Ramp' },
      route: [
        { lat: 1.8, lng: 4.2 },
        { lat: 3.2, lng: 5.5 },
        { lat: 5.2, lng: 6.8 },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Transport-C',
      requiredCrewQuals: ['INSTRUMENT_RATING'],
      requiredWeapons: [],
      assigned: { aircraftIds: ['AC-15'], crewIds: ['CR-25'] },
      currentWaypointIndex: 1,
    },
    'M-06': {
      id: 'M-06',
      name: 'Quick Reaction Alert (QRA)',
      type: 'CAP',
      priority: 1,
      status: 'planned',
      launchBaseId: 'BASE-A',
      target: { lat: 7.8, lng: 4.0, name: 'North Sector Buffer Line' },
      route: [
        { lat: 8.5, lng: 3.5 },
        { lat: 7.8, lng: 4.0 },
        { lat: 8.5, lng: 3.5 },
      ],
      windowStart: isoPlus4h,
      windowEnd: isoPlus8h,
      requiredAircraftType: 'Fighter-A',
      requiredCrewQuals: ['AAM_COMBAT'],
      requiredWeapons: [{ weaponType: 'GENERIC-AAM-M', quantity: 2 }],
      assigned: { aircraftIds: ['AC-04'], crewIds: ['CR-04'] },
    },
    'M-07': {
      id: 'M-07',
      name: 'Offensive Counter-Air Sweep',
      type: 'strike',
      priority: 2,
      status: 'approved',
      launchBaseId: 'BASE-B',
      target: { lat: 4.8, lng: 8.2, name: 'Hostile Airfield Bravo Radar' },
      route: [
        { lat: 5.2, lng: 6.8 },
        { lat: 4.8, lng: 8.2 },
        { lat: 5.2, lng: 6.8 },
      ],
      windowStart: isoPlus4h,
      windowEnd: isoPlus8h,
      requiredAircraftType: 'Strike-B',
      requiredCrewQuals: ['TACTICAL_DATALINK'],
      requiredWeapons: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-11'] },
    },
    'M-08': {
      id: 'M-08',
      name: 'Forward Strip CSAR Standby',
      type: 'SAR',
      priority: 2,
      status: 'planned',
      launchBaseId: 'BASE-D',
      target: { lat: 5.0, lng: 10.0, name: 'Mountain Ridge Evac Box' },
      route: [
        { lat: 4.6, lng: 10.5 },
        { lat: 5.0, lng: 10.0 },
        { lat: 4.6, lng: 10.5 },
      ],
      windowStart: isoPlus4h,
      windowEnd: isoPlus8h,
      requiredAircraftType: 'Helicopter-E',
      requiredCrewQuals: ['SAR_RADAR'],
      requiredWeapons: [],
      assigned: { aircraftIds: ['AC-22'], crewIds: ['CR-22'] },
    },
    'M-09': {
      id: 'M-09',
      name: 'Electronic Warfare Escort',
      type: 'escort',
      priority: 3,
      status: 'planned',
      launchBaseId: 'BASE-A',
      target: { lat: 7.2, lng: 6.5, name: 'Standoff Jamming Orbit Zulu' },
      route: [
        { lat: 8.5, lng: 3.5 },
        { lat: 7.2, lng: 6.5 },
        { lat: 8.5, lng: 3.5 },
      ],
      windowStart: isoPlus4h,
      windowEnd: isoPlus8h,
      requiredAircraftType: 'Recon-D',
      requiredCrewQuals: ['INSTRUMENT_RATING'],
      requiredWeapons: [{ weaponType: 'GENERIC-RECON-POD', quantity: 1 }],
      assigned: { aircraftIds: ['AC-20'], crewIds: ['CR-20'] },
    },
    'M-10': {
      id: 'M-10',
      name: 'Scheduled Personnel Rotation',
      type: 'airlift',
      priority: 4,
      status: 'planned',
      launchBaseId: 'BASE-C',
      target: { lat: 4.6, lng: 10.5, name: 'BASE-D Personnel Terminal' },
      route: [
        { lat: 1.8, lng: 4.2 },
        { lat: 3.2, lng: 7.5 },
        { lat: 4.6, lng: 10.5 },
      ],
      windowStart: isoPlus4h,
      windowEnd: isoPlus8h,
      requiredAircraftType: 'Transport-C',
      requiredCrewQuals: ['INSTRUMENT_RATING'],
      requiredWeapons: [],
      assigned: { aircraftIds: ['AC-16'], crewIds: ['CR-26'] },
    },
  };

  if (includeConflicts) {
    missions['M-11'] = {
      id: 'M-11',
      name: 'Northern Interdiction Strike',
      type: 'strike',
      priority: 1,
      status: 'at-risk',
      launchBaseId: 'BASE-B',
      target: { lat: 4.5, lng: 8.5, name: 'Contested Radar Site Victor' },
      route: [
        { lat: 5.2, lng: 6.8 },
        { lat: 4.8, lng: 7.5 },
        { lat: 4.5, lng: 8.5 },
        { lat: 5.2, lng: 6.8 },
      ],
      routeOptions: [
        {
          id: 'Route A',
          name: 'Route A (Direct SAM Penetration)',
          waypoints: [
            { lat: 5.2, lng: 6.8 },
            { lat: 4.8, lng: 7.5 },
            { lat: 4.5, lng: 8.5 },
            { lat: 5.2, lng: 6.8 },
          ],
          distanceKm: 310,
          riskScore: 85,
        },
        {
          id: 'Route B',
          name: 'Route B (Low-Altitude Valley Ingress)',
          waypoints: [
            { lat: 5.2, lng: 6.8 },
            { lat: 4.2, lng: 7.0 },
            { lat: 4.5, lng: 8.5 },
            { lat: 5.2, lng: 6.8 },
          ],
          distanceKm: 360,
          riskScore: 35,
        },
      ],
      windowStart: isoNow,
      windowEnd: isoPlus4h,
      requiredAircraftType: 'Strike-B',
      requiredCrewQuals: ['SEAD_STRIKE', 'TACTICAL_DATALINK'],
      requiredWeapons: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      assigned: { aircraftIds: ['AC-23'], crewIds: ['CR-08'] },
    };

    missions['M-12'] = {
      id: 'M-12',
      name: 'Border Patrol Sweep Post-Strike',
      type: 'recon',
      priority: 3,
      status: 'completed',
      launchBaseId: 'BASE-D',
      target: { lat: 5.5, lng: 10.2, name: 'Recon Sector Bravo' },
      route: [
        { lat: 4.6, lng: 10.5 },
        { lat: 5.5, lng: 10.2 },
        { lat: 4.6, lng: 10.5 },
      ],
      windowStart: isoMinus4h,
      windowEnd: isoNow,
      requiredAircraftType: 'Recon-D',
      requiredCrewQuals: ['INSTRUMENT_RATING'],
      requiredWeapons: [{ weaponType: 'GENERIC-RECON-POD', quantity: 1 }],
      assigned: { aircraftIds: ['AC-21'], crewIds: ['CR-21'] },
    };

    missions['M-13'] = {
      id: 'M-13',
      name: 'Reinforced Combat Air Patrol',
      type: 'CAP',
      priority: 2,
      status: 'planned',
      launchBaseId: 'BASE-A',
      target: { lat: 8.2, lng: 4.8, name: 'CAP Gate Victor' },
      route: [
        { lat: 8.5, lng: 3.5 },
        { lat: 8.2, lng: 4.8 },
        { lat: 8.5, lng: 3.5 },
      ],
      windowStart: isoPlus5h,
      windowEnd: isoPlus7h,
      requiredAircraftType: 'Fighter-A',
      requiredCrewQuals: ['AAM_COMBAT'],
      requiredWeapons: [{ weaponType: 'GENERIC-AAM-M', quantity: 2 }],
      assigned: { aircraftIds: ['AC-04'], crewIds: ['CR-04'] },
    };

    missions['M-14'] = {
      id: 'M-14',
      name: 'Secondary Supply Staging Sweep',
      type: 'strike',
      priority: 3,
      status: 'planned',
      launchBaseId: 'BASE-B',
      target: { lat: 4.2, lng: 7.2, name: 'Forward Staging Yard' },
      route: [
        { lat: 5.2, lng: 6.8 },
        { lat: 4.2, lng: 7.2 },
        { lat: 5.2, lng: 6.8 },
      ],
      windowStart: isoPlus8h15m,
      windowEnd: isoPlus11h,
      requiredAircraftType: 'Strike-B',
      requiredCrewQuals: ['TACTICAL_DATALINK'],
      requiredWeapons: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-12'] },
    };
  }

  return missions;
}

function generateSeedAirspace(): Record<string, Airspace> {
  return {
    'AS-01': {
      id: 'AS-01',
      name: 'Corridor North-Transit (Echo)',
      type: 'corridor',
      activeFrom: '2026-10-17T00:00:00Z',
      activeTo: '2026-10-17T23:59:59Z',
      floorFt: 15000,
      ceilingFt: 35000,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [2.5, 7.8],
            [6.0, 7.8],
            [6.0, 8.8],
            [2.5, 8.8],
            [2.5, 7.8],
          ],
        ],
      },
    },
    'AS-02': {
      id: 'AS-02',
      name: 'Restricted Range Bravo (Weapons Test)',
      type: 'restricted',
      activeFrom: '2026-10-17T06:00:00Z',
      activeTo: '2026-10-17T18:00:00Z',
      floorFt: 0,
      ceilingFt: 45000,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [6.5, 3.5],
            [8.5, 3.5],
            [8.5, 5.5],
            [6.5, 5.5],
            [6.5, 3.5],
          ],
        ],
      },
    },
    'AS-03': {
      id: 'AS-03',
      name: 'No-Fly Buffer Zone (Northern Border)',
      type: 'no-fly',
      activeFrom: '2026-10-17T00:00:00Z',
      activeTo: '2026-10-17T23:59:59Z',
      floorFt: 0,
      ceilingFt: 60000,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [1.0, 9.2],
            [11.0, 9.2],
            [11.0, 9.9],
            [1.0, 9.9],
            [1.0, 9.2],
          ],
        ],
      },
    },
    'AS-04': {
      id: 'AS-04',
      name: 'Eastern Maritime Danger Area',
      type: 'danger',
      activeFrom: '2026-10-17T10:00:00Z',
      activeTo: '2026-10-17T22:00:00Z',
      floorFt: 0,
      ceilingFt: 25000,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [9.5, 1.0],
            [11.5, 1.0],
            [11.5, 3.5],
            [9.5, 3.5],
            [9.5, 1.0],
          ],
        ],
      },
    },
  };
}

function generateSeedThreats(): Record<string, Threat> {
  return {
    'THR-01': {
      id: 'THR-01',
      type: 'SAM',
      position: { lat: 7.5, lng: 5.0 },
      rangeKm: 65,
      confidence: 0.85,
      lastSeen: '2026-10-17T11:45:00Z',
      status: 'active',
    },
    'THR-02': {
      id: 'THR-02',
      type: 'SAM',
      position: { lat: 4.8, lng: 7.5 },
      rangeKm: 85,
      confidence: 0.90,
      lastSeen: '2026-10-17T12:00:00Z',
      status: 'active',
    },
    'THR-03': {
      id: 'THR-03',
      type: 'radar',
      position: { lat: 6.2, lng: 8.8 },
      rangeKm: 120,
      confidence: 0.75,
      lastSeen: '2026-10-17T11:30:00Z',
      status: 'active',
    },
    'THR-04': {
      id: 'THR-04',
      type: 'fighter',
      position: { lat: 3.5, lng: 9.0 },
      rangeKm: 45,
      confidence: 0.60,
      lastSeen: '2026-10-17T12:05:00Z',
      status: 'suspected',
    },
  };
}

function generateSeedPredictions(): Prediction[] {
  const now = new Date().toISOString();
  return [
    {
      entityType: 'aircraft',
      entityId: 'AC-14',
      metric: 'serviceability_risk',
      value: 0.72,
      confidence: 0.72,
      horizonMinutes: 360,
      createdAt: now,
      message: 'Aircraft AC-14 likely unserviceable within 6h (confidence 72%)',
    },
    {
      entityType: 'crew',
      entityId: 'CR-09',
      metric: 'fatigue_risk',
      value: 0.88,
      confidence: 0.90,
      horizonMinutes: 180,
      createdAt: now,
      message: 'Crew CR-09 fatigue critical after next sortie',
    },
    {
      entityType: 'base',
      entityId: 'BASE-C',
      metric: 'fuel_depletion',
      value: 0.35,
      confidence: 0.85,
      horizonMinutes: 540,
      createdAt: now,
      message: 'Base BASE-C fuel below threshold in 9h',
    },
    {
      entityType: 'weather',
      entityId: 'BASE-A',
      metric: 'weather_minima_breach',
      value: 0.65,
      confidence: 0.78,
      horizonMinutes: 240,
      createdAt: now,
      message: 'Base BASE-A cloud ceiling breach below landing minima in 4h',
    },
    {
      entityType: 'aircraft',
      entityId: 'AC-06',
      metric: 'radar_degradation',
      value: 0.81,
      confidence: 0.88,
      horizonMinutes: 120,
      createdAt: now,
      message: 'Aircraft AC-06 APG radar transmitter power drop predicted in 2h',
    },
    {
      entityType: 'crew',
      entityId: 'CR-14',
      metric: 'duty_hour_breach',
      value: 0.84,
      confidence: 0.84,
      horizonMinutes: 150,
      createdAt: now,
      message: 'Crew CR-14 continuous duty window will exceed 12h threshold in 2.5h',
    },
    {
      entityType: 'base',
      entityId: 'BASE-B',
      metric: 'crosswind_hazard',
      value: 0.74,
      confidence: 0.76,
      horizonMinutes: 300,
      createdAt: now,
      message: 'Base BASE-B crosswinds forecast >32kts in 5h: runway ops degraded',
    },
    {
      entityType: 'aircraft',
      entityId: 'AC-22',
      metric: 'rotor_vibration',
      value: 0.62,
      confidence: 0.68,
      horizonMinutes: 480,
      createdAt: now,
      message: 'Helicopter AC-22 rotor mast harmonic vibration exceedance predicted in 8h',
    },
  ];
}

function generateSeedAuditLog(): AuditEntry[] {
  return [
    {
      id: 'AUD-0001',
      timestamp: '2026-10-17T06:00:00Z',
      operator: 'SYSTEM_DAEMON',
      action: 'SYSTEM_INITIALIZATION',
      targetId: 'CANONICAL_STORE',
      details: 'AirOps DSS state initialized with fictional Veridia territory seed dataset.',
      prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    {
      id: 'AUD-0002',
      timestamp: '2026-10-17T06:15:00Z',
      operator: 'COMMANDER_ALPHA',
      action: 'APPROVE_ATO_BASELINE',
      targetId: 'PLAN_ATO_20261017',
      details: 'Baseline Air Tasking Order sorties approved for operations day 1.',
      prevHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      hash: '5d41402abc4b2a76b9719d911017c592b0c44298fc1c149afbf4c8996fb92427',
    },
    {
      id: 'AUD-0003',
      timestamp: '2026-10-17T11:45:00Z',
      operator: 'INTEL_OFFICER_04',
      action: 'INJECT_THREAT_CONTACT',
      targetId: 'THR-02',
      details: 'SAM contact THR-02 confirmed active at 4.80°N 7.50°E.',
      prevHash: '5d41402abc4b2a76b9719d911017c592b0c44298fc1c149afbf4c8996fb92427',
      hash: 'a7b8c9d0e1f234567890abcdef1234567890abcdef1234567890abcdef123456',
    },
  ];
}

export function generateSeedRecommendations(includeConflicts = false, baseTime?: Date): Record<string, Recommendation> {
  if (!includeConflicts) {
    return {};
  }
  const now = baseTime || new Date();
  return {
    'REC-0001': {
      id: 'REC-0001',
      triggerEventId: 'EV-0001',
      summary: 'Substitute AC-05 for AC-04 on Quick Reaction Alert (QRA) to resolve scheduling conflict.',
      score: 94,
      changes: [
        {
          missionId: 'M-06',
          kind: 'aircraft_swap',
          before: 'AC-04',
          after: 'AC-05',
          note: 'Retask AC-05 (Fighter-A) from Sector Alpha Fighter Base to resolve aircraft double-booking.',
          type: 'REPLACE_AIRCRAFT',
          entityId: 'M-06',
          fromValue: 'AC-04',
          toValue: 'AC-05',
          description: 'Retask AC-05 (Fighter-A) from Sector Alpha Fighter Base to resolve aircraft double-booking.',
        },
      ],
      impactedMissionIds: ['M-06'],
      tradeoffs: [
        { label: 'Conflict Resolution', delta: 1, unit: 'conflict', direction: 'good' },
        { label: 'Sortie Preparation Buffer', delta: 45, unit: 'min', direction: 'good' },
      ],
      explanation: [
        'Airframe AC-04 is double-booked between M-06 and M-13.',
        'Substitute airframe AC-05 (Fighter-A) is available at Sector Alpha Fighter Base with 95% fuel reserve and zero scheduled sortie conflicts.',
        'Reassignment preserves mission readiness with zero flight path or station time impact.',
      ],
      constraintsSatisfied: [
        'Aircraft type match: Fighter-A hardpoints verified',
        'Launch base alignment: Sector Alpha Fighter Base (BASE-A)',
        'Maintenance reserve threshold satisfied',
      ],
      constraintsRelaxed: [],
      status: 'pending',
      createdAt: now.toISOString(),
      stateVersion: 1,
      confidence: 0.94,
      dataFreshnessSec: 2,
      alternatives: [],
    },
  };
}

/* =========================================================================
   MOCK DATA SERVICE IMPLEMENTATION
   ========================================================================= */

export class MockDataService implements IDataService {
  private stateVersion = 1;
  private simTime: Date = new Date();
  private speedMultiplier: 1 | 5 | 20 = 1;
  private isPaused = false;
  private mockConflictsEnabled = serviceConfig.mockConflicts;

  private bases: Record<string, Base> = { ...SEED_BASES };
  private aircraft: Record<string, Aircraft> = generateSeedAircraft();
  private crew: Record<string, Crew> = generateSeedCrew();
  private missions: Record<string, Mission> = generateSeedMissions(serviceConfig.mockConflicts);
  private airspace: Record<string, Airspace> = generateSeedAirspace();
  private threats: Record<string, Threat> = generateSeedThreats();
  private weaponStocks: WeaponStock[] = [...SEED_WEAPON_STOCKS];
  private weather: Record<string, typeof SEED_BASES['BASE-A']['weather']> = {
    'BASE-A': SEED_BASES['BASE-A'].weather,
    'BASE-B': SEED_BASES['BASE-B'].weather,
    'BASE-C': SEED_BASES['BASE-C'].weather,
    'BASE-D': SEED_BASES['BASE-D'].weather,
  };
  private recommendations: Record<string, Recommendation> = generateSeedRecommendations(serviceConfig.mockConflicts);
  private activeEvents: OpsEvent[] = [];
  private predictions: Prediction[] = generateSeedPredictions();
  private auditLog: AuditEntry[] = generateSeedAuditLog();

  private subscribers: Set<(snapshot: OperationalSnapshot) => void> = new Set();
  private retaskProgressSubscribers: Set<(progress: RetaskProgressState) => void> = new Set();
  private impactSubscribers: Set<(impact: ImpactAnalysisPayload) => void> = new Set();
  private intervalId?: ReturnType<typeof setInterval>;
  private auditCounter = 4;
  private eventCounter = 1;

  constructor() {
    this.startSimulationLoop();
  }

  private startSimulationLoop(): void {
    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      if (this.isPaused) return;

      // Advance sim time according to speed multiplier
      const advanceMs = 1000 * this.speedMultiplier;
      this.simTime = new Date(this.simTime.getTime() + advanceMs);

      // Simulate live track movement for airborne aircraft
      this.stepAirborneAircraft();

      this.notifySubscribers();
    }, 1000);
  }

  private stepAirborneAircraft(): void {
    Object.values(this.aircraft).forEach((ac) => {
      if (ac.status !== 'airborne' || !ac.position || !ac.assignedMissionId) return;

      const mission = this.missions[ac.assignedMissionId];
      if (!mission || !mission.route || mission.route.length === 0) return;

      const currentIdx = mission.currentWaypointIndex ?? 0;
      const targetWaypoint = mission.route[currentIdx % mission.route.length];

      const dLat = targetWaypoint.lat - ac.position.lat;
      const dLng = targetWaypoint.lng - ac.position.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);

      const step = 0.003 * this.speedMultiplier;

      if (dist < step) {
        // Advanced to next waypoint
        mission.currentWaypointIndex = (currentIdx + 1) % mission.route.length;
        ac.position = { ...targetWaypoint };
      } else {
        // Move towards target waypoint
        ac.position = {
          lat: ac.position.lat + (dLat / dist) * step,
          lng: ac.position.lng + (dLng / dist) * step,
        };
        const angleRad = Math.atan2(dLng, dLat);
        let angleDeg = Math.round((angleRad * 180) / Math.PI);
        if (angleDeg < 0) angleDeg += 360;
        ac.heading = angleDeg;
      }

      // Simulate fuel consumption
      const fuelBurn = 0.04 * this.speedMultiplier;
      ac.fuelPct = Math.max(0, +(ac.fuelPct - fuelBurn).toFixed(1));
    });
  }

  private notifySubscribers(): void {
    const snapshot = this.buildSnapshot();
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  private buildSnapshot(): OperationalSnapshot {
    const simTimeIso = this.simTime.toISOString();
    return {
      stateVersion: this.stateVersion,
      sim: {
        time: simTimeIso,
        speed: this.speedMultiplier,
        paused: this.isPaused,
      },
      simTime: simTimeIso,
      speedMultiplier: this.speedMultiplier,
      bases: { ...this.bases },
      aircraft: { ...this.aircraft },
      crew: { ...this.crew },
      missions: { ...this.missions },
      airspace: { ...this.airspace },
      threats: { ...this.threats },
      weather: { ...this.weather },
      weaponStocks: [...this.weaponStocks],
      recommendations: { ...this.recommendations },
      activeEvents: [...this.activeEvents],
      predictions: [...this.predictions],
      auditLog: [...this.auditLog],
    };
  }

  public async getSnapshot(): Promise<OperationalSnapshot> {
    return this.buildSnapshot();
  }

  public subscribe(callback: (snapshot: OperationalSnapshot) => void): () => void {
    this.subscribers.add(callback);
    callback(this.buildSnapshot());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public subscribeRetaskProgress(callback: (progress: RetaskProgressState) => void): () => void {
    this.retaskProgressSubscribers.add(callback);
    return () => {
      this.retaskProgressSubscribers.delete(callback);
    };
  }

  public subscribeImpact(callback: (impact: ImpactAnalysisPayload) => void): () => void {
    this.impactSubscribers.add(callback);
    return () => {
      this.impactSubscribers.delete(callback);
    };
  }

  private notifyRetaskProgress(progress: RetaskProgressState): void {
    this.retaskProgressSubscribers.forEach((cb) => cb(progress));
  }

  private notifyImpact(impact: ImpactAnalysisPayload): void {
    this.impactSubscribers.forEach((cb) => cb(impact));
  }

  public async injectEvent(
    eventInput: Omit<OpsEvent, 'id' | 'timestamp'> | OpsEvent,
  ): Promise<OpsEvent> {
    const eventId = `EV-${String(this.eventCounter++).padStart(4, '0')}`;
    const timestamp = this.simTime.toISOString();

    const fullEvent: OpsEvent = {
      ...eventInput,
      id: 'id' in eventInput && eventInput.id ? eventInput.id : eventId,
      timestamp: 'timestamp' in eventInput && eventInput.timestamp ? eventInput.timestamp : timestamp,
    };

    this.activeEvents = [fullEvent, ...this.activeEvents].slice(0, 50);

    // Apply immediate factual state mutation per context.md
    if (fullEvent.type === 'AIRCRAFT_UNSERVICEABLE') {
      const acId = fullEvent.payload.aircraftId as string;
      if (acId && this.aircraft[acId]) {
        this.aircraft[acId].status = 'unserviceable';
      }
    } else if (fullEvent.type === 'BASE_CLOSED') {
      const baseId = fullEvent.payload.baseId as string;
      if (baseId && this.bases[baseId]) {
        this.bases[baseId].runwayStatus = 'closed';
      }
    } else if (fullEvent.type === 'CREW_UNAVAILABLE') {
      const crewId = fullEvent.payload.crewId as string;
      if (crewId && this.crew[crewId]) {
        this.crew[crewId].status = 'unavailable';
      }
    } else if (fullEvent.type === 'THREAT_DETECTED') {
      const thrId = `THR-${String(Object.keys(this.threats).length + 1).padStart(2, '0')}`;
      const pos = (fullEvent.payload.position as { lat: number; lng: number }) || { lat: 4.8, lng: 7.5 };
      this.threats[thrId] = {
        id: thrId,
        type: (fullEvent.payload.threatType as Threat['type']) || 'SAM',
        position: pos,
        rangeKm: (fullEvent.payload.rangeKm as number) || 85,
        confidence: (fullEvent.payload.confidence as number) || 0.9,
        lastSeen: timestamp,
        status: 'active',
      };
    } else if (fullEvent.type === 'WEATHER_DEGRADED') {
      const baseId = (fullEvent.payload.baseId as string) || (fullEvent.payload.region as string);
      const severity = (fullEvent.payload.severity as 'nominal' | 'caution' | 'severe') || 'severe';
      if (baseId && this.bases[baseId]) {
        this.bases[baseId].weather.severity = severity;
        if (fullEvent.payload.visibilityKm) this.bases[baseId].weather.visibilityKm = fullEvent.payload.visibilityKm as number;
        if (fullEvent.payload.windKts) this.bases[baseId].weather.windKts = fullEvent.payload.windKts as number;
        if (severity === 'severe') {
          this.bases[baseId].runwayStatus = 'closed';
        } else if (severity === 'caution') {
          this.bases[baseId].runwayStatus = 'degraded';
        }
      }
    } else if (fullEvent.type === 'NEW_PRIORITY_MISSION') {
      const msnName = (fullEvent.payload.name as string) || 'Emergency Intercept Alpha';
      const msnType = (fullEvent.payload.type as Mission['type']) || 'CAP';
      const priority = (fullEvent.payload.priority as 1 | 2 | 3 | 4) || 1;
      const launchBaseId = (fullEvent.payload.launchBaseId as string) || 'BASE-A';
      const targetCoords = (fullEvent.payload.targetCoordinates as { lat: number; lng: number }) || { lat: 8.0, lng: 5.5 };
      const reqAcType = (fullEvent.payload.requiredAircraftType as string) || 'Fighter-A';

      const newMsnId = `M-${String(Object.keys(this.missions).length + 1).padStart(2, '0')}`;
      const launchBase = this.bases[launchBaseId] || this.bases['BASE-A'];
      const route = [
        { ...launchBase.location },
        { ...targetCoords },
        { ...launchBase.location },
      ];

      this.missions[newMsnId] = {
        id: newMsnId,
        name: msnName,
        type: msnType,
        priority,
        status: 'planned',
        launchBaseId: launchBase.id,
        target: {
          name: `${msnName} Target Area`,
          lat: targetCoords.lat,
          lng: targetCoords.lng,
        },
        windowStart: timestamp,
        windowEnd: new Date(Date.now() + 2 * 3600000).toISOString(),
        requiredAircraftType: (reqAcType as AircraftType) || 'Fighter-A',
        requiredCrewQuals: ['day-vfr'],
        requiredWeapons: [],
        assigned: {
          aircraftIds: [],
          crewIds: [],
        },
        route,
        currentWaypointIndex: 0,
        routeOptions: [
          { id: 'Route A', name: 'Direct Intercept', waypoints: route, distanceKm: 85, riskScore: 12 },
        ],
      };
    }

    // Determine impacted missions
    const impactedMissionIds: string[] = [];
    const impactReasons: string[] = [];

    if (fullEvent.type === 'THREAT_DETECTED') {
      const pos = (fullEvent.payload.position as { lat: number; lng: number }) || { lat: 4.8, lng: 7.5 };
      const rangeKm = (fullEvent.payload.rangeKm as number) || 85;
      Object.values(this.missions).forEach((m) => {
        const intersects = m.route?.some((pt) => {
          const dLat = (pt.lat - pos.lat) * 111;
          const dLng = (pt.lng - pos.lng) * 111 * Math.cos(((pt.lat + pos.lat) / 2) * (Math.PI / 180));
          return Math.sqrt(dLat * dLat + dLng * dLng) <= rangeKm + 15;
        });
        if (intersects) {
          impactedMissionIds.push(m.id);
          m.status = 'at-risk';
          impactReasons.push(`${m.name} (${m.id}) flight corridor intersects detected weapon engagement zone.`);
        }
      });
    } else if (fullEvent.type === 'AIRCRAFT_UNSERVICEABLE') {
      const acId = fullEvent.payload.aircraftId as string;
      Object.values(this.missions).forEach((m) => {
        if (m.assigned.aircraftIds.includes(acId)) {
          impactedMissionIds.push(m.id);
          m.status = 'at-risk';
          impactReasons.push(`Assigned airframe ${acId} declared unserviceable.`);
        }
      });
    } else if (fullEvent.type === 'BASE_CLOSED') {
      const baseId = fullEvent.payload.baseId as string;
      Object.values(this.missions).forEach((m) => {
        if (m.launchBaseId === baseId) {
          impactedMissionIds.push(m.id);
          m.status = 'at-risk';
          impactReasons.push(`Launch base ${baseId} runway closed.`);
        }
      });
    } else if (fullEvent.type === 'WEATHER_DEGRADED') {
      const baseId = (fullEvent.payload.baseId as string) || (fullEvent.payload.region as string);
      Object.values(this.missions).forEach((m) => {
        if (m.launchBaseId === baseId) {
          impactedMissionIds.push(m.id);
          m.status = 'at-risk';
          impactReasons.push(`Base ${baseId} weather degraded below operational minima.`);
        }
      });
    } else if (fullEvent.type === 'CREW_UNAVAILABLE') {
      const crewId = fullEvent.payload.crewId as string;
      Object.values(this.missions).forEach((m) => {
        if (m.assigned.crewIds.includes(crewId)) {
          impactedMissionIds.push(m.id);
          m.status = 'at-risk';
          impactReasons.push(`Assigned crew member ${crewId} stood down.`);
        }
      });
    } else if (fullEvent.type === 'NEW_PRIORITY_MISSION') {
      impactReasons.push('Immediate tasking requirement requires resource preemption.');
    }

    // Emit impact analysis immediately
    const impactPayload: ImpactAnalysisPayload = {
      eventId: fullEvent.id,
      eventType: fullEvent.type,
      impactedMissionIds,
      reasons: impactReasons.length > 0 ? impactReasons : ['Operational posture re-evaluated against doctrine.'],
      timeToDecisionMin: 5,
    };
    this.notifyImpact(impactPayload);
    this.notifySubscribers();

    // Stage progression
    const isTest =
      typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || Boolean((globalThis as unknown as Record<string, unknown>).__vitest__));
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const stages: { stage: RetaskStage; message: string; elapsed: number }[] = [
      { stage: 'fusing', message: 'Fusing real-time sensor radar tracks & telemetry...', elapsed: 350 },
      { stage: 'constraints', message: 'Validating airspace corridor clearances & duty limits...', elapsed: 850 },
      { stage: 'optimising', message: 'Computing Pareto multi-objective resource allocations...', elapsed: 1450 },
      { stage: 'ranking', message: 'Ranking retasking options against Commander doctrine...', elapsed: 1950 },
    ];

    const delayMs = isTest ? 5 : 350;
    let currentElapsed = 0;

    for (const step of stages) {
      currentElapsed += delayMs;
      this.notifyRetaskProgress({
        isReplanActive: true,
        stage: step.stage,
        elapsedMs: isTest ? currentElapsed : step.elapsed,
        message: step.message,
      });
      await sleep(delayMs);
    }

    // Evaluate recommendation via mockRetaskEngine
    const rec = mockRetaskEngine.evaluateEvent(fullEvent, {
      bases: this.bases,
      aircraft: this.aircraft,
      crew: this.crew,
      missions: this.missions,
      threats: this.threats,
    });

    if (impactedMissionIds.length > 0 && (!rec.impactedMissionIds || rec.impactedMissionIds.length === 0)) {
      rec.impactedMissionIds = [...impactedMissionIds];
    }

    this.recommendations[rec.id] = rec;
    this.stateVersion++;

    this.notifyRetaskProgress({
      isReplanActive: false,
      stage: 'ready',
      elapsedMs: isTest ? currentElapsed + delayMs : 2100,
      message: 'Retasking plan formulated. Pending commander authorization.',
    });

    // Record audit log
    this.appendAuditEntry({
      action: 'INJECT_EVENT',
      operator: fullEvent.operator || 'COMMANDER_OPS',
      targetId: fullEvent.id,
      details: `Injected event ${fullEvent.type} -> Recommendation ${rec.id} generated (${rec.score} pts).`,
    });

    this.notifySubscribers();
    return fullEvent;
  }

  public async decideRecommendation(
    id: string,
    decision: 'approved' | 'rejected' | 'modified' | 'approve' | 'reject' | 'modify',
    modifications?: Partial<Recommendation> | Record<string, unknown>,
    reason?: string,
    operator: string = 'demo-commander',
  ): Promise<Recommendation> {
    const rec = this.recommendations[id];
    if (!rec) {
      throw new Error(`Recommendation ${id} not found.`);
    }

    const mappedDecision =
      decision === 'approved' || decision === 'approve'
        ? 'approved'
        : decision === 'rejected' || decision === 'reject'
          ? 'rejected'
          : 'modified';

    rec.status = mappedDecision;
    if (modifications) {
      rec.modifications = modifications as Record<string, unknown>;
    }

    // Apply plan changes atomically if approved or modified
    if (mappedDecision === 'approved' || mappedDecision === 'modified') {
      rec.changes.forEach((change) => {
        if (change.kind === 'aircraft_swap' && change.missionId && change.after) {
          const msn = this.missions[change.missionId];
          const oldAc = String(change.before);
          const newAc = String(change.after);
          if (msn) {
            msn.assigned.aircraftIds = [
              ...msn.assigned.aircraftIds.filter((id) => id !== oldAc),
              newAc,
            ];
          }
          if (this.aircraft[newAc]) {
            this.aircraft[newAc].assignedMissionId = change.missionId;
          }
          if (this.aircraft[oldAc]) {
            this.aircraft[oldAc].assignedMissionId = undefined;
          }
        } else if (change.kind === 'crew_swap' && change.missionId && change.after) {
          const msn = this.missions[change.missionId];
          const oldCrew = String(change.before);
          const newCrew = String(change.after);
          if (msn) {
            msn.assigned.crewIds = [
              ...msn.assigned.crewIds.filter((id) => id !== oldCrew),
              newCrew,
            ];
          }
        }
      });
    }

    this.stateVersion++;

    this.appendAuditEntry({
      action: `DECISION_${mappedDecision.toUpperCase()}`,
      operator,
      targetId: id,
      details: reason || `Commander decided ${mappedDecision} on ${rec.summary}`,
    });

    this.notifySubscribers();
    return rec;
  }

  public async runScenario(_params: ScenarioParams): Promise<ScenarioResult> {
    return {
      scenarioId: `SCEN-${Date.now()}`,
      baselineKpis: {
        coveragePct: 94.2,
        avgDelayMin: 8,
        unmetCount: 0,
        fuelUsedKg: 28400,
      },
      scenarioKpis: {
        coveragePct: 82.5,
        avgDelayMin: 22,
        unmetCount: 1,
        fuelUsedKg: 34100,
      },
      firstFailure: {
        time: 'T+14h',
        cause: 'BASE-B runway outage forces diversion of strike assets beyond allowable duty hours',
      },
      unmetMissions: ['M-10'],
      generatedRecommendations: [],
      impactedMissionIds: ['M-04', 'M-07', 'M-10'],
      successProbability: 0.85,
    };
  }

  public async getAuditLog(): Promise<AuditEntry[]> {
    return [...this.auditLog];
  }

  public setSpeedMultiplier(multiplier: 1 | 5 | 20): void {
    this.speedMultiplier = multiplier;
    this.notifySubscribers();
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  // --- Extended Client Methods (per context.md spec) ---

  public async validateModification(
    id: string,
    _modifications: unknown,
  ): Promise<ModificationValidationResult> {
    const rec = this.recommendations[id];
    return {
      valid: true,
      conflicts: [],
      score: rec ? rec.score - 4 : 85,
      tradeoffs: [
        { label: 'Manual Swap Delay', delta: 5, unit: 'min', direction: 'bad' },
        { label: 'Target Alignment', delta: 95, unit: '%', direction: 'good' },
      ],
    };
  }

  public async getEligibleResources(missionId: string): Promise<EligibleResourcesResult> {
    const msn = this.missions[missionId];
    if (!msn) {
      return { aircraft: [], crew: [] };
    }
    const eligibleAircraft = Object.values(this.aircraft).filter(
      (a) => a.type === msn.requiredAircraftType && a.status === 'serviceable',
    );
    const eligibleCrew = Object.values(this.crew).filter(
      (c) => c.status === 'available' && c.fatigueIndex < 50,
    );
    return { aircraft: eligibleAircraft, crew: eligibleCrew };
  }

  public async getPredictions(): Promise<Prediction[]> {
    return [...this.predictions];
  }

  public async getDemoScripts(): Promise<DemoScriptItem[]> {
    return [
      {
        name: 'sam-route-b',
        description: 'Demo 1: Surface-to-Air Missile detected along M-04 Route B',
      },
      {
        name: 'runway-closure-aog',
        description: 'Demo 2: BASE-B runway closure + strike aircraft AOG contingency',
      },
    ];
  }

  public async runDemoScript(name: string): Promise<{ status: string; eventCount?: number }> {
    if (name === 'sam-route-b') {
      await this.injectEvent({
        type: 'THREAT_DETECTED',
        payload: {
          threatType: 'SAM',
          position: { lat: 4.8, lng: 7.5 },
          rangeKm: 85,
          confidence: 0.9,
        },
        description: 'SAM site detected on Route B near Contested Hub Oscar',
      });
      return { status: 'completed', eventCount: 1 };
    }
    if (name === 'runway-closure-aog') {
      await this.injectEvent({
        type: 'BASE_CLOSED',
        payload: { baseId: 'BASE-B', runwayStatus: 'closed', durationHours: 6 },
        description: 'Runway closed at BASE-B due to emergency cratering',
      });
      await this.injectEvent({
        type: 'AIRCRAFT_UNSERVICEABLE',
        payload: { aircraftId: 'AC-07', reason: 'Hydraulic failure on emergency diversion approach (AOG)' },
        description: 'Strike airframe AC-07 declared AOG at Sector Alpha',
      });
      return { status: 'completed', eventCount: 2 };
    }
    return { status: 'unknown_script' };
  }

  public async verifyAudit(): Promise<AuditVerificationResult> {
    // Audit hash-chain verification
    let prev = '0000000000000000000000000000000000000000000000000000000000000000';
    for (let i = 0; i < this.auditLog.length; i++) {
      if (this.auditLog[i].prevHash !== prev) {
        return { valid: false, brokenLinkIndex: i, message: `Broken hash link at index ${i}` };
      }
      prev = this.auditLog[i].hash;
    }
    return { valid: true, message: `Audit chain verified (${this.auditLog.length} links intact).` };
  }

  public async controlSimulation(
    action: 'pause' | 'resume' | 'speed' | 'reset',
    speed?: 1 | 5 | 20,
  ): Promise<{ simTime: string; speed: number; paused: boolean }> {
    if (action === 'pause') {
      this.isPaused = true;
    } else if (action === 'resume') {
      this.isPaused = false;
    } else if (action === 'speed' && speed) {
      this.speedMultiplier = speed;
    } else if (action === 'reset') {
      this.bases = { ...SEED_BASES };
      this.aircraft = generateSeedAircraft();
      this.crew = generateSeedCrew();
      this.missions = generateSeedMissions(this.mockConflictsEnabled, this.simTime);
      this.recommendations = generateSeedRecommendations(this.mockConflictsEnabled, this.simTime);
      this.activeEvents = [];
      this.isPaused = false;
      this.speedMultiplier = 1;
    }

    this.notifySubscribers();
    return {
      simTime: this.simTime.toISOString(),
      speed: this.speedMultiplier,
      paused: this.isPaused,
    };
  }

  public setMockConflictsEnabled(enabled: boolean): void {
    this.mockConflictsEnabled = enabled;
    this.missions = generateSeedMissions(enabled, this.simTime);
    this.recommendations = generateSeedRecommendations(enabled, this.simTime);
    this.stateVersion++;
    this.notifySubscribers();
  }

  public getIsMockConflictsEnabled(): boolean {
    return this.mockConflictsEnabled;
  }

  private appendAuditEntry(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'prevHash' | 'hash'>): void {
    const prev = this.auditLog[this.auditLog.length - 1];
    const prevHash = prev ? prev.hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const id = `AUD-${String(this.auditCounter++).padStart(4, '0')}`;
    const timestamp = this.simTime.toISOString();
    // Deterministic mock hash string (hex length 64)
    const hash = `${Math.abs(
      (id + timestamp + entry.action).split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0),
    ).toString(16)}abcdef0123456789abcdef0123456789abcdef0123456789`.slice(0, 64);

    this.auditLog.push({
      id,
      timestamp,
      prevHash,
      hash,
      ...entry,
    });
  }
}

export const mockDataService = new MockDataService();
