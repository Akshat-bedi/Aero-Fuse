import { describe, it, expect } from 'vitest';
import { detectMissionConflicts } from './conflictDetection';
import {
  generateSeedMissions,
  generateSeedAircraft,
  generateSeedCrew,
} from '@/services/mockDataService';
import { Mission, Aircraft, Crew } from '@/types';

function createTestMission(overrides: Partial<Mission> & { id: string; name: string }): Mission {
  return {
    type: 'CAP',
    priority: 1,
    status: 'planned',
    launchBaseId: 'BASE-A',
    target: { lat: 8.8, lng: 5.2, name: 'Target Alpha' },
    route: [{ lat: 8.5, lng: 3.5 }, { lat: 8.8, lng: 5.2 }],
    windowStart: '2026-10-17T10:00:00Z',
    windowEnd: '2026-10-17T14:00:00Z',
    requiredAircraftType: 'Fighter-A',
    requiredCrewQuals: [],
    requiredWeapons: [],
    assigned: { aircraftIds: [], crewIds: [] },
    ...overrides,
  };
}

describe('detectMissionConflicts (Pure Conflict Engine)', () => {
  const baseAircraft: Record<string, Aircraft> = {
    'AC-01': {
      id: 'AC-01',
      tailNumber: 'VR-F01',
      callsign: 'VAPOR-11',
      type: 'Fighter-A',
      baseId: 'BASE-A',
      status: 'serviceable',
      fuelPct: 95,
      flightHoursToNextService: 50,
      weaponLoad: [],
      position: { lat: 8.5, lng: 3.5 },
      heading: 0,
      speed: 0,
    },
    'AC-02': {
      id: 'AC-02',
      tailNumber: 'VR-F02',
      callsign: 'VAPOR-12',
      type: 'Fighter-A',
      baseId: 'BASE-A',
      status: 'serviceable',
      fuelPct: 90,
      flightHoursToNextService: 40,
      weaponLoad: [],
      position: { lat: 8.5, lng: 3.5 },
      heading: 0,
      speed: 0,
    },
    'AC-09': {
      id: 'AC-09',
      tailNumber: 'VR-S09',
      callsign: 'HAMMER-09',
      type: 'Strike-B',
      baseId: 'BASE-B',
      status: 'serviceable',
      fuelPct: 88,
      flightHoursToNextService: 30,
      weaponLoad: [],
      position: { lat: 5.2, lng: 6.8 },
      heading: 0,
      speed: 0,
    },
    'AC-23': {
      id: 'AC-23',
      tailNumber: 'VR-H23',
      callsign: 'DUSTOFF-42',
      type: 'Helicopter-E',
      baseId: 'BASE-A',
      status: 'serviceable',
      fuelPct: 85,
      flightHoursToNextService: 40,
      weaponLoad: [],
      position: { lat: 8.5, lng: 3.5 },
      heading: 0,
      speed: 0,
    },
  };

  const baseCrew: Record<string, Crew> = {
    'CR-01': {
      id: 'CR-01',
      callsign: 'VIPER',
      role: 'Lead Fighter Pilot',
      qualifications: ['AAM_COMBAT', 'NIGHT_OPS', 'TACTICAL_DATALINK'],
      baseId: 'BASE-A',
      fatigueIndex: 30,
      dutyHoursLast24h: 4.0,
      status: 'available',
    },
    'CR-02': {
      id: 'CR-02',
      callsign: 'HAWK',
      role: 'Lead Fighter Pilot',
      qualifications: ['AAM_COMBAT', 'NIGHT_OPS', 'TACTICAL_DATALINK'],
      baseId: 'BASE-A',
      fatigueIndex: 25,
      dutyHoursLast24h: 3.5,
      status: 'available',
    },
    'CR-08': {
      id: 'CR-08',
      callsign: 'VALKYRIE',
      role: 'Lead Fighter Pilot',
      qualifications: ['AAM_COMBAT', 'SEAD_STRIKE', 'TACTICAL_DATALINK'],
      baseId: 'BASE-B',
      fatigueIndex: 86,
      dutyHoursLast24h: 11.2,
      status: 'available',
    },
  };

  describe('1. Double-booked Aircraft Check', () => {
    it('detects a conflict when the same airframe is assigned to concurrent sorties (violating case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie Alpha',
          type: 'CAP',
          windowStart: '2026-10-17T10:00:00Z',
          windowEnd: '2026-10-17T14:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Bravo',
          type: 'CAP',
          windowStart: '2026-10-17T12:00:00Z', // Overlaps with Sortie Alpha
          windowEnd: '2026-10-17T16:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-02'] },
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'double_booked_aircraft');

      expect(conflicts.length).toBe(2);
      expect(conflicts.some((c) => c.missionId === 'M-TEST-1' && c.entityId === 'AC-01')).toBe(true);
      expect(conflicts.some((c) => c.missionId === 'M-TEST-2' && c.entityId === 'AC-01')).toBe(true);
    });

    it('passes when airframes are assigned to separate aircraft (passing case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie Alpha',
          type: 'CAP',
          windowStart: '2026-10-17T10:00:00Z',
          windowEnd: '2026-10-17T14:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Bravo',
          type: 'CAP',
          windowStart: '2026-10-17T12:00:00Z',
          windowEnd: '2026-10-17T16:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-02'], crewIds: ['CR-02'] },
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'double_booked_aircraft');
      expect(conflicts.length).toBe(0);
    });
  });

  describe('2. Double-booked Crew Check', () => {
    it('detects a conflict when the same aircrew is assigned to concurrent sorties (violating case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie Alpha',
          type: 'CAP',
          windowStart: '2026-10-17T10:00:00Z',
          windowEnd: '2026-10-17T14:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Bravo',
          type: 'CAP',
          windowStart: '2026-10-17T11:00:00Z', // Overlaps
          windowEnd: '2026-10-17T15:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-02'], crewIds: ['CR-01'] }, // Same crew CR-01
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'double_booked_crew');

      expect(conflicts.length).toBe(2);
      expect(conflicts.some((c) => c.missionId === 'M-TEST-1' && c.entityId === 'CR-01')).toBe(true);
      expect(conflicts.some((c) => c.missionId === 'M-TEST-2' && c.entityId === 'CR-01')).toBe(true);
    });

    it('passes when separate aircrew are assigned (passing case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie Alpha',
          type: 'CAP',
          windowStart: '2026-10-17T10:00:00Z',
          windowEnd: '2026-10-17T14:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-01'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Bravo',
          type: 'CAP',
          windowStart: '2026-10-17T11:00:00Z',
          windowEnd: '2026-10-17T15:00:00Z',
          requiredAircraftType: 'Fighter-A',
          assigned: { aircraftIds: ['AC-02'], crewIds: ['CR-02'] },
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'double_booked_crew');
      expect(conflicts.length).toBe(0);
    });
  });

  describe('3. Turnaround Buffer Check (< 45m)', () => {
    it('detects a conflict when sequential sorties on the same airframe have less than 45m buffer (violating case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie First',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T08:00:00Z',
          windowEnd: '2026-10-17T12:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Second',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T12:15:00Z', // 15 min gap (< 45m turnaround threshold)
          windowEnd: '2026-10-17T16:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-02'] },
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew, 45);
      const conflicts = result.conflicts.filter((c) => c.type === 'insufficient_turnaround');

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].entityId).toBe('AC-09');
      expect(conflicts[0].missionId).toBe('M-TEST-2');
      expect(conflicts[0].description).toContain('15m');
    });

    it('passes when sequential sorties on the same airframe have >= 45m buffer (passing case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-1',
          name: 'Sortie First',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T08:00:00Z',
          windowEnd: '2026-10-17T12:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-01'] },
        }),
        createTestMission({
          id: 'M-TEST-2',
          name: 'Sortie Second',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T13:00:00Z', // 60 min gap (>= 45m turnaround threshold)
          windowEnd: '2026-10-17T17:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-02'] },
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew, 45);
      const conflicts = result.conflicts.filter((c) => c.type === 'insufficient_turnaround');
      expect(conflicts.length).toBe(0);
    });
  });

  describe('4. Crew Duty Limit Check (> 12h)', () => {
    it('detects a conflict when projected duty hours exceed 12.0h (violating case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-DUTY',
          name: 'Long Interdiction Sortie',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T12:00:00Z',
          windowEnd: '2026-10-17T16:00:00Z', // 4h duration
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-08'] }, // CR-08 already has 11.2h -> 15.2h > 12h
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'crew_duty_limit_breach');

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].entityId).toBe('CR-08');
      expect(conflicts[0].description).toContain('15.2h');
    });

    it('passes when projected duty hours remain within legal 12.0h limit (passing case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-NOMINAL',
          name: 'Standard Interdiction Sortie',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T12:00:00Z',
          windowEnd: '2026-10-17T16:00:00Z', // 4h duration
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-01'] }, // CR-01 has 4.0h -> 8.0h <= 12h
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter((c) => c.type === 'crew_duty_limit_breach');
      expect(conflicts.length).toBe(0);
    });
  });

  describe('5. Resource Type Mismatch Check', () => {
    it('detects a conflict when assigned airframe type does not match required type (violating case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-MISMATCH',
          name: 'Strike Mission with Helicopter Assigned',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T12:00:00Z',
          windowEnd: '2026-10-17T16:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-23'], crewIds: ['CR-01'] }, // AC-23 is Helicopter-E
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter(
        (c) => c.type === 'resource_mismatch' && c.entityType === 'aircraft',
      );

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].entityId).toBe('AC-23');
      expect(conflicts[0].description).toContain('Helicopter-E');
    });

    it('passes when assigned airframe matches required type (passing case)', () => {
      const missions: Mission[] = [
        createTestMission({
          id: 'M-TEST-MATCH',
          name: 'Strike Mission with Strike Aircraft Assigned',
          type: 'strike',
          launchBaseId: 'BASE-B',
          windowStart: '2026-10-17T12:00:00Z',
          windowEnd: '2026-10-17T16:00:00Z',
          requiredAircraftType: 'Strike-B',
          assigned: { aircraftIds: ['AC-09'], crewIds: ['CR-01'] }, // AC-09 is Strike-B
        }),
      ];

      const result = detectMissionConflicts(missions, baseAircraft, baseCrew);
      const conflicts = result.conflicts.filter(
        (c) => c.type === 'resource_mismatch' && c.entityType === 'aircraft',
      );
      expect(conflicts.length).toBe(0);
    });
  });

  describe('6. Default Dataset Zero-Conflict Verification', () => {
    it('proves the DEFAULT mock dataset (M-01..M-10) starts 100% CLEAN with ZERO conflicts', () => {
      const defaultMissions = generateSeedMissions(false);
      const aircraft = generateSeedAircraft();
      const crew = generateSeedCrew();

      const missionsList = Object.values(defaultMissions);

      // Verify mission count is strictly 10
      expect(missionsList.length).toBe(10);
      expect(missionsList.map((m) => m.id)).toEqual([
        'M-01', 'M-02', 'M-03', 'M-04', 'M-05',
        'M-06', 'M-07', 'M-08', 'M-09', 'M-10',
      ]);

      // Verify no mission has status 'at-risk'
      const atRiskMissions = missionsList.filter((m) => m.status === 'at-risk');
      expect(atRiskMissions.length).toBe(0);

      // Evaluate through conflict engine
      const { allConflicts, byMission } = detectMissionConflicts(
        missionsList,
        aircraft,
        crew,
        45,
      );

      // Verify ZERO active conflicts detected
      expect(allConflicts).toHaveLength(0);
      expect(Object.keys(byMission)).toHaveLength(0);
    });
  });

  describe('7. Conflict Demo Layer Verification', () => {
    it('proves the conflict-demo layer (includeConflicts=true) produces expected conflicts across M-11..M-14', () => {
      const demoMissions = generateSeedMissions(true);
      const aircraft = generateSeedAircraft();
      const crew = generateSeedCrew();

      const missionsList = Object.values(demoMissions);

      // Verify mission count is 14
      expect(missionsList.length).toBe(14);
      expect(demoMissions['M-11']).toBeDefined();
      expect(demoMissions['M-12']).toBeDefined();
      expect(demoMissions['M-13']).toBeDefined();
      expect(demoMissions['M-14']).toBeDefined();

      // M-11 should be pre-set as at-risk
      expect(demoMissions['M-11'].status).toBe('at-risk');

      // Evaluate through conflict engine
      const { allConflicts } = detectMissionConflicts(
        missionsList,
        aircraft,
        crew,
        45,
      );

      // 1. Double-booked aircraft (AC-04 on M-06 and M-13)
      const doubleBookedAc = allConflicts.filter((c) => c.type === 'double_booked_aircraft');
      expect(doubleBookedAc.length).toBeGreaterThan(0);
      expect(doubleBookedAc.some((c) => c.entityId === 'AC-04')).toBe(true);

      // 2. Double-booked crew (CR-04 on M-06 and M-13)
      const doubleBookedCr = allConflicts.filter((c) => c.type === 'double_booked_crew');
      expect(doubleBookedCr.length).toBeGreaterThan(0);
      expect(doubleBookedCr.some((c) => c.entityId === 'CR-04')).toBe(true);

      // 3. Turnaround buffer (AC-09 on M-07 and M-14 with 15m gap)
      const turnaround = allConflicts.filter((c) => c.type === 'insufficient_turnaround');
      expect(turnaround.length).toBeGreaterThan(0);
      expect(turnaround.some((c) => c.entityId === 'AC-09')).toBe(true);

      // 4. Crew duty breach (CR-08 on M-11)
      const dutyBreach = allConflicts.filter((c) => c.type === 'crew_duty_limit_breach');
      expect(dutyBreach.length).toBeGreaterThan(0);
      expect(dutyBreach.some((c) => c.entityId === 'CR-08')).toBe(true);

      // 5. Aircraft type mismatch (AC-23 Helicopter-E assigned to Strike-B M-11)
      const typeMismatch = allConflicts.filter(
        (c) => c.type === 'resource_mismatch' && c.entityType === 'aircraft',
      );
      expect(typeMismatch.length).toBeGreaterThan(0);
      expect(typeMismatch.some((c) => c.entityId === 'AC-23')).toBe(true);
    });
  });
});
