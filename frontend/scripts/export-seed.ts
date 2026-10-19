#!/usr/bin/env node
import { exportSeedToFile } from '../src/lib/exportSeed';
import { validateWireSnapshot } from '../src/lib/contractValidation';

function run() {
  console.log('===============================================================');
  console.log(' AirOps DSS — Canonical Seed World Generator (API_CONTRACT.md)');
  console.log('===============================================================\n');

  try {
    const { filePath, byteLength, data } = exportSeedToFile();

    console.log(`[SEED-EXPORT] Generated clean mock baseline:`);
    console.log(`  File:           ${filePath}`);
    console.log(`  Size:           ${byteLength} bytes`);
    console.log(`  StateVersion:   ${data.stateVersion}`);
    console.log(`  Sim Clock:      ${data.sim.time} (speed: ${data.sim.speed}, paused: ${data.sim.paused})`);
    console.log(`  Bounds:         lat [${data.bounds.minLat}, ${data.bounds.maxLat}], lng [${data.bounds.minLng}, ${data.bounds.maxLng}]`);
    console.log(`  Bases:          ${data.bases.length} bases`);
    console.log(`  Aircraft:       ${data.aircraft.length} airframes`);
    console.log(`  Crew:           ${data.crew.length} rostered aircrew`);
    console.log(`  Missions:       ${data.missions.length} sorties (all with routeOptions)`);
    console.log(`  Airspace:       ${data.airspace.length} tactical sectors`);
    console.log(`  Threats:        ${data.threats.length} contact tracks`);
    console.log(`  Weather:        ${data.weather.length} aerodrome observations`);
    console.log(`  Weapon Stocks:  ${data.weaponStocks.length} inventory records`);
    console.log(`  Predictions:    ${data.predictions.length} risk forecast points`);
    console.log(`  Recommendations:${data.recommendations.length} (clean baseline)\n`);

    // Validate wire snapshot against API_CONTRACT.md
    const validation = validateWireSnapshot(data);
    if (!validation.valid) {
      console.error('[SEED-EXPORT] VALIDATION FAILED:');
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }

    console.log('[SEED-EXPORT] SUCCESS: Output strictly validated against API_CONTRACT.md specifications.');
    process.exit(0);
  } catch (err) {
    console.error('[SEED-EXPORT] ERROR:', err);
    process.exit(1);
  }
}

run();
