import {
  OpsEvent,
  Recommendation,
  Change,
  Tradeoff,
  Base,
  Aircraft,
  Crew,
  Mission,
  Threat,
  LatLng,
} from '@/types';

export interface RetaskContext {
  bases: Record<string, Base>;
  aircraft: Record<string, Aircraft>;
  crew: Record<string, Crew>;
  missions: Record<string, Mission>;
  threats: Record<string, Threat>;
}

/**
 * Calculates Euclidean distance between two coordinates in degrees (approximate for planar fictional map)
 */
function getApproxDistanceKm(p1: LatLng, p2: LatLng): number {
  const dLat = (p2.lat - p1.lat) * 111;
  const dLng = (p2.lng - p1.lng) * 111 * Math.cos(((p1.lat + p2.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Deterministic Mock Retask Optimization Engine
 * Evaluates operational events, identifies impacted missions, and formulates
 * ranked decision-support recommendations with explainability and trade-offs.
 * Adheres to context.md backend spec.
 */
export class MockRetaskEngine {
  private recCounter = 1;

  private generateRecId(): string {
    const id = `REC-${String(this.recCounter).padStart(4, '0')}`;
    this.recCounter++;
    return id;
  }

  /**
   * Evaluates an operational event and produces a recommendation conforming to context.md
   */
  public evaluateEvent(event: OpsEvent, context: RetaskContext): Recommendation {
    let rec: Recommendation;
    switch (event.type) {
      case 'AIRCRAFT_UNSERVICEABLE':
        rec = this.handleAircraftUnserviceable(event, context);
        break;
      case 'BASE_CLOSED':
      case 'WEATHER_DEGRADED':
        rec = this.handleBaseDisruption(event, context);
        break;
      case 'THREAT_DETECTED':
        rec = this.handleThreatDetected(event, context);
        break;
      case 'CREW_UNAVAILABLE':
        rec = this.handleCrewUnavailable(event, context);
        break;
      case 'NEW_PRIORITY_MISSION':
        rec = this.handleNewPriorityMission(event, context);
        break;
      default:
        rec = this.handleGenericEvent(event, context);
        break;
    }
    return this.attachAlternatives(rec, event, context);
  }

  private handleAircraftUnserviceable(event: OpsEvent, context: RetaskContext): Recommendation {
    const aircraftId = (event.payload.aircraftId as string) || '';
    const reason = (event.payload.reason as string) || 'Hydraulic actuator pressure loss';
    const originalAircraft = context.aircraft[aircraftId];

    // Find any mission assigned to this aircraft
    const impactedMission = Object.values(context.missions).find((m) =>
      m.assigned.aircraftIds.includes(aircraftId),
    );

    if (!impactedMission) {
      // Unassigned aircraft
      return {
        id: this.generateRecId(),
        triggerEventId: event.id,
        summary: `Ground ${originalAircraft?.tailNumber || aircraftId} for unscheduled inspection; zero mission impact.`,
        score: 95,
        changes: [
          {
            missionId: 'NONE',
            kind: 'delay',
            before: originalAircraft?.status || 'serviceable',
            after: 'unserviceable',
            note: `Transition status of ${originalAircraft?.tailNumber || aircraftId} to unserviceable for maintenance.`,
            type: 'REPLACE_AIRCRAFT',
            entityId: aircraftId,
            fromValue: 'serviceable',
            toValue: 'unserviceable',
            description: `Transition status of ${originalAircraft?.tailNumber || aircraftId} to unserviceable for maintenance.`,
          },
        ],
        impactedMissionIds: [],
        tradeoffs: [
          { label: 'Available Fleet Margin', delta: -1, unit: 'airframe', direction: 'bad' },
        ],
        explanation: [
          `Airframe ${originalAircraft?.tailNumber || aircraftId} reported ${reason}.`,
          'Aircraft is currently in reserve and has no active ATO sortie assigned.',
          'No mission replanning required.',
        ],
        constraintsSatisfied: [
          'Zero impact on scheduled ATO sorties',
          'Maintenance depot capacity available',
        ],
        constraintsRelaxed: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        stateVersion: 1,
        confidence: 0.95,
        dataFreshnessSec: 5,
        alternatives: [],
      };
    }

    // Impacted mission exists: find substitute aircraft of required type
    const candidateAircraft = Object.values(context.aircraft).filter(
      (ac) =>
        ac.id !== aircraftId &&
        ac.type === impactedMission.requiredAircraftType &&
        (ac.status === 'serviceable' || ac.status === 'turnaround') &&
        !ac.assignedMissionId,
    );

    // Prefer candidate at same base, then highest fuel
    candidateAircraft.sort((a, b) => {
      const aSameBase = a.baseId === impactedMission.launchBaseId ? 1 : 0;
      const bSameBase = b.baseId === impactedMission.launchBaseId ? 1 : 0;
      if (aSameBase !== bSameBase) return bSameBase - aSameBase;
      return b.fuelPct - a.fuelPct;
    });

    const bestCandidate = candidateAircraft[0];
    const candidateBase = bestCandidate ? context.bases[bestCandidate.baseId] : undefined;
    const isSameBase = bestCandidate && bestCandidate.baseId === impactedMission.launchBaseId;

    const changes: Change[] = [];
    if (bestCandidate) {
      changes.push({
        missionId: impactedMission.id,
        kind: 'aircraft_swap',
        before: aircraftId,
        after: bestCandidate.id,
        note: `Retask ${bestCandidate.tailNumber} (${bestCandidate.type}) from ${candidateBase?.name || 'Base'} to replace ${originalAircraft?.tailNumber || aircraftId}.`,
        type: 'REPLACE_AIRCRAFT',
        entityId: impactedMission.id,
        fromValue: aircraftId,
        toValue: bestCandidate.id,
        description: `Retask ${bestCandidate.tailNumber} (${bestCandidate.type}) from ${candidateBase?.name || 'Base'} to replace ${originalAircraft?.tailNumber || aircraftId}.`,
      });
    } else {
      changes.push({
        missionId: impactedMission.id,
        kind: 'delay',
        before: impactedMission.windowStart,
        after: new Date(Date.now() + 7200000).toISOString(),
        note: 'Delay mission start by 120 minutes until replacement airframe readies.',
        type: 'DELAY_SORTIE',
        entityId: impactedMission.id,
        fromValue: impactedMission.windowStart,
        toValue: new Date(Date.now() + 7200000).toISOString(),
        description: 'Delay mission start by 120 minutes until replacement airframe readies.',
      });
    }

    const score = bestCandidate ? (isSameBase ? 94 : 82) : 55;
    const transitDelayMin = isSameBase ? 5 : 22;
    const transitFuelBurnKg = isSameBase ? 200 : 850;

    const tradeoffs: Tradeoff[] = [
      { label: 'Sortie Departure Delay', delta: transitDelayMin, unit: 'min', direction: 'bad' },
      { label: 'Readiness Margin Drawdown', delta: -1, unit: 'airframe', direction: 'bad' },
      { label: 'Transit Fuel Consumption', delta: transitFuelBurnKg, unit: 'kg', direction: 'bad' },
    ];

    const explanation: string[] = [
      `Airframe ${originalAircraft?.tailNumber || aircraftId} is unserviceable (${reason}).`,
      bestCandidate
        ? `Substitute airframe ${bestCandidate.tailNumber} (${bestCandidate.type}) selected from ${candidateBase?.name} with ${bestCandidate.fuelPct}% fuel reserve.`
        : 'No immediate airframe of matching type is available in ready posture.',
      isSameBase
        ? `Same-base turnaround minimizes pre-flight delay to +${transitDelayMin} mins.`
        : `Inter-base transit adds ${transitDelayMin} minutes delay to target area time-on-station.`,
      `Mission ${impactedMission.name} objectives and payload profile preserved.`,
    ];

    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: bestCandidate
        ? `Substitute ${bestCandidate.tailNumber} for ${originalAircraft?.tailNumber || aircraftId} on ${impactedMission.name} (${transitDelayMin}m prep).`
        : `Delay mission ${impactedMission.name} due to lack of immediate ${impactedMission.requiredAircraftType} airframe.`,
      score,
      changes,
      impactedMissionIds: [impactedMission.id],
      tradeoffs,
      explanation,
      constraintsSatisfied: [
        'Aircraft type match: Compatible stations verified',
        'Fuel margin: Required RTB reserve satisfied',
        'Crew duty time: Assigned pilot within legal duty window',
      ],
      constraintsRelaxed: isSameBase ? [] : ['Alert posture at origin base reduced by 1 airframe'],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.91,
      dataFreshnessSec: 4,
      alternatives: [],
    };
  }

  private handleBaseDisruption(event: OpsEvent, context: RetaskContext): Recommendation {
    const baseId = (event.payload.baseId as string) || '';
    const reason = (event.payload.reason as string) || 'Runway surface degraded / crosswind emergency';
    const disruptedBase = context.bases[baseId];

    // Find all missions launching from or recovering to this base
    const impactedMissions = Object.values(context.missions).filter(
      (m) => m.launchBaseId === baseId && m.status !== 'completed' && m.status !== 'cancelled',
    );

    // Find alternate open base
    const candidateBases = Object.values(context.bases).filter(
      (b) => b.id !== baseId && b.runwayStatus === 'open',
    );
    candidateBases.sort((a, b) => b.fuelStockPct - a.fuelStockPct);
    const alternateBase = candidateBases[0];

    const changes: Change[] = impactedMissions.map((m) => ({
      missionId: m.id,
      kind: 'reroute',
      before: baseId,
      after: alternateBase ? alternateBase.id : 'DIVERT_HOLDING',
      note: `Divert launch/recovery for ${m.name} to ${alternateBase ? alternateBase.name : 'Alternate FOB'}.`,
      type: 'CHANGE_BASE',
      entityId: m.id,
      fromValue: baseId,
      toValue: alternateBase ? alternateBase.id : 'REMAINS_DIVERT',
      description: `Divert launch/recovery for ${m.name} to ${alternateBase ? alternateBase.name : 'Alternate FOB'}.`,
    }));

    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: alternateBase
        ? `Reroute ${impactedMissions.length} sorties from ${disruptedBase?.name || baseId} to ${alternateBase.name} (${reason}).`
        : `Halt flight operations at ${disruptedBase?.name || baseId}; hold airborne assets in holding orbit.`,
      score: alternateBase ? 88 : 45,
      changes,
      impactedMissionIds: impactedMissions.map((m) => m.id),
      tradeoffs: [
        { label: 'Divert Flight Distance', delta: 48, unit: 'km', direction: 'bad' },
        { label: 'Alternate Base Runway Utilisation', delta: 22, unit: '%', direction: 'bad' },
        { label: 'Threat Exposure Avoided', delta: -75, unit: '%', direction: 'good' },
      ],
      explanation: [
        `Base ${disruptedBase?.name || baseId} closed: ${reason}.`,
        alternateBase
          ? `Alternate recovery base ${alternateBase.name} selected with open runway and ${alternateBase.fuelStockPct}% fuel stock.`
          : 'No alternate airbase with open runway status is currently available within fuel range.',
        `Reroutes ${impactedMissions.length} active/planned mission sorties.`,
      ],
      constraintsSatisfied: [
        'Runway length & arresting gear compatible with diverted airframes',
        'Alternate base fuel reserves exceed minimum diversion threshold',
      ],
      constraintsRelaxed: [
        'Preferred home-station recovery relaxed in favor of emergency divert',
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.89,
      dataFreshnessSec: 3,
      alternatives: [],
    };
  }

  private handleThreatDetected(event: OpsEvent, context: RetaskContext): Recommendation {
    const threatType = (event.payload.threatType as string) || (event.payload.type as string) || 'SAM';
    const threatPos = (event.payload.position as LatLng) || { lat: 5.5, lng: 7.0 };
    const rangeKm = (event.payload.rangeKm as number) || 45;

    // Find missions whose route points intersect threat range
    const impactedMissions = Object.values(context.missions).filter((m) => {
      return m.route.some((pt) => getApproxDistanceKm(pt, threatPos) <= rangeKm + 15);
    });

    const missionNames = impactedMissions.map((m) => m.name).join(', ');

    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: impactedMissions.length > 0
        ? `Threat ${threatType} detected: Modulate waypoint egress for ${missionNames} (+35 km Route C).`
        : `Threat ${threatType} detected: Establish CAP defensive screening orbit at Sector North buffer.`,
      score: 91,
      changes: impactedMissions.map((m) => ({
        missionId: m.id,
        kind: 'reroute',
        before: m.routeOptions?.[0]?.name || 'Route A',
        after: m.routeOptions?.[2]?.name || 'Route C',
        note: `Bypass detected ${threatType} weapon engagement zone by 15 km safety buffer.`,
        type: 'MODIFY_ROUTE',
        entityId: m.id,
        fromValue: 'Route A',
        toValue: 'Route C',
        description: `Bypass detected ${threatType} weapon engagement zone by 15 km safety buffer.`,
      })),
      impactedMissionIds: impactedMissions.map((m) => m.id),
      tradeoffs: [
        { label: 'Flight Path Dogleg Extension', delta: 35, unit: 'km', direction: 'bad' },
        { label: 'Time-on-Station Reduction', delta: -12, unit: 'min', direction: 'bad' },
        { label: 'Threat Exposure Risk', delta: -85, unit: '%', direction: 'good' },
      ],
      explanation: [
        `New threat contact (${threatType}) confirmed at ${threatPos.lat.toFixed(2)}°N ${threatPos.lng.toFixed(2)}°E with ${rangeKm} km engagement envelope.`,
        impactedMissions.length > 0
          ? `Flight path of ${missionNames} incurs direct engagement risk.`
          : 'Buffer corridor incurs potential risk of hostile fighter penetration.',
        'Southern dogleg routing neutralizes surface-to-air threat envelope while retaining mission objective.',
      ],
      constraintsSatisfied: [
        'Survivability threshold > 95% satisfied',
        'Fuel reserve accommodates path extension with safe landing margin',
      ],
      constraintsRelaxed: [
        'Target time on station relaxed by 12 minutes',
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.94,
      dataFreshnessSec: 2,
      alternatives: [],
    };
  }

  private handleCrewUnavailable(event: OpsEvent, context: RetaskContext): Recommendation {
    const crewId = (event.payload.crewId as string) || '';
    const reason = (event.payload.reason as string) || 'Fatigue limit exceeded / medical hold';
    const originalCrew = context.crew[crewId];

    const impactedMission = Object.values(context.missions).find((m) =>
      m.assigned.crewIds.includes(crewId),
    );

    const availableCrew = Object.values(context.crew).filter(
      (c) =>
        c.id !== crewId &&
        c.status === 'available' &&
        c.fatigueIndex < 40 &&
        (!impactedMission || c.baseId === impactedMission.launchBaseId),
    );

    availableCrew.sort((a, b) => a.fatigueIndex - b.fatigueIndex);
    const substituteCrew = availableCrew[0];

    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: substituteCrew && impactedMission
        ? `Assign ${substituteCrew.callsign} (${substituteCrew.role}) to replace ${originalCrew?.callsign || 'crew'} on ${impactedMission.name}.`
        : `Crew stand-down logged for ${originalCrew?.callsign || crewId} (${reason}).`,
      score: substituteCrew ? 96 : 60,
      changes: substituteCrew && impactedMission
        ? [
            {
              missionId: impactedMission.id,
              kind: 'crew_swap',
              before: crewId,
              after: substituteCrew.id,
              note: `Replace pilot ${originalCrew?.callsign || crewId} with ${substituteCrew.callsign}.`,
              type: 'REASSIGN_CREW',
              entityId: impactedMission.id,
              fromValue: crewId,
              toValue: substituteCrew.id,
              description: `Replace pilot ${originalCrew?.callsign || crewId} with ${substituteCrew.callsign}.`,
            },
          ]
        : [],
      impactedMissionIds: impactedMission ? [impactedMission.id] : [],
      tradeoffs: [
        {
          label: 'Aircrew Fatigue Score Delta',
          delta: substituteCrew ? substituteCrew.fatigueIndex - (originalCrew?.fatigueIndex || 50) : 0,
          unit: 'pts',
          direction: 'good',
        },
        { label: 'Pilot Briefing Lead Time', delta: 15, unit: 'min', direction: 'bad' },
      ],
      explanation: [
        `Aircrew member ${originalCrew?.callsign || crewId} is unavailable (${reason}).`,
        substituteCrew
          ? `Qualified replacement ${substituteCrew.callsign} selected with low fatigue score (${substituteCrew.fatigueIndex}/100).`
          : 'No qualified crew currently resting and ready at origin airbase.',
        'Zero impact on sortie payload or flight profile.',
      ],
      constraintsSatisfied: [
        'Mandatory aircrew rest guidelines satisfied',
        'Aircraft type rating qualifications validated',
      ],
      constraintsRelaxed: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.96,
      dataFreshnessSec: 2,
      alternatives: [],
    };
  }

  private handleNewPriorityMission(event: OpsEvent, context: RetaskContext): Recommendation {
    const missionName = (event.payload.name as string) || 'Emergency Combat Search & Rescue';
    const priority = (event.payload.priority as number) || 1;

    // For a P1/P2 mission, identify ready alert or low-priority mission airframe to task
    const readyFighters = Object.values(context.aircraft).filter(
      (a) => a.status === 'serviceable' && !a.assignedMissionId,
    );

    const targetAircraft = readyFighters[0];

    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: targetAircraft
        ? `Scramble ready airframe ${targetAircraft.tailNumber} (${targetAircraft.type}) for incoming P${priority} sortie "${missionName}".`
        : `Immediate scramble required for P${priority} "${missionName}"; retask asset from Routine P4 patrol.`,
      score: targetAircraft ? 98 : 84,
      changes: targetAircraft
        ? [
            {
              missionId: 'M-01',
              kind: 'new_assignment',
              before: 'UNASSIGNED',
              after: targetAircraft.id,
              note: `Assign ready alert ${targetAircraft.tailNumber} to new P${priority} mission.`,
              type: 'REPLACE_AIRCRAFT',
              entityId: 'NEW_MSN',
              fromValue: 'UNASSIGNED',
              toValue: targetAircraft.id,
              description: `Assign ready alert ${targetAircraft.tailNumber} to new P${priority} mission.`,
            },
          ]
        : [],
      impactedMissionIds: [],
      tradeoffs: [
        { label: 'Alert Posture Depletion', delta: -1, unit: 'airframe', direction: 'bad' },
        { label: 'Launch Response Time', delta: 12, unit: 'min', direction: 'good' },
      ],
      explanation: [
        `High-priority operational requirement logged: P${priority} ${missionName}.`,
        targetAircraft
          ? `Ready alert airframe ${targetAircraft.tailNumber} (${targetAircraft.type}) available with ${targetAircraft.fuelPct}% fuel.`
          : 'All ready airframes currently tasked; preemption of routine training/patrol required.',
        'Optimal sortie launch sequence calculated within 12 minutes.',
      ],
      constraintsSatisfied: [
        'Mission urgency threshold satisfied',
        'Direct commander dispatch authorization pending',
      ],
      constraintsRelaxed: [
        'Ready standby airframe reserve drawn down',
      ],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.98,
      dataFreshnessSec: 1,
      alternatives: [],
    };
  }

  private handleGenericEvent(event: OpsEvent, _context: RetaskContext): Recommendation {
    return {
      id: this.generateRecId(),
      triggerEventId: event.id,
      summary: `Operational event logged (${event.type}); telemetry synchronized.`,
      score: 90,
      changes: [],
      impactedMissionIds: [],
      tradeoffs: [],
      explanation: [
        `Event ${event.type} processed by decision-support framework.`,
        'All baseline constraints evaluated against active flight corridors.',
      ],
      constraintsSatisfied: ['Core flight corridor safety limits intact'],
      constraintsRelaxed: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
      stateVersion: 1,
      confidence: 0.90,
      dataFreshnessSec: 1,
      alternatives: [],
    };
  }

  private attachAlternatives(rec: Recommendation, event: OpsEvent, _context: RetaskContext): Recommendation {
    const alt1Id = `${rec.id}-ALT1`;
    const alt2Id = `${rec.id}-ALT2`;

    if (event.type === 'THREAT_DETECTED') {
      rec.alternatives = [
        {
          id: alt1Id,
          triggerEventId: event.id,
          summary: 'Option B: Hold at Egress Orbit until SEAD suppression package clears corridor.',
          score: Math.max(50, rec.score - 14),
          changes: rec.changes.map((c) => ({
            ...c,
            after: 'Hold Orbit Bravo',
            note: 'Orbit holding pattern 40 km north of threat envelope',
          })),
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Time-on-Station Reduction', delta: -25, unit: 'min', direction: 'bad' },
            { label: 'Fuel Margin Drawdown', delta: -18, unit: '%', direction: 'bad' },
            { label: 'Threat Exposure Risk', delta: -70, unit: '%', direction: 'good' },
          ],
          explanation: [
            'Holding orbit keeps strike package out of SAM engagement envelope.',
            'Consumes 18% additional loiter fuel while awaiting suppression assets.',
          ],
          constraintsSatisfied: ['Threat engagement buffer maintained'],
          constraintsRelaxed: ['Time on station relaxed by 25 min'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.82,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
        {
          id: alt2Id,
          triggerEventId: event.id,
          summary: 'Option C: Low-level terrain masking ingress via northern ridge contour.',
          score: Math.max(50, rec.score - 21),
          changes: rec.changes.map((c) => ({
            ...c,
            after: 'Route D (Low Altitude)',
            note: 'Ingress at 500 ft AGL under radar horizon',
          })),
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Fuel Consumption Rate', delta: 28, unit: '%', direction: 'bad' },
            { label: 'Terrain Collision Risk', delta: 15, unit: '%', direction: 'bad' },
            { label: 'Threat Exposure Risk', delta: -60, unit: '%', direction: 'good' },
          ],
          explanation: [
            'Low-level terrain masking undercuts SAM tracking radar line-of-sight.',
            'Significantly elevates fuel burn rate due to dense low-altitude air.',
          ],
          constraintsSatisfied: ['Direct line of flight partially preserved'],
          constraintsRelaxed: ['Minimum altitude corridor safety floors relaxed to 500 ft'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.74,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
      ];
    } else if (event.type === 'AIRCRAFT_UNSERVICEABLE') {
      rec.alternatives = [
        {
          id: alt1Id,
          triggerEventId: event.id,
          summary: 'Option B: Delay mission start window by 90 minutes for expedited repairs.',
          score: Math.max(45, rec.score - 16),
          changes: rec.changes.map((c) => ({
            ...c,
            kind: 'delay',
            after: 'T+90m Departure',
            note: 'Emergency maintenance crew dispatched for on-ramp component swap',
          })),
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Sortie Departure Delay', delta: 90, unit: 'min', direction: 'bad' },
            { label: 'Airframe Fleet Margin', delta: 0, unit: 'airframe', direction: 'neutral' },
            { label: 'Fuel Consumption', delta: 0, unit: 'kg', direction: 'neutral' },
          ],
          explanation: [
            'Retains original airframe and weapons loadout.',
            'Forces 90-minute delay, risking target visibility window closure.',
          ],
          constraintsSatisfied: ['Original payload and airframe retained'],
          constraintsRelaxed: ['ATO flight window tolerance exceeded by 30 min'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.79,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
        {
          id: alt2Id,
          triggerEventId: event.id,
          summary: 'Option C: Divert secondary Fighter-A CAP airframe to fulfill strike escort.',
          score: Math.max(40, rec.score - 24),
          changes: rec.changes.map((c) => ({
            ...c,
            after: 'AC-01 (Fighter-A)',
            note: 'Repurpose alert fighter hull with secondary air-to-ground load',
          })),
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Sortie Departure Delay', delta: 10, unit: 'min', direction: 'bad' },
            { label: 'CAP Sector Defense Margin', delta: -50, unit: '%', direction: 'bad' },
            { label: 'Target Effect On Target', delta: -40, unit: '%', direction: 'bad' },
          ],
          explanation: [
            'Preempts defensive fighter from Sector North to support target strike.',
            'Draws down defensive CAP coverage, increasing vulnerability to adversary incursions.',
          ],
          constraintsSatisfied: ['Immediate launch posture achieved within 10 min'],
          constraintsRelaxed: ['Sector North defensive CAP posture compromised'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.71,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
      ];
    } else {
      rec.alternatives = [
        {
          id: alt1Id,
          triggerEventId: event.id,
          summary: 'Option B: Stand down sortie package and preserve theatre reserve margin.',
          score: Math.max(40, rec.score - 18),
          changes: rec.changes.map((c) => ({
            ...c,
            kind: 'cancel',
            after: 'STAND_DOWN',
            note: 'Abort tasking order to prevent secondary resource cascade',
          })),
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Mission Objective Completion', delta: -100, unit: '%', direction: 'bad' },
            { label: 'Resource Preservation', delta: 100, unit: '%', direction: 'good' },
          ],
          explanation: [
            'Eliminates all operational risk by standing down the sortie package.',
            'Fails to achieve tactical objectives assigned in current master ATO.',
          ],
          constraintsSatisfied: ['Zero wear or fuel expenditure'],
          constraintsRelaxed: ['ATO operational mandate unsatisfied'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.88,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
        {
          id: alt2Id,
          triggerEventId: event.id,
          summary: 'Option C: Execute partial mission profile with minimum available assets.',
          score: Math.max(40, rec.score - 12),
          changes: rec.changes,
          impactedMissionIds: rec.impactedMissionIds,
          tradeoffs: [
            { label: 'Mission Coverage', delta: -35, unit: '%', direction: 'bad' },
            { label: 'Readiness Margin Conserved', delta: 1, unit: 'airframe', direction: 'good' },
          ],
          explanation: [
            'Dispatches lead airframe while holding secondary asset in reserve.',
            'Reduces strike effectiveness on primary target infrastructure.',
          ],
          constraintsSatisfied: ['Partial objective fulfillment'],
          constraintsRelaxed: ['Two-ship mutual defense tactics waived to single-ship profile'],
          status: 'pending',
          createdAt: rec.createdAt,
          stateVersion: rec.stateVersion,
          confidence: 0.78,
          dataFreshnessSec: rec.dataFreshnessSec,
        },
      ];
    }

    return rec;
  }
}

export const mockRetaskEngine = new MockRetaskEngine();
