import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8000;

// Fictional initial state snapshot strictly adhering to docs/API_CONTRACT.md
const mockWireSnapshot = {
  stateVersion: 1,
  sim: {
    time: new Date().toISOString(),
    speed: 1,
    paused: false,
  },
  bases: [
    {
      id: 'BASE-A',
      name: 'Vanguard Alpha Airbase',
      code: 'BASE-A',
      location: { lat: 8.5, lng: 3.5 },
      runwayStatus: 'open',
      fuelStockPct: 92,
      shelterCapacity: 16,
      weather: {
        baseId: 'BASE-A',
        visibilityKm: 18,
        cloudBaseFt: 4500,
        windKts: 12,
        severity: 'nominal',
      },
    },
    {
      id: 'BASE-B',
      name: 'North Bastion Strike Base',
      code: 'BASE-B',
      location: { lat: 5.2, lng: 6.8 },
      runwayStatus: 'open',
      fuelStockPct: 65,
      shelterCapacity: 24,
      weather: {
        baseId: 'BASE-B',
        visibilityKm: 12,
        cloudBaseFt: 2800,
        windKts: 16,
        severity: 'nominal',
      },
    },
    {
      id: 'BASE-C',
      name: 'Central Depot Logistics Hub',
      code: 'BASE-C',
      location: { lat: 3.2, lng: 4.8 },
      runwayStatus: 'open',
      fuelStockPct: 98,
      shelterCapacity: 20,
      weather: {
        baseId: 'BASE-C',
        visibilityKm: 25,
        cloudBaseFt: 6000,
        windKts: 8,
        severity: 'nominal',
      },
    },
    {
      id: 'BASE-D',
      name: 'Eastern Forward Operating Base',
      code: 'BASE-D',
      location: { lat: 6.8, lng: 10.2 },
      runwayStatus: 'open',
      fuelStockPct: 80,
      shelterCapacity: 12,
      weather: {
        baseId: 'BASE-D',
        visibilityKm: 15,
        cloudBaseFt: 3500,
        windKts: 14,
        severity: 'nominal',
      },
    },
  ],
  aircraft: [
    {
      id: 'AC-01',
      tailNumber: 'VR-F01',
      callsign: 'VIPER-01',
      type: 'Fighter-A',
      baseId: 'BASE-A',
      status: 'serviceable',
      fuelPct: 95,
      flightHoursToNextService: 42,
      weaponLoad: [{ weaponType: 'AAM-Short', quantity: 4 }],
      assignedMissionId: 'M-01',
      position: { lat: 8.5, lng: 3.5 },
      heading: 90,
      speed: 0,
    },
    {
      id: 'AC-02',
      tailNumber: 'VR-S02',
      callsign: 'HAMMER-02',
      type: 'Strike-B',
      baseId: 'BASE-B',
      status: 'serviceable',
      fuelPct: 88,
      flightHoursToNextService: 28,
      weaponLoad: [{ weaponType: 'PGM-Mk2', quantity: 4 }],
      assignedMissionId: 'M-02',
      position: { lat: 5.2, lng: 6.8 },
      heading: 180,
      speed: 0,
    },
  ],
  crew: [
    {
      id: 'CR-01',
      callsign: 'RAZOR',
      role: 'Flight Lead',
      qualifications: ['day-vfr', 'night-nvg', 'bvr-combat'],
      baseId: 'BASE-A',
      status: 'available',
      dutyHours24h: 3.5,
      restHoursRemaining: 0,
      fatigueScore: 18,
    },
    {
      id: 'CR-02',
      callsign: 'GHOST',
      role: 'Element Lead',
      qualifications: ['day-vfr', 'precision-strike'],
      baseId: 'BASE-B',
      status: 'available',
      dutyHours24h: 4.0,
      restHoursRemaining: 0,
      fatigueScore: 22,
    },
  ],
  missions: [
    {
      id: 'M-01',
      name: 'Northern Border Combat Air Patrol',
      type: 'CAP',
      priority: 1,
      status: 'planned',
      assignedAircraftIds: ['AC-01'],
      assignedCrewIds: ['CR-01'],
      plannedStart: new Date(Date.now() + 1800000).toISOString(),
      plannedEnd: new Date(Date.now() + 9000000).toISOString(),
      launchBaseId: 'BASE-A',
      recoveryBaseId: 'BASE-A',
      route: {
        points: [
          { lat: 8.5, lng: 3.5 },
          { lat: 9.0, lng: 5.5 },
          { lat: 8.5, lng: 3.5 },
        ],
      },
    },
  ],
  airspace: [
    {
      id: 'AS-01',
      name: 'Corridor Alpha Transit Sector',
      type: 'corridor',
      floorFt: 10000,
      ceilingFt: 35000,
      polygon: [
        { lat: 7.0, lng: 2.0 },
        { lat: 9.0, lng: 2.0 },
        { lat: 9.0, lng: 6.0 },
        { lat: 7.0, lng: 6.0 },
      ],
    },
  ],
  threats: [
    {
      id: 'THR-01',
      type: 'SAM',
      status: 'active',
      position: { lat: 4.8, lng: 7.5 },
      lethalRadiusKm: 85,
    },
  ],
  weather: [],
  weaponStocks: [],
  recommendations: [],
  activeEvents: [],
  predictions: [],
  auditLog: [],
};

// HTTP Server
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        version: '0.1.0',
        simTime: new Date().toISOString(),
        solverReady: true,
      }),
    );
    return;
  }

  if (url.pathname === '/api/snapshot' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockWireSnapshot));
    return;
  }

  if (url.pathname === '/api/audit' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([]));
    return;
  }

  if (url.pathname === '/api/recommendations' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([]));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found in fake backend' }));
});

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[fake-backend] Client connected via /ws');

  let stateVersion = 1;
  let tick = 0;

  // 1. Immediately emit SNAPSHOT envelope
  ws.send(
    JSON.stringify({
      type: 'SNAPSHOT',
      payload: mockWireSnapshot,
      ts: new Date().toISOString(),
      stateVersion,
    }),
  );

  // 2. Stream POSITION_TICK and CLOCK_TICK at 1 Hz
  const tickInterval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    tick++;
    const simTime = new Date().toISOString();

    // Position updates
    const heading = (tick * 15) % 360;
    ws.send(
      JSON.stringify({
        type: 'POSITION_TICK',
        payload: [
          {
            id: 'AC-01',
            position: {
              lat: 8.5 + Math.sin(tick * 0.1) * 0.15,
              lng: 3.5 + Math.cos(tick * 0.1) * 0.15,
            },
            heading,
            speed: 420,
            fuelPct: Math.max(20, 95 - tick * 0.1),
          },
        ],
        ts: simTime,
        stateVersion,
      }),
    );

    // Clock updates
    ws.send(
      JSON.stringify({
        type: 'CLOCK_TICK',
        payload: {
          simTime,
          speed: 1,
          paused: false,
        },
        ts: simTime,
      }),
    );
  }, 1000);

  // 3. Emit HEARTBEAT every 5 seconds
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'HEARTBEAT',
        payload: {},
        ts: new Date().toISOString(),
      }),
    );
  }, 5000);

  // 4. Send one sample ALERT after 3 seconds
  const alertTimeout = setTimeout(() => {
    if (ws.readyState !== ws.OPEN) return;
    stateVersion++;
    ws.send(
      JSON.stringify({
        type: 'ALERT',
        payload: {
          id: 'ALT-9001',
          title: 'Corridor Alpha Threat Sensor Trip',
          message: 'Radar sweep detects active emitter contact near border coordinates.',
          details: 'Corridor Alpha automated sensor station tripping detection thresholds.',
          severity: 'warning',
          type: 'threat',
          timestamp: new Date().toISOString(),
          acknowledged: false,
          location: 'Corridor Alpha (FL240)',
        },
        ts: new Date().toISOString(),
        stateVersion,
      }),
    );
  }, 3000);

  // Handle client PING replies
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'PING') {
        // Heartbeat confirmed
      }
    } catch {
      // Ignored
    }
  });

  ws.on('close', () => {
    console.log('[fake-backend] Client disconnected');
    clearInterval(tickInterval);
    clearInterval(heartbeatInterval);
    clearTimeout(alertTimeout);
  });
});

server.listen(PORT, () => {
  console.log(`[fake-backend] Server listening on http://localhost:${PORT}`);
  console.log(`[fake-backend] WebSocket endpoint active at ws://localhost:${PORT}/ws`);
  console.log('[fake-backend] Endpoints: GET /api/health, GET /api/snapshot, /ws');
});
