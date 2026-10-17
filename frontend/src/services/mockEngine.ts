import { Airbase, Aircraft, RetaskingRecommendation } from '@/types';

/**
 * AirOps DSS Mock Engine
 * Generates and serves purely fictional operational data:
 * - Fictional airbases: Alpha Outpost, Echo Station, Vector Bastion
 * - Generic aircraft categories: Fighter-A, Strike-B, Transport-C, Recon-D, Helicopter-E
 * - Fictional callsigns: VAPOR-01, GHOST-12, FALCON-33
 * - Adheres strictly to CORE PRINCIPLES (No real-world military data)
 */

export const MOCK_AIRBASES: Airbase[] = [
  {
    id: 'base-alpha',
    name: 'Sector Alpha FOB',
    code: 'ALPH',
    coordinates: [32.45, 15.67],
    runwayStatus: 'OPEN',
    weatherCondition: 'CAVOK (Ceiling & Visibility OK)',
    fuelCapacityKg: 500000,
    availableFuelKg: 420000,
  },
  {
    id: 'base-bravo',
    name: 'North Bastion Airbase',
    code: 'BSTN',
    coordinates: [34.12, 17.89],
    runwayStatus: 'DEGRADED',
    weatherCondition: 'Crosswind 28kts / Reduced Visibility',
    fuelCapacityKg: 750000,
    availableFuelKg: 310000,
  },
  {
    id: 'base-echo',
    name: 'Highland Station Delta',
    code: 'HLND',
    coordinates: [31.88, 14.22],
    runwayStatus: 'OPEN',
    weatherCondition: 'Scattered clouds, 15km visibility',
    fuelCapacityKg: 300000,
    availableFuelKg: 280000,
  },
];

export const MOCK_AIRCRAFT: Aircraft[] = [
  {
    id: 'ac-101',
    callsign: 'VAPOR-11',
    type: 'Fighter-A',
    baseId: 'base-alpha',
    status: 'SERVICEABLE',
    fuelRemainingPct: 92,
    hardpoints: [
      { station: 1, weaponType: 'GENERIC-AAM-M', quantity: 2 },
      { station: 2, weaponType: 'GENERIC-AAM-S', quantity: 2 },
    ],
  },
  {
    id: 'ac-102',
    callsign: 'VAPOR-12',
    type: 'Fighter-A',
    baseId: 'base-alpha',
    status: 'AIRBORNE',
    fuelRemainingPct: 64,
    assignedMissionId: 'msn-401',
    hardpoints: [
      { station: 1, weaponType: 'GENERIC-AAM-M', quantity: 2 },
      { station: 2, weaponType: 'GENERIC-AAM-S', quantity: 2 },
    ],
  },
  {
    id: 'ac-201',
    callsign: 'GHOST-01',
    type: 'Recon-D',
    baseId: 'base-echo',
    status: 'SERVICEABLE',
    fuelRemainingPct: 98,
    hardpoints: [],
  },
];

export const MOCK_RECOMMENDATIONS: RetaskingRecommendation[] = [
  {
    id: 'rec-901',
    missionId: 'msn-401',
    recommendedAction: 'Divert VAPOR-11 from Sector Alpha to reinforce CAP Point North',
    proposedAircraftIds: ['ac-101'],
    originalAircraftIds: ['ac-102'],
    explainability: {
      score: 94.2,
      confidencePct: 96,
      rationale:
        'Sector Alpha has lowest transit time (4.2 min) and optimal weapon configuration with 92% fuel endurance.',
      constraintsSatisfied: [
        'Crew duty time < 6.5 hrs',
        'Weather minima satisfied at Sector Alpha',
        'Payload matches interception profile',
        'Fuel reserve threshold > 2000kg at RTB',
      ],
      tradeOffs: [
        'Draws down Alpha Ready Alert from 2 to 1 airframe',
        'Increases fuel consumption by approx. 850kg over alternative',
      ],
      alternativeOptionsCount: 2,
    },
    commanderDecision: 'PENDING',
    createdAt: new Date().toISOString(),
  },
];

export class MockOpsEngine {
  private listeners: Set<(event: string, data: unknown) => void> = new Set();

  public getAirbases(): Promise<Airbase[]> {
    return Promise.resolve([...MOCK_AIRBASES]);
  }

  public getAircraft(): Promise<Aircraft[]> {
    return Promise.resolve([...MOCK_AIRCRAFT]);
  }

  public getRecommendations(): Promise<RetaskingRecommendation[]> {
    return Promise.resolve([...MOCK_RECOMMENDATIONS]);
  }

  public subscribe(listener: (event: string, data: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(event: string, data: unknown): void {
    this.listeners.forEach((fn) => fn(event, data));
  }
}

export const mockEngine = new MockOpsEngine();
