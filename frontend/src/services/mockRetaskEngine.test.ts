import { describe, it, expect } from 'vitest';
import { mockRetaskEngine } from './mockRetaskEngine';
import { mockDataService } from './mockDataService';
import { OpsEvent } from '@/types';

describe('MockRetaskEngine (Backend Contract Alignment)', () => {
  it('generates a substitute aircraft recommendation with REC-nnnn and kind aircraft_swap', async () => {
    const snapshot = await mockDataService.getSnapshot();

    // AC-01 is assigned to mission M-01
    const event: OpsEvent = {
      id: 'EV-0010',
      type: 'AIRCRAFT_UNSERVICEABLE',
      payload: {
        aircraftId: 'AC-01',
        reason: 'Hydraulic pressure drop on weapon station 2',
      },
      timestamp: new Date().toISOString(),
    };

    const recommendation = mockRetaskEngine.evaluateEvent(event, {
      bases: snapshot.bases,
      aircraft: snapshot.aircraft,
      crew: snapshot.crew,
      missions: snapshot.missions,
      threats: snapshot.threats,
    });

    // 1. ID conforms to REC-nnnn format
    expect(recommendation.id).toMatch(/^REC-\d{4}$/);
    expect(recommendation.triggerEventId).toBe('EV-0010');

    // 2. Metadata: stateVersion, confidence, dataFreshnessSec, createdAt
    expect(recommendation.stateVersion).toBe(1);
    expect(recommendation.confidence).toBeGreaterThan(0);
    expect(recommendation.confidence).toBeLessThanOrEqual(1);
    expect(recommendation.dataFreshnessSec).toBeGreaterThanOrEqual(0);
    expect(recommendation.createdAt).toBeDefined();

    // 3. Validates impacted mission was correctly identified
    expect(recommendation.impactedMissionIds).toContain('M-01');

    // 4. Score must be between 0 and 100
    expect(recommendation.score).toBeGreaterThan(70);
    expect(recommendation.score).toBeLessThanOrEqual(100);

    // 5. Status must start as pending for commander approval
    expect(recommendation.status).toBe('pending');

    // 6. Proposed changes conform to new { missionId, kind, before, after, note } shape
    expect(recommendation.changes.length).toBeGreaterThan(0);
    const swapChange = recommendation.changes.find(
      (c) => c.kind === 'aircraft_swap',
    );
    expect(swapChange).toBeDefined();
    expect(swapChange?.missionId).toBe('M-01');
    expect(swapChange?.before).toBe('AC-01');
    expect(swapChange?.after).not.toBe('AC-01');

    // 7. Tradeoffs have direction: 'good' | 'bad' | 'neutral'
    expect(recommendation.tradeoffs.length).toBeGreaterThan(0);
    recommendation.tradeoffs.forEach((t) => {
      expect(['good', 'bad', 'neutral']).toContain(t.direction);
    });

    // 8. Explainability
    expect(recommendation.explanation.length).toBeGreaterThan(0);
    expect(recommendation.constraintsSatisfied.length).toBeGreaterThan(0);
  });

  it('handles unserviceability of unassigned reserve airframe with zero mission impact', async () => {
    const snapshot = await mockDataService.getSnapshot();

    // AC-08 is an unassigned reserve Fighter-A
    const event: OpsEvent = {
      id: 'EV-0011',
      type: 'AIRCRAFT_UNSERVICEABLE',
      payload: {
        aircraftId: 'AC-08',
        reason: 'Avionics radar calibration fault',
      },
      timestamp: new Date().toISOString(),
    };

    const recommendation = mockRetaskEngine.evaluateEvent(event, {
      bases: snapshot.bases,
      aircraft: snapshot.aircraft,
      crew: snapshot.crew,
      missions: snapshot.missions,
      threats: snapshot.threats,
    });

    expect(recommendation.id).toMatch(/^REC-\d{4}$/);
    expect(recommendation.impactedMissionIds).toHaveLength(0);
    expect(recommendation.score).toBe(95);
    expect(recommendation.summary).toContain('zero mission impact');
  });

  it('generates an airbase diversion recommendation when an operational base closes', async () => {
    const snapshot = await mockDataService.getSnapshot();

    const event: OpsEvent = {
      id: 'EV-0012',
      type: 'BASE_CLOSED',
      payload: {
        baseId: 'BASE-B',
        reason: 'Crosswind 38kts exceeding safe landing envelope',
      },
      timestamp: new Date().toISOString(),
    };

    const recommendation = mockRetaskEngine.evaluateEvent(event, {
      bases: snapshot.bases,
      aircraft: snapshot.aircraft,
      crew: snapshot.crew,
      missions: snapshot.missions,
      threats: snapshot.threats,
    });

    // Base BASE-B has M-04 and M-07 launching/recovering there
    expect(recommendation.impactedMissionIds).toContain('M-04');

    const rerouteChange = recommendation.changes.find(
      (c) => c.kind === 'reroute',
    );
    expect(rerouteChange).toBeDefined();
    expect(rerouteChange?.before).toBe('BASE-B');

    // Divert distance and fuel burn tradeoffs
    const divertTradeoff = recommendation.tradeoffs.find(
      (t) => t.label.includes('Divert') || t.label.includes('Fuel') || t.label.includes('Exposure'),
    );
    expect(divertTradeoff).toBeDefined();
    expect(divertTradeoff?.direction).toBeDefined();
  });

  it('generates dogleg or screening orbit when threat contact is detected', async () => {
    const snapshot = await mockDataService.getSnapshot();

    const event: OpsEvent = {
      id: 'EV-0013',
      type: 'THREAT_DETECTED',
      payload: {
        threatType: 'SAM',
        position: { lat: 4.8, lng: 7.5 },
        rangeKm: 85,
      },
      timestamp: new Date().toISOString(),
    };

    const recommendation = mockRetaskEngine.evaluateEvent(event, {
      bases: snapshot.bases,
      aircraft: snapshot.aircraft,
      crew: snapshot.crew,
      missions: snapshot.missions,
      threats: snapshot.threats,
    });

    expect(recommendation.score).toBeGreaterThan(80);
    expect(recommendation.summary).toContain('SAM');
    expect(recommendation.changes.some((c) => c.kind === 'reroute')).toBe(true);
    expect(recommendation.tradeoffs.some((t) => t.direction === 'good')).toBe(true);
  });

  it('substitutes crew with low fatigue index when designated crew becomes unavailable', async () => {
    const snapshot = await mockDataService.getSnapshot();

    const event: OpsEvent = {
      id: 'EV-0014',
      type: 'CREW_UNAVAILABLE',
      payload: {
        crewId: 'CR-01',
        reason: 'Pre-flight medical grounding',
      },
      timestamp: new Date().toISOString(),
    };

    const recommendation = mockRetaskEngine.evaluateEvent(event, {
      bases: snapshot.bases,
      aircraft: snapshot.aircraft,
      crew: snapshot.crew,
      missions: snapshot.missions,
      threats: snapshot.threats,
    });

    expect(recommendation.impactedMissionIds).toContain('M-01');
    const crewChange = recommendation.changes.find(
      (c) => c.kind === 'crew_swap',
    );
    expect(crewChange).toBeDefined();
    expect(crewChange?.before).toBe('CR-01');
    expect(crewChange?.missionId).toBe('M-01');
  });
});
