import { describe, it, expect } from 'vitest';
import {
  calculateDistanceKm,
  calculateDistanceNM,
  lineSegmentIntersectsCircle,
  isPointInPolygon,
  lineSegmentIntersectsPolygonRing,
  evaluateRouteRisk,
  generateCirclePolygon,
} from './geo';
import { Threat, Airspace } from '@/types';

describe('Geospatial Risk Engine (lib/geo)', () => {
  describe('Distance Calculations', () => {
    it('calculates Great-Circle distances accurately', () => {
      // 1 degree of latitude is approx 111 km
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 1, lng: 0 };
      const distKm = calculateDistanceKm(p1, p2);
      expect(distKm).toBeGreaterThan(110);
      expect(distKm).toBeLessThan(112);

      const distNM = calculateDistanceNM(p1, p2);
      expect(distNM).toBeGreaterThan(59);
      expect(distNM).toBeLessThan(61);
    });
  });

  describe('Circle and Threat Intersection', () => {
    const threatPos = { lat: 5.0, lng: 5.0 };
    const threatRadiusKm = 50;

    it('detects when a segment passes directly through a threat envelope', () => {
      const p1 = { lat: 5.0, lng: 4.0 }; // ~111km west
      const p2 = { lat: 5.0, lng: 6.0 }; // ~111km east
      const intersects = lineSegmentIntersectsCircle(p1, p2, threatPos, threatRadiusKm);
      expect(intersects).toBe(true);
    });

    it('detects when an endpoint is inside the threat envelope', () => {
      const p1 = { lat: 5.0, lng: 5.1 }; // ~11km east (inside 50km radius)
      const p2 = { lat: 5.0, lng: 8.0 };
      const intersects = lineSegmentIntersectsCircle(p1, p2, threatPos, threatRadiusKm);
      expect(intersects).toBe(true);
    });

    it('returns false when a segment passes safely outside the envelope', () => {
      const p1 = { lat: 7.0, lng: 4.0 }; // ~222km north
      const p2 = { lat: 7.0, lng: 6.0 };
      const intersects = lineSegmentIntersectsCircle(p1, p2, threatPos, threatRadiusKm);
      expect(intersects).toBe(false);
    });

    it('returns false when the infinite line intersects but the segment ends before reaching the circle', () => {
      const p1 = { lat: 5.0, lng: 1.0 };
      const p2 = { lat: 5.0, lng: 3.5 }; // Closest point is ~166km away from lng 5.0
      const intersects = lineSegmentIntersectsCircle(p1, p2, threatPos, threatRadiusKm);
      expect(intersects).toBe(false);
    });
  });

  describe('Polygon & Airspace Intersection', () => {
    // Square polygon from [2.0, 2.0] to [4.0, 4.0] (lng, lat)
    const ring: [number, number][] = [
      [2.0, 2.0],
      [4.0, 2.0],
      [4.0, 4.0],
      [2.0, 4.0],
      [2.0, 2.0],
    ];

    it('correctly determines whether a point is inside a polygon', () => {
      expect(isPointInPolygon({ lng: 3.0, lat: 3.0 }, ring)).toBe(true);
      expect(isPointInPolygon({ lng: 5.0, lat: 5.0 }, ring)).toBe(false);
      expect(isPointInPolygon({ lng: 1.0, lat: 3.0 }, ring)).toBe(false);
    });

    it('detects when a segment crosses polygon boundaries', () => {
      const p1 = { lng: 1.0, lat: 3.0 };
      const p2 = { lng: 5.0, lat: 3.0 };
      expect(lineSegmentIntersectsPolygonRing(p1, p2, ring)).toBe(true);
    });

    it('detects when a segment is completely inside a polygon', () => {
      const p1 = { lng: 2.5, lat: 2.5 };
      const p2 = { lng: 3.5, lat: 3.5 };
      expect(lineSegmentIntersectsPolygonRing(p1, p2, ring)).toBe(true);
    });

    it('returns false when a segment is outside the polygon', () => {
      const p1 = { lng: 6.0, lat: 6.0 };
      const p2 = { lng: 8.0, lat: 8.0 };
      expect(lineSegmentIntersectsPolygonRing(p1, p2, ring)).toBe(false);
    });
  });

  describe('Route Risk Evaluation Engine', () => {
    const mockThreats: Threat[] = [
      {
        id: 'THR-02',
        type: 'SAM',
        position: { lat: 4.8, lng: 7.5 },
        rangeKm: 85,
        confidence: 0.9,
        lastSeen: '2026-10-17T12:00:00Z',
        status: 'active',
      },
    ];

    const mockAirspaces: Airspace[] = [
      {
        id: 'AS-03',
        name: 'No-Fly Buffer Zone',
        type: 'no-fly',
        activeFrom: '2026-10-17T00:00:00Z',
        activeTo: '2026-10-17T23:59:59Z',
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [1.0, 9.0],
              [11.0, 9.0],
              [11.0, 9.9],
              [1.0, 9.9],
              [1.0, 9.0],
            ],
          ],
        },
      },
    ];

    it('flags a route that crosses an active SAM threat as critical and compromised', () => {
      // Route B crosses directly near THR-02 at lat 4.8, lng 7.5
      const compromisedRoute = [
        { lat: 5.2, lng: 6.8 }, // BASE-B
        { lat: 4.8, lng: 7.4 }, // Directly in SAM envelope
        { lat: 4.5, lng: 8.5 }, // Target
      ];

      const analysis = evaluateRouteRisk(compromisedRoute, mockThreats, mockAirspaces);
      expect(analysis.isCompromised).toBe(true);
      expect(analysis.overallStatus).toBe('critical');
      expect(analysis.riskScore).toBeGreaterThanOrEqual(85);
      expect(analysis.warnings.length).toBeGreaterThan(0);
      expect(analysis.warnings[0]).toContain('THR-02');

      const criticalSegment = analysis.segments.find((s) => s.status === 'critical');
      expect(criticalSegment).toBeDefined();
      expect(criticalSegment?.warningMessage).toContain('SAM');
    });

    it('flags a route that avoids the SAM envelope via dogleg as safe', () => {
      // Route C southern dogleg bypass
      const safeDoglegRoute = [
        { lat: 5.2, lng: 6.8 },
        { lat: 3.8, lng: 6.0 }, // Swings well west of SAM (dist > 160km)
        { lat: 3.2, lng: 7.5 }, // Swings well south of SAM (dist > 170km)
        { lat: 3.6, lng: 9.0 }, // Ingresses past the threat
        { lat: 4.5, lng: 8.5 },
      ];

      const analysis = evaluateRouteRisk(safeDoglegRoute, mockThreats, mockAirspaces);
      expect(analysis.isCompromised).toBe(false);
      expect(analysis.overallStatus).toBe('safe');
      expect(analysis.riskScore).toBeLessThan(50);
    });

    it('flags a route penetrating prohibited no-fly airspace as critical', () => {
      const illegalRoute = [
        { lat: 8.5, lng: 3.5 },
        { lat: 9.4, lng: 5.0 }, // Penetrates AS-03 (lat 9.0 - 9.9)
        { lat: 8.5, lng: 7.0 },
      ];

      const analysis = evaluateRouteRisk(illegalRoute, [], mockAirspaces);
      expect(analysis.isCompromised).toBe(true);
      expect(analysis.overallStatus).toBe('critical');
      expect(analysis.warnings.some((w) => w.includes('prohibited airspace'))).toBe(true);
    });
  });

  describe('Circle Polygon Generator for MapLibre rendering', () => {
    it('generates a closed ring polygon matching the requested radius', () => {
      const center = { lat: 5.0, lng: 6.0 };
      const circle = generateCirclePolygon(center, 50, 16);
      expect(circle.length).toBe(17); // 16 steps + 1 closing point
      expect(circle[0][0]).toBe(circle[circle.length - 1][0]);
      expect(circle[0][1]).toBe(circle[circle.length - 1][1]);
    });
  });
});
