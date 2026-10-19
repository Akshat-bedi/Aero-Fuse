import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  validateBase,
  validateAircraft,
  validateCrew,
  validateMission,
  validateAirspace,
  validateThreat,
  validateSnapshot,
  validateWireSnapshot,
} from './contractValidation';
import {
  buildCleanSeedWorld,
  exportSeedToFile,
  getDefaultExportPath,
  WireSnapshotExport,
} from './exportSeed';

describe('Seed World Export & API Contract Compliance (export:seed)', () => {
  it('exports world.json to ../shared/seed/world.json with valid WireSnapshot shape', () => {
    const { filePath, byteLength } = exportSeedToFile();
    const diskPath = getDefaultExportPath();

    expect(filePath).toBe(diskPath);
    expect(fs.existsSync(diskPath)).toBe(true);
    expect(byteLength).toBeGreaterThan(10000);

    const rawDiskContent = fs.readFileSync(diskPath, 'utf-8');
    const parsed: WireSnapshotExport = JSON.parse(rawDiskContent);

    expect(parsed.stateVersion).toBe(1);
    expect(parsed.sim).toEqual({
      paused: false,
      speed: 1,
      time: expect.any(String),
    });
    expect(parsed.bounds).toEqual({
      maxLat: 10,
      maxLng: 12,
      minLat: 0,
      minLng: 0,
    });
    expect(parsed.recommendations).toEqual([]);
    expect(parsed.activeEvents).toEqual([]);
    expect(parsed.auditLog).toEqual([]);
  });

  it('has exactly 4 bases, 24 aircraft, 30 crew, and 10 missions', () => {
    const diskPath = getDefaultExportPath();
    const world: WireSnapshotExport = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));

    // 1. Exactly 4 bases
    expect(world.bases).toHaveLength(4);
    expect(world.bases.map((b) => b.id).sort()).toEqual([
      'BASE-A',
      'BASE-B',
      'BASE-C',
      'BASE-D',
    ]);

    // 2. Exactly 24 aircraft
    expect(world.aircraft).toHaveLength(24);
    const expectedAcIds = Array.from({ length: 24 }, (_, i) => `AC-${String(i + 1).padStart(2, '0')}`);
    expect(world.aircraft.map((a) => a.id).sort()).toEqual(expectedAcIds);

    // 3. Exactly 30 crew
    expect(world.crew).toHaveLength(30);
    const expectedCrewIds = Array.from({ length: 30 }, (_, i) => `CR-${String(i + 1).padStart(2, '0')}`);
    expect(world.crew.map((c) => c.id).sort()).toEqual(expectedCrewIds);

    // 4. Exactly 10 missions
    expect(world.missions).toHaveLength(10);
    const expectedMissionIds = Array.from({ length: 10 }, (_, i) => `M-${String(i + 1).padStart(2, '0')}`);
    expect(world.missions.map((m) => m.id).sort()).toEqual(expectedMissionIds);

    // Verify all missions include routeOptions
    world.missions.forEach((m) => {
      expect(Array.isArray(m.routeOptions), `Mission ${m.id} missing routeOptions array`).toBe(true);
      expect((m.routeOptions || []).length, `Mission ${m.id} routeOptions is empty`).toBeGreaterThan(0);
      m.routeOptions?.forEach((opt) => {
        expect(opt.id).toBeTruthy();
        expect(opt.name).toBeTruthy();
        expect(Array.isArray(opt.waypoints)).toBe(true);
        expect(opt.waypoints.length).toBeGreaterThan(0);
        expect(typeof opt.distanceKm).toBe('number');
        expect(typeof opt.riskScore).toBe('number');
      });
    });
  });

  it('passes all validators in src/lib/contractValidation.ts', () => {
    const diskPath = getDefaultExportPath();
    const world: WireSnapshotExport = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));

    // Validate using validateWireSnapshot
    const wireReport = validateWireSnapshot(world);
    expect(wireReport.valid, `WireSnapshot errors: ${wireReport.errors.join('; ')}`).toBe(true);
    expect(wireReport.errors).toHaveLength(0);

    // Validate using validateSnapshot (dual array/record support)
    const snapshotReport = validateSnapshot(world);
    expect(snapshotReport.valid, `Snapshot errors: ${snapshotReport.errors.join('; ')}`).toBe(true);
    expect(snapshotReport.errors).toHaveLength(0);

    // Validate every Base individually
    world.bases.forEach((base) => {
      const res = validateBase(base);
      expect(res.valid, `Base ${base.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(base.id).toMatch(/^BASE-[A-D]$/);
      expect(base.fuelStockPct).toBeGreaterThanOrEqual(0);
      expect(base.fuelStockPct).toBeLessThanOrEqual(100);
      expect(['open', 'degraded', 'closed']).toContain(base.runwayStatus);
    });

    // Validate every Aircraft individually
    world.aircraft.forEach((ac) => {
      const res = validateAircraft(ac);
      expect(res.valid, `Aircraft ${ac.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(ac.id).toMatch(/^AC-\d{2}$/);
      expect(ac.fuelPct).toBeGreaterThanOrEqual(0);
      expect(ac.fuelPct).toBeLessThanOrEqual(100);
      expect(Array.isArray(ac.weaponLoad)).toBe(true);
    });

    // Validate every Aircrew individually
    world.crew.forEach((cr) => {
      const res = validateCrew(cr);
      expect(res.valid, `Crew ${cr.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(cr.id).toMatch(/^CR-\d{2}$/);
      expect(cr.fatigueIndex).toBeGreaterThanOrEqual(0);
      expect(cr.fatigueIndex).toBeLessThanOrEqual(100);
      expect(['available', 'resting', 'on-mission', 'unavailable']).toContain(cr.status);
    });

    // Validate every Mission individually
    world.missions.forEach((m) => {
      const res = validateMission(m);
      expect(res.valid, `Mission ${m.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(m.id).toMatch(/^M-\d{2}$/);
      expect([1, 2, 3, 4]).toContain(m.priority);
      expect(['planned', 'approved', 'in-progress', 'completed', 'at-risk', 'cancelled']).toContain(m.status);
    });

    // Validate every Airspace sector individually
    world.airspace.forEach((as) => {
      const res = validateAirspace(as);
      expect(res.valid, `Airspace ${as.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(as.id).toMatch(/^AS-\d{2}$/);
    });

    // Validate every Threat contact individually
    world.threats.forEach((t) => {
      const res = validateThreat(t);
      expect(res.valid, `Threat ${t.id} errors: ${res.errors.join('; ')}`).toBe(true);
      expect(t.id).toMatch(/^THR-\d{2}$/);
    });
  });

  it('guarantees deterministic output with stable order and sorted keys', () => {
    const fixedTime = new Date('2026-10-17T12:00:00Z');
    const run1 = buildCleanSeedWorld(fixedTime);
    const run2 = buildCleanSeedWorld(fixedTime);

    const json1 = JSON.stringify(run1, null, 2);
    const json2 = JSON.stringify(run2, null, 2);

    expect(json1).toBe(json2);

    // Verify root keys are sorted alphabetically
    const rootKeys = Object.keys(run1);
    const sortedRootKeys = [...rootKeys].sort();
    expect(rootKeys).toEqual(sortedRootKeys);

    // Verify bounds keys are sorted alphabetically
    const boundsKeys = Object.keys(run1.bounds);
    expect(boundsKeys).toEqual([...boundsKeys].sort());

    // Verify sim keys are sorted alphabetically
    const simKeys = Object.keys(run1.sim);
    expect(simKeys).toEqual([...simKeys].sort());
  });
});
