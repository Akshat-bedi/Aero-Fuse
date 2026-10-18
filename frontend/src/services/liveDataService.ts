import {
  IDataService,
  ModificationValidationResult,
  EligibleResourcesResult,
  AuditVerificationResult,
  DemoScriptItem,
} from './dataService';
import {
  OperationalSnapshot,
  WireSnapshot,
  OpsEvent,
  Recommendation,
  ScenarioParams,
  ScenarioResult,
  AuditEntry,
  WebSocketEnvelope,
  Aircraft,
  Base,
  Crew,
  Mission,
  Prediction,
  RetaskProgressState,
  ImpactAnalysisPayload,
} from '@/types';
import { apiClient } from './apiClient';
import { TacticalWebSocketClient } from './wsClient';
import { serviceConfig } from './config';

/**
 * Normalizes wire snapshot (arrays) into dictionary-mapped operational snapshot.
 */
export function normalizeWireSnapshot(
  snapshotInput: WireSnapshot | OperationalSnapshot,
): OperationalSnapshot {
  if (!snapshotInput) {
    return {
      stateVersion: 1,
      sim: { time: new Date().toISOString(), speed: 1, paused: false },
      simTime: new Date().toISOString(),
      speedMultiplier: 1,
      bases: {},
      aircraft: {},
      crew: {},
      missions: {},
      airspace: {},
      threats: {},
      weather: {},
      weaponStocks: [],
      recommendations: {},
      activeEvents: [],
      predictions: [],
      auditLog: [],
    };
  }

  // If already normalized with object dictionaries
  if (snapshotInput.bases && !Array.isArray(snapshotInput.bases)) {
    return snapshotInput as OperationalSnapshot;
  }

  const wire = snapshotInput as WireSnapshot;
  const bases: Record<string, Base> = {};
  (wire.bases || []).forEach((b) => {
    bases[b.id] = b;
  });

  const aircraft: Record<string, Aircraft> = {};
  (wire.aircraft || []).forEach((a) => {
    aircraft[a.id] = a;
  });

  const crew: Record<string, Crew> = {};
  (wire.crew || []).forEach((c) => {
    crew[c.id] = c;
  });

  const missions: Record<string, Mission> = {};
  (wire.missions || []).forEach((m) => {
    missions[m.id] = m;
  });

  const airspace: Record<string, typeof wire.airspace[0]> = {};
  (wire.airspace || []).forEach((as) => {
    airspace[as.id] = as;
  });

  const threats: Record<string, typeof wire.threats[0]> = {};
  (wire.threats || []).forEach((t) => {
    threats[t.id] = t;
  });

  const weather: Record<string, typeof wire.weather[0]> = {};
  (wire.weather || []).forEach((w) => {
    const key = w.baseId || w.region || `weather-${Math.random()}`;
    weather[key] = w;
  });

  const recommendations: Record<string, Recommendation> = {};
  (wire.recommendations || []).forEach((r) => {
    recommendations[r.id] = r;
  });

  const simTime = wire.sim?.time || (wire as unknown as { simTime?: string }).simTime || new Date().toISOString();
  const speed = wire.sim?.speed ?? (wire as unknown as { speedMultiplier?: number }).speedMultiplier ?? 1;
  const paused = wire.sim?.paused ?? false;

  return {
    stateVersion: wire.stateVersion || 1,
    sim: { time: simTime, speed, paused },
    simTime,
    speedMultiplier: speed,
    bases,
    aircraft,
    crew,
    missions,
    airspace,
    threats,
    weather,
    weaponStocks: wire.weaponStocks || [],
    recommendations,
    activeEvents: wire.activeEvents || [],
    predictions: wire.predictions || [],
    auditLog: wire.auditLog || [],
  };
}

/**
 * Live Data Service (REST + WebSocket)
 * Communicates with backend endpoints per context.md and /docs/API_CONTRACT.md.
 */
export class LiveDataService implements IDataService {
  private wsClient: TacticalWebSocketClient;
  private subscribers: Set<(snapshot: OperationalSnapshot) => void> = new Set();
  private retaskProgressSubscribers: Set<(progress: RetaskProgressState) => void> = new Set();
  private impactSubscribers: Set<(impact: ImpactAnalysisPayload) => void> = new Set();
  private speedMultiplier: 1 | 5 | 20 = 1;
  private currentSnapshot: OperationalSnapshot | null = null;

  constructor() {
    this.wsClient = new TacticalWebSocketClient({ url: serviceConfig.wsUrl });
    this.initWebSocket();
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

  private initWebSocket(): void {
    this.wsClient.connect();

    // 1. SNAPSHOT
    this.wsClient.subscribe<WebSocketEnvelope<WireSnapshot | OperationalSnapshot>>(
      'SNAPSHOT',
      (envelope) => {
        const payload = envelope?.payload ?? (envelope as unknown as WireSnapshot);
        if (payload) {
          this.currentSnapshot = normalizeWireSnapshot(payload);
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 2. ENTITY_UPDATE
    this.wsClient.subscribe<WebSocketEnvelope<Partial<WireSnapshot>>>(
      'ENTITY_UPDATE',
      (envelope) => {
        const payload = envelope?.payload;
        if (payload && this.currentSnapshot) {
          if (Array.isArray(payload.bases)) {
            payload.bases.forEach((b) => {
              this.currentSnapshot!.bases[b.id] = b;
            });
          }
          if (Array.isArray(payload.aircraft)) {
            payload.aircraft.forEach((a) => {
              this.currentSnapshot!.aircraft[a.id] = a;
            });
          }
          if (Array.isArray(payload.crew)) {
            payload.crew.forEach((c) => {
              this.currentSnapshot!.crew[c.id] = c;
            });
          }
          if (Array.isArray(payload.missions)) {
            payload.missions.forEach((m) => {
              this.currentSnapshot!.missions[m.id] = m;
            });
          }
          if (Array.isArray(payload.threats)) {
            payload.threats.forEach((t) => {
              this.currentSnapshot!.threats[t.id] = t;
            });
          }
          if (envelope.stateVersion) {
            this.currentSnapshot.stateVersion = envelope.stateVersion;
          }
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 3. POSITION_TICK
    this.wsClient.subscribe<WebSocketEnvelope<Array<Partial<Aircraft> & { id: string }>>>(
      'POSITION_TICK',
      (envelope) => {
        const updates = envelope?.payload;
        if (Array.isArray(updates) && this.currentSnapshot) {
          updates.forEach((update) => {
            const existing = this.currentSnapshot!.aircraft[update.id];
            if (existing) {
              this.currentSnapshot!.aircraft[update.id] = { ...existing, ...update };
            }
          });
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 4. CLOCK_TICK
    this.wsClient.subscribe<
      WebSocketEnvelope<{ simTime?: string; time?: string; speed?: number; paused?: boolean }>
    >('CLOCK_TICK', (envelope) => {
      const payload = envelope?.payload;
      if (payload && this.currentSnapshot) {
        const time = payload.time || payload.simTime || this.currentSnapshot.sim.time;
        const speed = payload.speed ?? this.currentSnapshot.sim.speed;
        const paused = payload.paused ?? this.currentSnapshot.sim.paused;
        this.currentSnapshot.sim = { time, speed, paused };
        this.currentSnapshot.simTime = time;
        this.currentSnapshot.speedMultiplier = speed;
        this.notifySubscribers(this.currentSnapshot);
      }
    });

    // 5. EVENT_INJECTED
    this.wsClient.subscribe<WebSocketEnvelope<OpsEvent>>('EVENT_INJECTED', (envelope) => {
      const payload = envelope?.payload;
      if (payload && this.currentSnapshot) {
        this.currentSnapshot.activeEvents = [payload, ...this.currentSnapshot.activeEvents].slice(0, 50);
        this.notifySubscribers(this.currentSnapshot);
      }
    });

    // 6. IMPACT_ANALYSIS
    this.wsClient.subscribe<WebSocketEnvelope<ImpactAnalysisPayload>>(
      'IMPACT_ANALYSIS',
      (envelope) => {
        const payload = envelope?.payload;
        if (payload && this.currentSnapshot) {
          (payload.impactedMissionIds || []).forEach((mId) => {
            if (this.currentSnapshot!.missions[mId]) {
              this.currentSnapshot!.missions[mId] = {
                ...this.currentSnapshot!.missions[mId],
                status: 'at-risk',
              };
            }
          });
          this.impactSubscribers.forEach((cb) => cb(payload));
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 7. RETASK_PROGRESS
    this.wsClient.subscribe<WebSocketEnvelope<RetaskProgressState>>(
      'RETASK_PROGRESS',
      (envelope) => {
        const payload = envelope?.payload;
        if (payload) {
          this.retaskProgressSubscribers.forEach((cb) => cb(payload));
        }
      },
    );

    // 8. RECOMMENDATION_READY
    this.wsClient.subscribe<WebSocketEnvelope<Recommendation>>(
      'RECOMMENDATION_READY',
      (envelope) => {
        const reco = envelope?.payload;
        if (reco && this.currentSnapshot) {
          this.currentSnapshot.recommendations[reco.id] = reco;
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 9. RECOMMENDATION_UPDATED
    this.wsClient.subscribe<WebSocketEnvelope<Recommendation>>(
      'RECOMMENDATION_UPDATED',
      (envelope) => {
        const reco = envelope?.payload;
        if (reco && this.currentSnapshot) {
          this.currentSnapshot.recommendations[reco.id] = reco;
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 10. ALERT
    this.wsClient.subscribe<WebSocketEnvelope<Record<string, unknown>>>('ALERT', (_envelope) => {
      // Dispatches operational alert
    });

    // 11. PREDICTION_UPDATE
    this.wsClient.subscribe<WebSocketEnvelope<Prediction[]>>(
      'PREDICTION_UPDATE',
      (envelope) => {
        const predictions = envelope?.payload;
        if (Array.isArray(predictions) && this.currentSnapshot) {
          this.currentSnapshot.predictions = predictions;
          this.notifySubscribers(this.currentSnapshot);
        }
      },
    );

    // 12. AUDIT_APPENDED
    this.wsClient.subscribe<WebSocketEnvelope<AuditEntry>>('AUDIT_APPENDED', (envelope) => {
      const entry = envelope?.payload;
      if (entry && this.currentSnapshot) {
        if (!this.currentSnapshot.auditLog) {
          this.currentSnapshot.auditLog = [];
        }
        this.currentSnapshot.auditLog.push(entry);
        this.notifySubscribers(this.currentSnapshot);
      }
    });

    // 13. HEARTBEAT -> client replies with PING
    this.wsClient.subscribe('HEARTBEAT', () => {
      this.wsClient.send({ type: 'PING' });
    });
  }

  private notifySubscribers(snapshot: OperationalSnapshot): void {
    this.subscribers.forEach((cb) => cb(snapshot));
  }

  public async getSnapshot(): Promise<OperationalSnapshot> {
    const raw = await apiClient.get<WireSnapshot | OperationalSnapshot>('/snapshot');
    this.currentSnapshot = normalizeWireSnapshot(raw);
    return this.currentSnapshot;
  }

  public subscribe(callback: (snapshot: OperationalSnapshot) => void): () => void {
    this.subscribers.add(callback);

    if (this.currentSnapshot) {
      callback(this.currentSnapshot);
    } else {
      this.getSnapshot()
        .then((s) => callback(s))
        .catch(() => {});
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  public async injectEvent(
    eventInput: Omit<OpsEvent, 'id' | 'timestamp'> | OpsEvent,
  ): Promise<OpsEvent> {
    return apiClient.post<OpsEvent>('/events', eventInput);
  }

  public async decideRecommendation(
    id: string,
    decision: 'approved' | 'rejected' | 'modified' | 'approve' | 'reject' | 'modify',
    modifications?: Partial<Recommendation> | Record<string, unknown>,
    reason?: string,
    operator: string = 'demo-commander',
  ): Promise<Recommendation> {
    // Normalise decision verb to match backend expectation ('approve' | 'reject' | 'modify')
    const mappedDecision =
      decision === 'approved'
        ? 'approve'
        : decision === 'rejected'
          ? 'reject'
          : decision === 'modified'
            ? 'modify'
            : decision;

    return apiClient.post<Recommendation>(`/recommendations/${id}/decision`, {
      decision: mappedDecision,
      reason,
      modifications,
      operator,
    });
  }

  public async runScenario(params: ScenarioParams): Promise<ScenarioResult> {
    return apiClient.post<ScenarioResult>('/scenarios/run', params);
  }

  public async getScenarios(): Promise<ScenarioResult[]> {
    return apiClient.get<ScenarioResult[]>('/scenarios');
  }

  public async getScenario(id: string): Promise<ScenarioResult> {
    return apiClient.get<ScenarioResult>(`/scenarios/${id}`);
  }

  public async getAuditLog(): Promise<AuditEntry[]> {
    return apiClient.get<AuditEntry[]>('/audit');
  }

  public setSpeedMultiplier(multiplier: 1 | 5 | 20): void {
    this.speedMultiplier = multiplier;
    this.controlSimulation('speed', multiplier).catch(() => {});
  }

  public getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  // --- Extended Client Methods (per context.md spec) ---

  public async validateModification(
    id: string,
    modifications: unknown,
  ): Promise<ModificationValidationResult> {
    return apiClient.post<ModificationValidationResult>(
      `/recommendations/${id}/validate-modification`,
      modifications,
    );
  }

  public async getEligibleResources(missionId: string): Promise<EligibleResourcesResult> {
    return apiClient.get<EligibleResourcesResult>(`/missions/${missionId}/eligible-resources`);
  }

  public async getPredictions(): Promise<Prediction[]> {
    return apiClient.get<Prediction[]>('/predictions');
  }

  public async getDemoScripts(): Promise<DemoScriptItem[]> {
    return apiClient.get<DemoScriptItem[]>('/demo-scripts');
  }

  public async runDemoScript(name: string): Promise<{ status: string; eventCount?: number }> {
    return apiClient.post<{ status: string; eventCount?: number }>(`/demo-scripts/${name}/run`, {});
  }

  public async verifyAudit(): Promise<AuditVerificationResult> {
    return apiClient.get<AuditVerificationResult>('/audit/verify');
  }

  public async controlSimulation(
    action: 'pause' | 'resume' | 'speed' | 'reset',
    speed?: 1 | 5 | 20,
  ): Promise<{ simTime: string; speed: number; paused: boolean }> {
    return apiClient.post<{ simTime: string; speed: number; paused: boolean }>('/sim/control', {
      action,
      speed,
    });
  }
}

export const liveDataService = new LiveDataService();

