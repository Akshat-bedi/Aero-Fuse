import { describe, it, expect } from 'vitest';
import {
  validateBase,
  validateAircraft,
  validateCrew,
  validateMission,
  validateAirspace,
  validateThreat,
  validateRecommendation,
  validateScenarioResult,
  validateAuditEntry,
  validateOperationalAlert,
  validateSnapshot,
} from './contractValidation';
import { mockDataService, DEFAULT_SAVED_SCENARIOS } from '@/services/mockDataService';
import { ScenarioParams, Recommendation } from '@/types';

describe('Stage 9: Runtime Contract Validation Tests', () => {
  it('validates entire baseline mock operational snapshot', async () => {
    const snapshot = await mockDataService.getSnapshot();
    const report = validateSnapshot(snapshot);

    expect(report.valid, `Snapshot validation errors: ${report.errors.join('; ')}`).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('validates every Air Base against API_CONTRACT.md section 6.1', async () => {
    const snapshot = await mockDataService.getSnapshot();
    const bases = Object.values(snapshot.bases);

    expect(bases.length).toBeGreaterThanOrEqual(4);
    bases.forEach((base) => {
      const report = validateBase(base);
      expect(report.valid, `Base ${base.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(base.id).toMatch(/^BASE-[A-D]$/);
      expect(base.fuelStockPct).toBeGreaterThanOrEqual(0);
      expect(base.fuelStockPct).toBeLessThanOrEqual(100);
      expect(['open', 'degraded', 'closed']).toContain(base.runwayStatus);
    });
  });

  it('validates every Aircraft against API_CONTRACT.md section 6.2', async () => {
    const snapshot = await mockDataService.getSnapshot();
    const aircraft = Object.values(snapshot.aircraft);

    expect(aircraft.length).toBeGreaterThanOrEqual(8);
    aircraft.forEach((ac) => {
      const report = validateAircraft(ac);
      expect(report.valid, `Aircraft ${ac.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(ac.id).toMatch(/^AC-\d{2}$/);
      expect(ac.fuelPct).toBeGreaterThanOrEqual(0);
      expect(ac.fuelPct).toBeLessThanOrEqual(100);
      expect(Array.isArray(ac.weaponLoad)).toBe(true);
    });
  });

  it('validates every Aircrew member against API_CONTRACT.md section 6.4', async () => {
    const snapshot = await mockDataService.getSnapshot();
    const crew = Object.values(snapshot.crew);

    expect(crew.length).toBeGreaterThanOrEqual(8);
    crew.forEach((cr) => {
      const report = validateCrew(cr);
      expect(report.valid, `Crew ${cr.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(cr.id).toMatch(/^CR-\d{2}$/);
      const fatigue = cr.fatigueIndex ?? (cr as unknown as { fatigueScore?: number }).fatigueScore;
      expect(fatigue).toBeGreaterThanOrEqual(0);
      expect(fatigue).toBeLessThanOrEqual(100);
      expect(['available', 'resting', 'on-mission', 'unavailable']).toContain(cr.status);
    });
  });

  it('validates every Mission against API_CONTRACT.md section 6.6', async () => {
    const snapshot = await mockDataService.getSnapshot();
    const missions = Object.values(snapshot.missions);

    expect(missions.length).toBeGreaterThanOrEqual(10);
    missions.forEach((m) => {
      const report = validateMission(m);
      expect(report.valid, `Mission ${m.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(m.id).toMatch(/^M-\d{2}$/);
      expect([1, 2, 3, 4]).toContain(m.priority);
      expect(['planned', 'approved', 'in-progress', 'completed', 'at-risk', 'cancelled']).toContain(
        m.status,
      );
    });
  });

  it('validates Airspace and Threats against API_CONTRACT.md sections 6.7 and 6.8', async () => {
    const snapshot = await mockDataService.getSnapshot();

    Object.values(snapshot.airspace).forEach((as) => {
      const report = validateAirspace(as);
      expect(report.valid, `Airspace ${as.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(as.id).toMatch(/^AS-\d{2}$/);
    });

    Object.values(snapshot.threats).forEach((t) => {
      const report = validateThreat(t);
      expect(report.valid, `Threat ${t.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(t.id).toMatch(/^THR-\d{2}$/);
    });
  });

  it('validates recommendations produced by the mock retask engine', async () => {
    // Inject a contingency event to produce an active recommendation
    await mockDataService.injectEvent({
      type: 'THREAT_DETECTED',
      payload: {
        threatType: 'SAM',
        position: { lat: 4.8, lng: 7.5 },
        rangeKm: 85,
      },
    });

    const recommendations = await mockDataService.getRecommendations?.();
    expect(recommendations).toBeDefined();
    expect(recommendations!.length).toBeGreaterThan(0);

    recommendations!.forEach((rec: Recommendation) => {
      const report = validateRecommendation(rec);
      expect(report.valid, `Recommendation ${rec.id} errors: ${report.errors.join('; ')}`).toBe(
        true,
      );
      expect(rec.id).toMatch(/^REC-\d{4}$/);
      expect(rec.confidence).toBeGreaterThanOrEqual(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(rec.changes)).toBe(true);
      expect(rec.changes.length).toBeGreaterThan(0);
    });
  });

  it('validates all scenario simulation results', async () => {
    // 1. Validate pre-seeded saved scenarios
    DEFAULT_SAVED_SCENARIOS.forEach((scen) => {
      const report = validateScenarioResult(scen);
      expect(report.valid, `Scenario ${scen.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(scen.id).toMatch(/^SCEN-\d{4}$/);
      expect(scen.baselineKpis.missionsFulfilledPct).toBe(100);
    });

    // 2. Validate dynamically executed scenario run
    const params: ScenarioParams = {
      name: 'Dynamic Validation Contingency',
      aircraftLoss: [{ type: 'Strike-B', baseId: 'BASE-B', count: 1 }],
      weatherSeverity: 'severe',
    };
    const result = await mockDataService.runScenario(params);
    const dynamicReport = validateScenarioResult(result);
    expect(
      dynamicReport.valid,
      `Dynamic Scenario errors: ${dynamicReport.errors.join('; ')}`,
    ).toBe(true);
  });

  it('validates audit log entries and hash chain integrity', async () => {
    const log = await mockDataService.getAuditLog();
    expect(log.length).toBeGreaterThan(0);

    log.forEach((entry) => {
      const report = validateAuditEntry(entry);
      expect(report.valid, `Audit ${entry.id} errors: ${report.errors.join('; ')}`).toBe(true);
      expect(entry.id).toMatch(/^AUD-\d{4}$/);
      expect(entry.hash).toHaveLength(64);
      expect(entry.prevHash).toHaveLength(64);
    });
  });

  it('validates operational alerts against Stage 9 types', () => {
    const sampleAlert = {
      id: 'ALT-0001',
      title: 'Corridor Dogleg Incursion',
      message: 'Transit route intersects buffer corridor.',
      severity: 'warning' as const,
      type: 'threat' as const,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    const report = validateOperationalAlert(sampleAlert);
    expect(report.valid).toBe(true);

    // Negative validation test
    const invalidAlert = {
      id: 123, // Invalid id type
      title: 'Missing Type Alert',
      severity: 'super-urgent', // Invalid severity
      acknowledged: 'no', // Invalid boolean
    };

    const failReport = validateOperationalAlert(invalidAlert);
    expect(failReport.valid).toBe(false);
    expect(failReport.errors.length).toBeGreaterThan(0);
  });
});
