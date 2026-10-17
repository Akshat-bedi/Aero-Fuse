import {
  OperationalSnapshot,
  OpsEvent,
  Recommendation,
  ScenarioParams,
  ScenarioResult,
  AuditEntry,
  Aircraft,
  Crew,
  Prediction,
  Tradeoff,
} from '@/types';

export interface DecisionPayload {
  decision: 'approve' | 'reject' | 'modify' | 'approved' | 'rejected' | 'modified';
  reason?: string;
  modifications?: Record<string, unknown>;
  operator?: string;
}

export interface ModificationValidationResult {
  conflicts: string[];
  score: number;
  tradeoffs: Tradeoff[];
  valid?: boolean;
}

export interface EligibleResourcesResult {
  aircraft: Aircraft[];
  crew: Crew[];
}

export interface AuditVerificationResult {
  valid: boolean;
  brokenLinkIndex?: number;
  message?: string;
}

export interface DemoScriptItem {
  name: string;
  description?: string;
}

/**
 * Common Data Service Interface
 * Defines the contract for all backend and mock data interactions.
 * Front-end components communicate through this abstraction exclusively.
 */
export interface IDataService {
  getSnapshot(): Promise<OperationalSnapshot>;
  subscribe(callback: (snapshot: OperationalSnapshot) => void): () => void;
  injectEvent(event: Omit<OpsEvent, 'id' | 'timestamp'> | OpsEvent): Promise<OpsEvent>;
  decideRecommendation(
    id: string,
    decision: 'approved' | 'rejected' | 'modified' | 'approve' | 'reject' | 'modify',
    modifications?: Partial<Recommendation> | Record<string, unknown>,
    reason?: string,
    operator?: string,
  ): Promise<Recommendation>;
  runScenario(params: ScenarioParams): Promise<ScenarioResult>;
  getAuditLog(): Promise<AuditEntry[]>;
  setSpeedMultiplier(multiplier: 1 | 5 | 20): void;
  getSpeedMultiplier(): number;

  // Supplementary client methods from backend contract
  validateModification?(id: string, modifications: unknown): Promise<ModificationValidationResult>;
  getEligibleResources?(missionId: string): Promise<EligibleResourcesResult>;
  getPredictions?(): Promise<Prediction[]>;
  getDemoScripts?(): Promise<DemoScriptItem[]>;
  runDemoScript?(name: string): Promise<{ status: string; eventCount?: number }>;
  verifyAudit?(): Promise<AuditVerificationResult>;
  controlSimulation?(
    action: 'pause' | 'resume' | 'speed' | 'reset',
    speed?: 1 | 5 | 20,
  ): Promise<{ simTime: string; speed: number; paused: boolean }>;
  setMockConflictsEnabled?(enabled: boolean): void;
  getIsMockConflictsEnabled?(): boolean;
}

