import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveDataService } from './liveDataService';
import { TacticalWebSocketClient } from './wsClient';
import { apiClient } from './apiClient';

describe('Stage 9: LiveDataService (WebSocket, Reconnect, Stale Detection & Version Gaps)', () => {
  let mockWsClient: TacticalWebSocketClient;
  let service: LiveDataService;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock apiClient.get for /snapshot
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      stateVersion: 10,
      sim: { time: '2026-03-14T06:30:00Z', speed: 1, paused: false },
      bases: [{ id: 'BASE-A', name: 'Alpha', code: 'BASE-A', location: { lat: 8, lng: 3 }, runwayStatus: 'open', fuelStockPct: 90, shelterCapacity: 10, weather: { baseId: 'BASE-A', visibilityKm: 10, cloudBaseFt: 3000, windKts: 10, severity: 'nominal' } }],
      aircraft: [{ id: 'AC-01', tailNumber: 'VR-01', callsign: 'VIPER', type: 'Fighter-A', baseId: 'BASE-A', status: 'serviceable', fuelPct: 80, flightHoursToNextService: 20, weaponLoad: [] }],
      crew: [],
      missions: [],
      airspace: [],
      threats: [],
      weather: [],
      weaponStocks: [],
      recommendations: [],
      activeEvents: [],
      predictions: [],
      auditLog: [],
    });

    mockWsClient = new TacticalWebSocketClient({ url: 'ws://localhost:8000/ws' });
    vi.spyOn(mockWsClient, 'connect').mockImplementation(() => {});
    vi.spyOn(mockWsClient, 'send').mockImplementation(() => {});

    service = new LiveDataService(mockWsClient);
  });

  afterEach(() => {
    service.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* -------------------------------------------------------------------------
     1. WEBSOCKET MESSAGE HANDLING & HEARTBEAT
     ------------------------------------------------------------------------- */
  it('handles HEARTBEAT message by replying with PING', () => {
    const sendSpy = vi.spyOn(mockWsClient, 'send');

    // Simulate server HEARTBEAT event
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'HEARTBEAT',
      { type: 'HEARTBEAT', payload: {}, ts: new Date().toISOString() },
    );

    expect(sendSpy).toHaveBeenCalledWith({ type: 'PING' });
  });

  it('safely logs and ignores unknown message types without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Send unknown message type
    expect(() => {
      (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
        '*',
        {
          type: 'UNKNOWN_TELEMETRY_CUSTOM_X',
          payload: { foo: 'bar' },
          ts: new Date().toISOString(),
        },
      );
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown WebSocket message type ignored: "UNKNOWN_TELEMETRY_CUSTOM_X"'),
    );
  });

  it('dispatches ALERT messages to alert subscribers', () => {
    const alertCallback = vi.fn();
    service.subscribeAlerts(alertCallback);

    const alertPayload = {
      id: 'ALT-5001',
      title: 'Corridor Dogleg Incursion',
      message: 'Active radar emitter detected.',
      severity: 'warning' as const,
      type: 'threat' as const,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'ALERT',
      {
        type: 'ALERT',
        payload: alertPayload,
        ts: new Date().toISOString(),
        stateVersion: 11,
      },
    );

    expect(alertCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ALT-5001',
        title: 'Corridor Dogleg Incursion',
        severity: 'warning',
        type: 'threat',
      }),
    );
  });

  /* -------------------------------------------------------------------------
     2. STALE DATA DETECTION
     ------------------------------------------------------------------------- */
  it('detects telemetry staleness when no message arrives within threshold', () => {
    const connectionStatusSpy = vi.fn();
    service.subscribeConnectionStatus(connectionStatusSpy);

    // Connected initially
    vi.spyOn(mockWsClient, 'isConnected').mockReturnValue(true);
    service.setConnectionStatus('LIVE');

    // Advance timers by 16 seconds (exceeding default 15s VITE_STALE_AFTER_SEC)
    vi.advanceTimersByTime(16000);

    expect(service.getConnectionStatus()).toBe('STALE');
    expect(connectionStatusSpy).toHaveBeenCalledWith('STALE', expect.any(Number));
  });

  it('recovers from STALE to LIVE when a new message arrives', () => {
    vi.spyOn(mockWsClient, 'isConnected').mockReturnValue(true);
    service.setConnectionStatus('STALE', 20);

    // Trigger incoming message
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      '*',
      {
        type: 'CLOCK_TICK',
        payload: { simTime: new Date().toISOString(), speed: 1, paused: false },
        ts: new Date().toISOString(),
      },
    );

    expect(service.getConnectionStatus()).toBe('LIVE');
  });

  /* -------------------------------------------------------------------------
     3. STATE VERSION GAP HANDLING
     ------------------------------------------------------------------------- */
  it('ignores updates with stateVersion older than current version', async () => {
    // Populate snapshot with version 20
    const snapshotSpy = vi.fn();
    service.subscribe(snapshotSpy);

    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'SNAPSHOT',
      {
        type: 'SNAPSHOT',
        payload: {
          stateVersion: 20,
          bases: [],
          aircraft: [],
          crew: [],
          missions: [],
          airspace: [],
          threats: [],
        },
        ts: new Date().toISOString(),
        stateVersion: 20,
      },
    );

    // Send older update (version 15)
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      '*',
      {
        type: 'ENTITY_UPDATE',
        payload: { bases: [] },
        ts: new Date().toISOString(),
        stateVersion: 15,
      },
    );

    // Verify snapshot stateVersion remains 20
    const snap = await service.getSnapshot();
    expect(snap.stateVersion).toBe(20);
  });

  it('detects stateVersion gap and requests a fresh snapshot', async () => {
    const getSnapshotSpy = vi.spyOn(service, 'getSnapshot');

    // Populate current version = 10
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'SNAPSHOT',
      {
        type: 'SNAPSHOT',
        payload: { stateVersion: 10, bases: [], aircraft: [] },
        ts: new Date().toISOString(),
        stateVersion: 10,
      },
    );

    getSnapshotSpy.mockClear();

    // Send update with stateVersion = 15 (gap: missed 11, 12, 13, 14!)
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      '*',
      {
        type: 'ENTITY_UPDATE',
        payload: { bases: [] },
        ts: new Date().toISOString(),
        stateVersion: 15,
      },
    );

    expect(getSnapshotSpy).toHaveBeenCalled();
  });

  /* -------------------------------------------------------------------------
     4. RECONNECT & RESUBSCRIPTION
     ------------------------------------------------------------------------- */
  it('requests fresh snapshot upon reconnection', () => {
    const getSnapshotSpy = vi.spyOn(service, 'getSnapshot');

    // Simulate reconnect event
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'connection_status',
      { status: 'connected', reconnected: true },
    );

    expect(getSnapshotSpy).toHaveBeenCalled();
    expect(service.getConnectionStatus()).toBe('LIVE');
  });

  it('updates connection status to RECONNECTING on reconnecting event', () => {
    (mockWsClient as unknown as { emit: (event: string, data?: unknown) => void }).emit(
      'connection_status',
      { status: 'reconnecting', attempt: 1 },
    );

    expect(service.getConnectionStatus()).toBe('RECONNECTING');
  });
});
