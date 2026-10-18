/**
 * AirOps DSS — Canonical Data Contract & Domain Types
 * Strict typing for all operational entities, events, recommendations, and predictions.
 * Adheres to CORE PRINCIPLES: Fictional data only, explainability, decision support.
 */

export type DataSourceMode = 'mock' | 'live';

export type OperationalStatus =
  | 'nominal'    // Serviceable / Nominal (Green)
  | 'warning'    // Caution / Degraded (Amber)
  | 'critical'   // Critical / Unserviceable / Threat (Red)
  | 'info'       // Pending / Info (Blue)
  | 'inactive'   // Inactive (Grey)
  | 'unknown';

export type PriorityLevel = 1 | 2 | 3 | 4;

export type AircraftType =
  | 'Fighter-A'
  | 'Strike-B'
  | 'Transport-C'
  | 'Recon-D'
  | 'Helicopter-E';

export type MissionType = 'CAP' | 'strike' | 'recon' | 'airlift' | 'SAR' | 'escort';

export type MissionStatus =
  | 'planned'
  | 'approved'
  | 'in-progress'
  | 'completed'
  | 'at-risk'
  | 'cancelled';

export type RunwayStatus = 'open' | 'degraded' | 'closed';

export type AircraftStatus =
  | 'serviceable'
  | 'maintenance'
  | 'unserviceable'
  | 'airborne'
  | 'turnaround';

export type CrewStatus = 'available' | 'resting' | 'on-mission' | 'unavailable';

export type AirspaceType = 'restricted' | 'corridor' | 'no-fly' | 'danger';

export type ThreatType = 'SAM' | 'fighter' | 'radar' | 'AAA';

export type ThreatStatus = 'active' | 'suspected' | 'neutralised';

export type WeatherSeverity = 'nominal' | 'caution' | 'severe';

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'stale'
  | 'expired';

export type ChangeKind =
  | 'aircraft_swap'
  | 'crew_swap'
  | 'reroute'
  | 'delay'
  | 'cancel'
  | 'new_assignment';

export type TradeoffDirection = 'good' | 'bad' | 'neutral';

export type OpsEventType =
  | 'THREAT_DETECTED'
  | 'AIRCRAFT_UNSERVICEABLE'
  | 'BASE_CLOSED'
  | 'WEATHER_DEGRADED'
  | 'NEW_PRIORITY_MISSION'
  | 'CREW_UNAVAILABLE';

/* =========================================================================
   1. ENTITY INTERFACES
   ========================================================================= */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface RouteOption {
  id: string; // e.g. "Route A", "Route B", "Route C"
  name: string;
  waypoints: LatLng[];
  distanceKm?: number;
  riskScore?: number;
}

export interface WeatherForecastItem {
  time: string; // ISO 8601 UTC string
  severity: WeatherSeverity;
  visibilityKm?: number;
  windKts?: number;
}

export interface WeatherState {
  baseId?: string;
  region?: string;
  visibilityKm: number;
  cloudBaseFt: number;
  windKts: number;
  severity: WeatherSeverity;
  forecast: WeatherForecastItem[];
}

export interface Base {
  id: string; // BASE-A .. BASE-D
  name: string;
  code?: string;
  location: LatLng;
  runwayStatus: RunwayStatus;
  weather: WeatherState;
  fuelStockPct: number;
  shelterCapacity: number;
}

export interface WeaponLoad {
  weaponType: string;
  quantity: number;
  station?: number;
}

export interface Aircraft {
  id: string; // AC-01 .. AC-nn
  tailNumber: string;
  callsign?: string;
  type: AircraftType;
  baseId: string;
  status: AircraftStatus;
  fuelPct: number;
  flightHoursToNextService: number;
  weaponLoad: WeaponLoad[];
  position?: LatLng;
  heading?: number;
  speed?: number; // knots
  assignedMissionId?: string;
}

export interface Crew {
  id: string; // CR-01 .. CR-nn
  callsign: string;
  role: string;
  qualifications: string[];
  baseId: string;
  fatigueIndex: number; // 0 to 100
  dutyHoursLast24h: number;
  status: CrewStatus;
}

export interface WeaponStock {
  baseId: string;
  weaponType: string;
  quantity: number;
}

export interface MissionTarget extends LatLng {
  name: string;
}

export interface RequiredWeaponItem {
  weaponType: string;
  quantity: number;
}

export interface MissionAssigned {
  aircraftIds: string[];
  crewIds: string[];
}

export interface Mission {
  id: string; // M-01 .. M-nn
  name: string;
  type: MissionType;
  priority: PriorityLevel;
  status: MissionStatus;
  launchBaseId: string;
  target: MissionTarget;
  route: LatLng[];
  routeOptions?: RouteOption[]; // Alternative routes: Route A, Route B, Route C
  windowStart: string; // ISO 8601 UTC string
  windowEnd: string;   // ISO 8601 UTC string
  requiredAircraftType: AircraftType;
  requiredCrewQuals: string[];
  requiredWeapons: RequiredWeaponItem[];
  assigned: MissionAssigned;
  currentWaypointIndex?: number;
}

export interface AirspacePolygon {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface Airspace {
  id: string; // AS-01 .. AS-nn
  name: string;
  polygon: AirspacePolygon;
  type: AirspaceType;
  activeFrom: string; // ISO 8601 UTC string
  activeTo: string;   // ISO 8601 UTC string
  floorFt?: number;
  ceilingFt?: number;
}

export interface Threat {
  id: string; // THR-01 .. THR-nn
  type: ThreatType;
  position: LatLng;
  rangeKm: number;
  confidence: number; // 0.0 to 1.0
  lastSeen: string; // ISO 8601 UTC string
  status: ThreatStatus;
}

/* =========================================================================
   2. OPS EVENTS & DECISION SUPPORT
   ========================================================================= */

export interface OpsEvent {
  id: string; // EV-0001 .. EV-nnnn
  type: OpsEventType;
  payload: Record<string, unknown>;
  timestamp: string; // ISO 8601 UTC string
  operator?: string;
  description?: string;
  severity?: 'critical' | 'warning' | 'info';
}

export interface Change {
  missionId: string;
  kind: ChangeKind;
  before: unknown;
  after: unknown;
  note?: string;
  // Optional backward-compatibility fields
  type?: string;
  entityType?: string;
  entityId?: string;
  fromValue?: unknown;
  toValue?: unknown;
  description?: string;
}

export interface Tradeoff {
  label: string;
  delta: number;
  unit: string;
  direction: TradeoffDirection;
}

export interface Recommendation {
  id: string; // REC-0001 .. REC-nnnn
  triggerEventId: string; // EV-nnnn
  summary: string;
  score: number; // 0 - 100
  changes: Change[];
  impactedMissionIds: string[];
  tradeoffs: Tradeoff[];
  explanation: string[];
  constraintsSatisfied: string[];
  constraintsRelaxed: string[];
  alternatives?: Recommendation[];
  status: RecommendationStatus;
  createdAt: string; // ISO 8601 UTC string
  stateVersion: number;
  confidence: number; // 0.0 to 1.0
  dataFreshnessSec: number;
  modifications?: Record<string, unknown>;
}

export interface Prediction {
  entityType: 'aircraft' | 'crew' | 'base' | 'weather' | string;
  entityId: string;
  metric: string;
  value: number;
  confidence: number; // 0.0 to 1.0
  horizonMinutes: number;
  createdAt: string; // ISO 8601 UTC string
  message: string;
}

export interface AuditEntry {
  id: string; // AUD-0001 .. AUD-nnnn
  timestamp: string; // ISO 8601 UTC string
  operator: string;
  action: string;
  targetId: string;
  details: string | Record<string, unknown>;
  prevHash: string;
  hash: string;
}

/* =========================================================================
   3. SNAPSHOT & TELEMETRY CONTRACTS
   ========================================================================= */

export interface SimState {
  time: string; // ISO 8601 UTC string
  speed: number;
  paused: boolean;
}

/**
 * Wire Snapshot representation as transported over REST GET /api/snapshot
 * and WebSocket SNAPSHOT frames. Uses arrays of entities.
 */
export interface WireSnapshot {
  stateVersion: number;
  sim: SimState;
  bases: Base[];
  aircraft: Aircraft[];
  crew: Crew[];
  missions: Mission[];
  airspace: Airspace[];
  threats: Threat[];
  weather: WeatherState[];
  weaponStocks: WeaponStock[];
  recommendations?: Recommendation[];
  predictions?: Prediction[];
  activeEvents?: OpsEvent[];
  auditLog?: AuditEntry[];
}

/**
 * Normalized in-memory and Zustand store representation.
 */
export interface OperationalSnapshot {
  stateVersion: number;
  sim: SimState;
  simTime: string; // Convenience mirror of sim.time
  speedMultiplier: number; // Convenience mirror of sim.speed
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  missions: Record<string, Mission>;
  airspace: Record<string, Airspace>;
  threats: Record<string, Threat>;
  weather: Record<string, WeatherState>;
  weaponStocks: WeaponStock[];
  recommendations: Record<string, Recommendation>;
  activeEvents: OpsEvent[];
  predictions: Prediction[];
  auditLog?: AuditEntry[];
}

export interface ScenarioParams {
  name?: string;
  description?: string;
  aircraftLoss?: { type?: AircraftType; baseId?: string; count: number }[];
  baseOutage?: { baseId: string; hours: number };
  crewAvailabilityReductionPct?: number;
  weatherSeverity?: WeatherSeverity;
  surgeMissions?: number;
  threatLevel?: number;
  horizonHours?: number;
  injectedEvents?: Omit<OpsEvent, 'id' | 'timestamp'>[];
  durationMinutes?: number;
}

export interface ScenarioResult {
  scenarioId?: string;
  baselineKpis?: Record<string, unknown>;
  scenarioKpis?: Record<string, unknown>;
  firstFailure?: { time: string; cause: string } | null;
  unmetMissions?: string[];
  generatedRecommendations?: Recommendation[];
  impactedMissionIds?: string[];
  successProbability?: number;
}

export type WebSocketServerMessageType =
  | 'SNAPSHOT'
  | 'ENTITY_UPDATE'
  | 'POSITION_TICK'
  | 'CLOCK_TICK'
  | 'EVENT_INJECTED'
  | 'IMPACT_ANALYSIS'
  | 'RETASK_PROGRESS'
  | 'RECOMMENDATION_READY'
  | 'RECOMMENDATION_UPDATED'
  | 'ALERT'
  | 'PREDICTION_UPDATE'
  | 'AUDIT_APPENDED'
  | 'HEARTBEAT';

export type WebSocketClientMessageType = 'PING';

export interface WebSocketEnvelope<T = unknown> {
  type: string;
  payload: T;
  ts: string;
  stateVersion?: number;
}

/* =========================================================================
   4. UI NOTIFICATIONS & TOASTS
   ========================================================================= */

export interface ToastItem {
  id: string;
  type: 'nominal' | 'warning' | 'critical' | 'info';
  title: string;
  message?: string;
  durationMs?: number;
}

export interface OperationalAlert {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  category: 'AIRSPACE' | 'WEATHER' | 'MAINTENANCE' | 'THREAT' | 'FUEL';
  location?: string;
  acknowledged: boolean;
  details: string;
}

/* =========================================================================
   5. STAGE 6: EVENT INJECTION & RETASKING TELEMETRY
   ========================================================================= */

export type RetaskStage = 'fusing' | 'constraints' | 'optimising' | 'ranking';

export interface RetaskProgressState {
  isReplanActive: boolean;
  stage: RetaskStage | 'ready' | null;
  elapsedMs: number;
  message: string;
}

export interface ImpactAnalysisPayload {
  eventId: string;
  eventType: OpsEventType;
  impactedMissionIds: string[];
  reasons: string[];
  timeToDecisionMin: number;
}

// Backward compatibility aliases
export type Airbase = Base;
export type RetaskingRecommendation = Recommendation;
