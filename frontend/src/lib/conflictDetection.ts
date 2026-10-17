import { Mission, Aircraft, Crew } from '@/types';

export type ConflictType =
  | 'double_booked_aircraft'
  | 'double_booked_crew'
  | 'insufficient_turnaround'
  | 'crew_duty_limit_breach'
  | 'unserviceable_asset'
  | 'resource_mismatch';

export interface ConflictItem {
  id: string;
  type: ConflictType;
  severity: 'critical' | 'warning';
  missionId: string;
  relatedMissionId?: string;
  entityType: 'aircraft' | 'crew' | 'mission';
  entityId: string;
  title: string;
  description: string;
  suggestedAction?: string;
}

export interface ConflictDetectionResult {
  conflicts: ConflictItem[];
  allConflicts: ConflictItem[];
  byMission: Record<string, ConflictItem[]>;
  conflictsByMission: Map<string, ConflictItem[]>;
}

/**
 * Pure evaluation function that inspects missions, aircraft, and crew states
 * to identify scheduling collisions, safety violations, and resource mismatches.
 *
 * Guarantees:
 * - ZERO store access
 * - ZERO Date.now() or system clock dependencies
 * - ZERO React imports or side-effects
 * - Deterministic output based strictly on passed arguments
 *
 * @param missions Active and planned sorties to evaluate
 * @param aircraft Registry of fleet airframes
 * @param crew Registry of aircrew personnel
 * @param turnaroundMinutesOrRefTime Turnaround threshold in minutes OR reference timestamp
 * @param optionalTurnaroundMinutes Turnaround threshold when reference timestamp is passed
 */
export function detectMissionConflicts(
  missions: Mission[],
  aircraft: Record<string, Aircraft>,
  crew: Record<string, Crew>,
  turnaroundMinutesOrRefTime?: number | string | Date,
  optionalTurnaroundMinutes?: number,
): ConflictDetectionResult {
  let turnaroundMinutes = 45;
  const referenceTime =
    typeof turnaroundMinutesOrRefTime === 'number'
      ? undefined
      : turnaroundMinutesOrRefTime !== undefined
      ? new Date(turnaroundMinutesOrRefTime)
      : undefined;

  if (typeof turnaroundMinutesOrRefTime === 'number') {
    turnaroundMinutes = turnaroundMinutesOrRefTime;
  }
  if (optionalTurnaroundMinutes !== undefined) {
    turnaroundMinutes = optionalTurnaroundMinutes;
  }

  // Available for external deterministic simulation reference
  void referenceTime;

  const conflictsByMission = new Map<string, ConflictItem[]>();
  const byMission: Record<string, ConflictItem[]> = {};
  const allConflicts: ConflictItem[] = [];

  function addConflict(conflict: ConflictItem) {
    allConflicts.push(conflict);

    // Map entry
    const existingMap = conflictsByMission.get(conflict.missionId) || [];
    existingMap.push(conflict);
    conflictsByMission.set(conflict.missionId, existingMap);

    // Record entry
    if (!byMission[conflict.missionId]) {
      byMission[conflict.missionId] = [];
    }
    byMission[conflict.missionId].push(conflict);
  }

  // Active or planned missions under consideration (ignore completed / cancelled)
  const activeMissions = missions.filter(
    (m) => m.status !== 'completed' && m.status !== 'cancelled',
  );

  // 1. Cross-mission pairwise checks: Overlaps & Turnaround
  for (let i = 0; i < activeMissions.length; i++) {
    const mA = activeMissions[i];
    const startA = new Date(mA.windowStart).getTime();
    const endA = new Date(mA.windowEnd).getTime();

    for (let j = i + 1; j < activeMissions.length; j++) {
      const mB = activeMissions[j];
      const startB = new Date(mB.windowStart).getTime();
      const endB = new Date(mB.windowEnd).getTime();

      const isOverlapping = startA < endB && startB < endA;

      // Check double-booked aircraft
      mA.assigned.aircraftIds.forEach((acId) => {
        if (mB.assigned.aircraftIds.includes(acId)) {
          const ac = aircraft[acId];
          const acLabel = ac ? `${ac.tailNumber} (${ac.type})` : acId;

          if (isOverlapping) {
            const conflictA: ConflictItem = {
              id: `CNF-AC-${mA.id}-${mB.id}-${acId}`,
              type: 'double_booked_aircraft',
              severity: 'critical',
              missionId: mA.id,
              relatedMissionId: mB.id,
              entityType: 'aircraft',
              entityId: acId,
              title: 'Double-Booked Aircraft',
              description: `Airframe ${acLabel} is scheduled concurrently on ${mA.name} and ${mB.name}.`,
              suggestedAction: 'Retask an unassigned reserve airframe or de-conflict sortie departure times.',
            };
            const conflictB: ConflictItem = {
              id: `CNF-AC-${mB.id}-${mA.id}-${acId}`,
              type: 'double_booked_aircraft',
              severity: 'critical',
              missionId: mB.id,
              relatedMissionId: mA.id,
              entityType: 'aircraft',
              entityId: acId,
              title: 'Double-Booked Aircraft',
              description: `Airframe ${acLabel} is scheduled concurrently on ${mB.name} and ${mA.name}.`,
              suggestedAction: 'Retask an unassigned reserve airframe or de-conflict sortie departure times.',
            };
            addConflict(conflictA);
            addConflict(conflictB);
          } else {
            // Check turnaround buffer if A finishes before B or vice versa
            let first = mA;
            let second = mB;
            let gapMs = startB - endA;

            if (endB <= startA) {
              first = mB;
              second = mA;
              gapMs = startA - endB;
            }

            const turnaroundMs = turnaroundMinutes * 60 * 1000;
            if (gapMs >= 0 && gapMs < turnaroundMs) {
              const gapMin = Math.round(gapMs / 60000);
              const cnf: ConflictItem = {
                id: `CNF-TA-${first.id}-${second.id}-${acId}`,
                type: 'insufficient_turnaround',
                severity: 'warning',
                missionId: second.id,
                relatedMissionId: first.id,
                entityType: 'aircraft',
                entityId: acId,
                title: 'Insufficient Turnaround Window',
                description: `Turnaround buffer on ${acLabel} between ${first.name} and ${second.name} is only ${gapMin}m (minimum ${turnaroundMinutes}m required).`,
                suggestedAction: `Extend departure buffer by ${turnaroundMinutes - gapMin} minutes or allocate a rested airframe.`,
              };
              addConflict(cnf);
            }
          }
        }
      });

      // Check double-booked crew
      if (isOverlapping) {
        mA.assigned.crewIds.forEach((cId) => {
          if (mB.assigned.crewIds.includes(cId)) {
            const c = crew[cId];
            const cLabel = c ? `${c.callsign} (${c.role})` : cId;

            const conflictA: ConflictItem = {
              id: `CNF-CR-${mA.id}-${mB.id}-${cId}`,
              type: 'double_booked_crew',
              severity: 'critical',
              missionId: mA.id,
              relatedMissionId: mB.id,
              entityType: 'crew',
              entityId: cId,
              title: 'Double-Booked Crew Member',
              description: `Aircrew ${cLabel} is assigned simultaneously to ${mA.name} and ${mB.name}.`,
              suggestedAction: 'Assign available standby crew from squadron roster.',
            };
            const conflictB: ConflictItem = {
              id: `CNF-CR-${mB.id}-${mA.id}-${cId}`,
              type: 'double_booked_crew',
              severity: 'critical',
              missionId: mB.id,
              relatedMissionId: mA.id,
              entityType: 'crew',
              entityId: cId,
              title: 'Double-Booked Crew Member',
              description: `Aircrew ${cLabel} is assigned simultaneously to ${mB.name} and ${mA.name}.`,
              suggestedAction: 'Assign available standby crew from squadron roster.',
            };
            addConflict(conflictA);
            addConflict(conflictB);
          }
        });
      }
    }
  }

  // 2. Single-mission checks: Duty limits, Serviceability & Resource Mismatches
  activeMissions.forEach((m) => {
    const start = new Date(m.windowStart).getTime();
    const end = new Date(m.windowEnd).getTime();
    const durationHours = Math.max(0.5, (end - start) / 3600000);

    // Crew duty limits
    m.assigned.crewIds.forEach((cId) => {
      const c = crew[cId];
      if (!c) return;

      const projectedDuty = c.dutyHoursLast24h + durationHours;
      if (projectedDuty > 12.0) {
        addConflict({
          id: `CNF-DUTY-${m.id}-${cId}`,
          type: 'crew_duty_limit_breach',
          severity: 'critical',
          missionId: m.id,
          entityType: 'crew',
          entityId: cId,
          title: 'Crew Duty Limit Breach (>12h)',
          description: `Pilot ${c.callsign} projected duty will reach ${projectedDuty.toFixed(1)}h during this sortie, exceeding the 12.0h legal limit.`,
          suggestedAction: 'Substitute with a pilot who has satisfied minimum mandatory rest.',
        });
      }
    });

    // Aircraft type match & serviceability
    m.assigned.aircraftIds.forEach((acId) => {
      const ac = aircraft[acId];
      if (!ac) return;

      if (ac.type !== m.requiredAircraftType) {
        addConflict({
          id: `CNF-TYPE-${m.id}-${acId}`,
          type: 'resource_mismatch',
          severity: 'critical',
          missionId: m.id,
          entityType: 'aircraft',
          entityId: acId,
          title: 'Aircraft Type Mismatch',
          description: `Mission requires ${m.requiredAircraftType}, but ${ac.type} (${ac.tailNumber}) is assigned.`,
          suggestedAction: `Reassign an available ${m.requiredAircraftType} airframe.`,
        });
      }

      if (ac.status === 'unserviceable') {
        addConflict({
          id: `CNF-UNSERV-${m.id}-${acId}`,
          type: 'unserviceable_asset',
          severity: 'critical',
          missionId: m.id,
          entityType: 'aircraft',
          entityId: acId,
          title: 'Unserviceable Airframe Assigned',
          description: `Assigned airframe ${ac.tailNumber} is flagged unserviceable for maintenance.`,
          suggestedAction: 'Perform aircraft swap via DSS recommendation engine.',
        });
      }
    });

    // Crew qualifications
    if (m.requiredCrewQuals && m.requiredCrewQuals.length > 0) {
      const assignedCrewObjects = m.assigned.crewIds
        .map((cId) => crew[cId])
        .filter(Boolean);

      m.requiredCrewQuals.forEach((qual) => {
        const hasQual = assignedCrewObjects.some((c) =>
          c.qualifications.includes(qual),
        );
        if (!hasQual) {
          addConflict({
            id: `CNF-QUAL-${m.id}-${qual}`,
            type: 'resource_mismatch',
            severity: 'warning',
            missionId: m.id,
            entityType: 'crew',
            entityId: m.assigned.crewIds[0] || 'NONE',
            title: 'Missing Required Qualification',
            description: `Assigned aircrew does not hold required qualification: ${qual}.`,
            suggestedAction: `Reassign to a pilot holding current ${qual} certification.`,
          });
        }
      });
    }
  });

  return {
    conflicts: allConflicts,
    allConflicts,
    byMission,
    conflictsByMission,
  };
}
