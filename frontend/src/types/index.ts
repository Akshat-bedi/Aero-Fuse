/**
 * Core domain types for AirOps DSS
 * Following CORE PRINCIPLES:
 * - Decision support, explainability, safety-critical statuses, fictional order-of-battle only.
 */

export type DataSourceMode = 'mock' | 'live';

export type OperationalStatus = 'nominal' | 'warning' | 'critical' | 'info' | 'unknown';

export type AircraftType =
  | 'Fighter-A'
  | 'Strike-B'
  | 'Transport-C'
  | 'Recon-D'
  | 'Helicopter-E';

export type MissionPriority = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_ROUTINE' | 'P4_LOW';

export type CommanderDecision = 'PENDING' | 'APPROVED' | 'MODIFIED' | 'REJECTED';

export interface Airbase {
  id: string;
  name: string;
  code: string;
  coordinates: [number, number]; // [longitude, latitude]
  runwayStatus: 'OPEN' | 'DEGRADED' | 'CLOSED';
  weatherCondition: string;
  fuelCapacityKg: number;
  availableFuelKg: number;
}

export interface Aircraft {
  id: string;
  callsign: string;
  type: AircraftType;
  baseId: string;
  status: 'SERVICEABLE' | 'AIRBORNE' | 'MAINTENANCE' | 'UNSERVICEABLE';
  fuelRemainingPct: number;
  assignedMissionId?: string;
  hardpoints: {
    station: number;
    weaponType: string;
    quantity: number;
  }[];
}

export interface RecommendationExplainability {
  score: number; // 0 - 100
  confidencePct: number;
  rationale: string;
  constraintsSatisfied: string[];
  tradeOffs: string[];
  alternativeOptionsCount: number;
}

export interface RetaskingRecommendation {
  id: string;
  missionId: string;
  recommendedAction: string;
  proposedAircraftIds: string[];
  originalAircraftIds: string[];
  explainability: RecommendationExplainability;
  commanderDecision: CommanderDecision;
  decisionTimestamp?: string;
  commanderNotes?: string;
  createdAt: string;
}
