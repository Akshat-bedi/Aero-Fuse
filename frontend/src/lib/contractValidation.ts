export interface ValidationReport {
  valid: boolean;
  errors: string[];
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isIsoDate(str: unknown): boolean {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * Validates Air Base against API_CONTRACT.md section 6.1
 */
export function validateBase(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Base must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('BASE-')) {
    errors.push(`Invalid id: expected prefix BASE-, got ${val.id}`);
  }
  if (typeof val.name !== 'string' || val.name.length === 0) {
    errors.push('name is required');
  }
  if (!isObject(val.location) || typeof val.location.lat !== 'number' || typeof val.location.lng !== 'number') {
    errors.push('location must have lat and lng numbers');
  }
  if (!['open', 'degraded', 'closed'].includes(val.runwayStatus as string)) {
    errors.push(`Invalid runwayStatus: ${val.runwayStatus}`);
  }
  if (typeof val.fuelStockPct !== 'number' || val.fuelStockPct < 0 || val.fuelStockPct > 100) {
    errors.push(`Invalid fuelStockPct: ${val.fuelStockPct}`);
  }
  if (typeof val.shelterCapacity !== 'number' || val.shelterCapacity < 0) {
    errors.push(`Invalid shelterCapacity: ${val.shelterCapacity}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Aircraft against API_CONTRACT.md section 6.2
 */
export function validateAircraft(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Aircraft must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('AC-')) {
    errors.push(`Invalid id: expected prefix AC-, got ${val.id}`);
  }
  if (typeof val.tailNumber !== 'string') errors.push('tailNumber is required');
  if (typeof val.callsign !== 'string') errors.push('callsign is required');
  if (typeof val.type !== 'string') errors.push('type is required');
  if (typeof val.baseId !== 'string') errors.push('baseId is required');
  if (!['serviceable', 'maintenance', 'unserviceable', 'airborne', 'turnaround'].includes(val.status as string)) {
    errors.push(`Invalid aircraft status: ${val.status}`);
  }
  if (typeof val.fuelPct !== 'number' || val.fuelPct < 0 || val.fuelPct > 100) {
    errors.push(`fuelPct must be number between 0 and 100, got ${val.fuelPct}`);
  }
  if (!Array.isArray(val.weaponLoad)) {
    errors.push('weaponLoad must be an array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Aircrew against API_CONTRACT.md section 6.4
 */
export function validateCrew(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Crew must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('CR-')) {
    errors.push(`Invalid id: expected prefix CR-, got ${val.id}`);
  }
  if (typeof val.callsign !== 'string') errors.push('callsign is required');
  if (typeof val.role !== 'string') errors.push('role is required');
  if (!Array.isArray(val.qualifications)) errors.push('qualifications must be array');
  if (!['available', 'resting', 'on-mission', 'unavailable'].includes(val.status as string)) {
    errors.push(`Invalid crew status: ${val.status}`);
  }
  const dutyHours = val.dutyHoursLast24h ?? val.dutyHours24h;
  if (typeof dutyHours !== 'number') errors.push('dutyHoursLast24h must be a number');
  if (val.restHoursRemaining !== undefined && typeof val.restHoursRemaining !== 'number') {
    errors.push('restHoursRemaining must be a number');
  }
  const fatigue = val.fatigueIndex ?? val.fatigueScore;
  if (typeof fatigue !== 'number' || fatigue < 0 || fatigue > 100) {
    errors.push(`fatigueIndex must be 0-100, got ${fatigue}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Mission against API_CONTRACT.md section 6.6
 */
export function validateMission(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Mission must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('M-')) {
    errors.push(`Invalid id: expected prefix M-, got ${val.id}`);
  }
  if (typeof val.name !== 'string') errors.push('name is required');
  if (!['CAP', 'strike', 'recon', 'airlift', 'SAR', 'escort'].includes(val.type as string)) {
    errors.push(`Invalid mission type: ${val.type}`);
  }
  if (![1, 2, 3, 4].includes(val.priority as number)) {
    errors.push(`Invalid priority: ${val.priority}`);
  }
  if (!['planned', 'approved', 'in-progress', 'completed', 'at-risk', 'cancelled'].includes(val.status as string)) {
    errors.push(`Invalid mission status: ${val.status}`);
  }
  const assigned = val.assigned as Record<string, unknown> | undefined;
  const assignedAircraft = assigned?.aircraftIds ?? val.assignedAircraftIds;
  if (!Array.isArray(assignedAircraft)) errors.push('assigned.aircraftIds must be an array');
  const assignedCrew = assigned?.crewIds ?? val.assignedCrewIds;
  if (!Array.isArray(assignedCrew)) errors.push('assigned.crewIds must be an array');

  const startTime = val.windowStart ?? val.plannedStart;
  if (!isIsoDate(startTime)) errors.push(`windowStart must be valid ISO timestamp: ${startTime}`);
  const endTime = val.windowEnd ?? val.plannedEnd;
  if (!isIsoDate(endTime)) errors.push(`windowEnd must be valid ISO timestamp: ${endTime}`);
  if (typeof val.launchBaseId !== 'string') errors.push('launchBaseId is required');

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Airspace sector against API_CONTRACT.md section 6.7
 */
export function validateAirspace(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Airspace must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('AS-')) {
    errors.push(`Invalid id: expected prefix AS-, got ${val.id}`);
  }
  if (typeof val.name !== 'string') errors.push('name is required');
  if (!['restricted', 'corridor', 'no-fly', 'danger'].includes(val.type as string)) {
    errors.push(`Invalid airspace type: ${val.type}`);
  }
  if (typeof val.floorFt !== 'number' || typeof val.ceilingFt !== 'number') {
    errors.push('floorFt and ceilingFt must be numbers');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Threat contact against API_CONTRACT.md section 6.8
 */
export function validateThreat(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Threat must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('THR-')) {
    errors.push(`Invalid id: expected prefix THR-, got ${val.id}`);
  }
  if (!['SAM', 'fighter', 'radar', 'AAA'].includes(val.type as string)) {
    errors.push(`Invalid threat type: ${val.type}`);
  }
  if (!['active', 'suspected', 'neutralised'].includes(val.status as string)) {
    errors.push(`Invalid threat status: ${val.status}`);
  }
  if (!isObject(val.position) || typeof val.position.lat !== 'number' || typeof val.position.lng !== 'number') {
    errors.push('Threat position must contain lat and lng');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates Recommendation against API_CONTRACT.md section 6.10
 */
export function validateRecommendation(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Recommendation must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('REC-')) {
    errors.push(`Invalid id: expected prefix REC-, got ${val.id}`);
  }
  const recDate = val.createdAt ?? val.timestamp;
  if (!isIsoDate(recDate)) errors.push(`createdAt must be ISO date: ${recDate}`);
  if (!['pending', 'approved', 'rejected', 'modified', 'stale', 'expired'].includes(val.status as string)) {
    errors.push(`Invalid status: ${val.status}`);
  }
  if (!Array.isArray(val.changes)) errors.push('changes must be an array');
  if (!Array.isArray(val.tradeoffs)) errors.push('tradeoffs must be an array');
  if (typeof val.confidence !== 'number' || val.confidence < 0 || val.confidence > 1) {
    errors.push(`confidence must be decimal between 0 and 1, got ${val.confidence}`);
  }
  if (typeof val.stateVersion !== 'number') errors.push('stateVersion must be an integer');

  return { valid: errors.length === 0, errors };
}

/**
 * Validates ScenarioResult against API_CONTRACT.md section 6.14
 */
export function validateScenarioResult(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['ScenarioResult must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('SCEN-')) {
    errors.push(`Invalid id: expected prefix SCEN-, got ${val.id}`);
  }
  if (!isObject(val.baselineKpis)) errors.push('baselineKpis object is required');
  if (!isObject(val.scenarioKpis)) errors.push('scenarioKpis object is required');
  if (!isObject(val.series) || !Array.isArray(val.series.time)) {
    errors.push('series with time array is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates AuditEntry against API_CONTRACT.md section 6.11
 */
export function validateAuditEntry(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['AuditEntry must be an object'] };
  }

  if (typeof val.id !== 'string' || !val.id.startsWith('AUD-')) {
    errors.push(`Invalid id: expected prefix AUD-, got ${val.id}`);
  }
  if (!isIsoDate(val.timestamp)) errors.push(`timestamp must be ISO date: ${val.timestamp}`);
  if (typeof val.operator !== 'string') errors.push('operator is required');
  if (typeof val.action !== 'string') errors.push('action is required');
  if (val.stateVersion !== undefined && typeof val.stateVersion !== 'number') {
    errors.push('stateVersion must be number');
  }
  if (typeof val.hash !== 'string') errors.push('hash is required');
  const prevHash = val.prevHash ?? val.previousHash;
  if (typeof prevHash !== 'string') errors.push('prevHash is required');

  return { valid: errors.length === 0, errors };
}

/**
 * Validates OperationalAlert against Stage 9 contract
 */
export function validateOperationalAlert(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['OperationalAlert must be an object'] };
  }

  if (typeof val.id !== 'string') errors.push('id is required');
  if (typeof val.title !== 'string') errors.push('title is required');
  if (!['critical', 'warning', 'info'].includes(val.severity as string)) {
    errors.push(`Invalid severity: ${val.severity}`);
  }
  if (
    !['threat', 'readiness', 'weather', 'crew', 'conflict', 'prediction', 'data-quality'].includes(
      val.type as string,
    )
  ) {
    errors.push(`Invalid type: ${val.type}`);
  }
  if (!isIsoDate(val.timestamp) && typeof val.timestamp !== 'string') {
    errors.push('timestamp is required');
  }
  if (typeof val.acknowledged !== 'boolean') errors.push('acknowledged must be boolean');

  return { valid: errors.length === 0, errors };
}

/**
/**
 * Validates complete OperationalSnapshot or WireSnapshot
 */
export function validateSnapshot(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['Snapshot must be an object'] };
  }

  if (typeof val.stateVersion !== 'number') errors.push('stateVersion must be a number');

  // Validate bases (accepts Record or Array)
  if (Array.isArray(val.bases)) {
    val.bases.forEach((b, idx) => {
      const res = validateBase(b);
      const entityId = isObject(b) && typeof b.id === 'string' ? b.id : `index ${idx}`;
      if (!res.valid) errors.push(`Base ${entityId}: ${res.errors.join(', ')}`);
    });
  } else if (isObject(val.bases)) {
    Object.entries(val.bases).forEach(([key, b]) => {
      const res = validateBase(b);
      const entityId = isObject(b) && typeof b.id === 'string' ? b.id : key;
      if (!res.valid) errors.push(`Base ${entityId}: ${res.errors.join(', ')}`);
    });
  } else {
    errors.push('bases dictionary or array is required');
  }

  // Validate aircraft (accepts Record or Array)
  if (Array.isArray(val.aircraft)) {
    val.aircraft.forEach((a, idx) => {
      const res = validateAircraft(a);
      const entityId = isObject(a) && typeof a.id === 'string' ? a.id : `index ${idx}`;
      if (!res.valid) errors.push(`Aircraft ${entityId}: ${res.errors.join(', ')}`);
    });
  } else if (isObject(val.aircraft)) {
    Object.entries(val.aircraft).forEach(([key, a]) => {
      const res = validateAircraft(a);
      const entityId = isObject(a) && typeof a.id === 'string' ? a.id : key;
      if (!res.valid) errors.push(`Aircraft ${entityId}: ${res.errors.join(', ')}`);
    });
  } else {
    errors.push('aircraft dictionary or array is required');
  }

  // Validate crew (accepts Record or Array)
  if (Array.isArray(val.crew)) {
    val.crew.forEach((c, idx) => {
      const res = validateCrew(c);
      const entityId = isObject(c) && typeof c.id === 'string' ? c.id : `index ${idx}`;
      if (!res.valid) errors.push(`Crew ${entityId}: ${res.errors.join(', ')}`);
    });
  } else if (isObject(val.crew)) {
    Object.entries(val.crew).forEach(([key, c]) => {
      const res = validateCrew(c);
      const entityId = isObject(c) && typeof c.id === 'string' ? c.id : key;
      if (!res.valid) errors.push(`Crew ${entityId}: ${res.errors.join(', ')}`);
    });
  } else {
    errors.push('crew dictionary or array is required');
  }

  // Validate missions (accepts Record or Array)
  if (Array.isArray(val.missions)) {
    val.missions.forEach((m, idx) => {
      const res = validateMission(m);
      const entityId = isObject(m) && typeof m.id === 'string' ? m.id : `index ${idx}`;
      if (!res.valid) errors.push(`Mission ${entityId}: ${res.errors.join(', ')}`);
    });
  } else if (isObject(val.missions)) {
    Object.entries(val.missions).forEach(([key, m]) => {
      const res = validateMission(m);
      const entityId = isObject(m) && typeof m.id === 'string' ? m.id : key;
      if (!res.valid) errors.push(`Mission ${entityId}: ${res.errors.join(', ')}`);
    });
  } else {
    errors.push('missions dictionary or array is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates complete WireSnapshot against API_CONTRACT.md section 6.13
 */
export function validateWireSnapshot(val: unknown): ValidationReport {
  const errors: string[] = [];
  if (!isObject(val)) {
    return { valid: false, errors: ['WireSnapshot must be an object'] };
  }

  if (typeof val.stateVersion !== 'number') {
    errors.push('stateVersion must be a number');
  }

  if (!isObject(val.sim)) {
    errors.push('sim object is required');
  } else {
    if (!isIsoDate(val.sim.time)) errors.push(`sim.time must be valid ISO timestamp: ${val.sim.time}`);
    if (typeof val.sim.speed !== 'number') errors.push('sim.speed must be a number');
    if (typeof val.sim.paused !== 'boolean') errors.push('sim.paused must be a boolean');
  }

  if (val.bounds !== undefined) {
    if (!isObject(val.bounds)) {
      errors.push('bounds must be an object');
    } else {
      if (
        typeof val.bounds.minLat !== 'number' ||
        typeof val.bounds.maxLat !== 'number' ||
        typeof val.bounds.minLng !== 'number' ||
        typeof val.bounds.maxLng !== 'number'
      ) {
        errors.push('bounds must contain minLat, maxLat, minLng, maxLng numbers');
      }
    }
  }

  if (!Array.isArray(val.bases)) {
    errors.push('bases array is required');
  } else {
    val.bases.forEach((b, idx) => {
      const res = validateBase(b);
      const entityId = isObject(b) && typeof b.id === 'string' ? b.id : `index ${idx}`;
      if (!res.valid) errors.push(`Base ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.aircraft)) {
    errors.push('aircraft array is required');
  } else {
    val.aircraft.forEach((a, idx) => {
      const res = validateAircraft(a);
      const entityId = isObject(a) && typeof a.id === 'string' ? a.id : `index ${idx}`;
      if (!res.valid) errors.push(`Aircraft ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.crew)) {
    errors.push('crew array is required');
  } else {
    val.crew.forEach((c, idx) => {
      const res = validateCrew(c);
      const entityId = isObject(c) && typeof c.id === 'string' ? c.id : `index ${idx}`;
      if (!res.valid) errors.push(`Crew ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.missions)) {
    errors.push('missions array is required');
  } else {
    val.missions.forEach((m, idx) => {
      const res = validateMission(m);
      const entityId = isObject(m) && typeof m.id === 'string' ? m.id : `index ${idx}`;
      if (!res.valid) errors.push(`Mission ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.airspace)) {
    errors.push('airspace array is required');
  } else {
    val.airspace.forEach((as, idx) => {
      const res = validateAirspace(as);
      const entityId = isObject(as) && typeof as.id === 'string' ? as.id : `index ${idx}`;
      if (!res.valid) errors.push(`Airspace ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.threats)) {
    errors.push('threats array is required');
  } else {
    val.threats.forEach((t, idx) => {
      const res = validateThreat(t);
      const entityId = isObject(t) && typeof t.id === 'string' ? t.id : `index ${idx}`;
      if (!res.valid) errors.push(`Threat ${entityId}: ${res.errors.join(', ')}`);
    });
  }

  if (!Array.isArray(val.weaponStocks)) {
    errors.push('weaponStocks array is required');
  }

  if (!Array.isArray(val.weather)) {
    errors.push('weather array is required');
  }

  if (!Array.isArray(val.predictions)) {
    errors.push('predictions array is required');
  }

  if (!Array.isArray(val.recommendations)) {
    errors.push('recommendations array is required');
  }

  return { valid: errors.length === 0, errors };
}
