import { LatLng, Threat, Airspace } from '@/types';

export const NM_PER_KM = 0.539957;
export const KM_PER_NM = 1.852;
export const EARTH_RADIUS_KM = 6371;

/**
 * Calculates Great-Circle distance in kilometers between two LatLng coordinates.
 */
export function calculateDistanceKm(p1: LatLng, p2: LatLng): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates Great-Circle distance between two coordinates in Nautical Miles (NM).
 */
export function calculateDistanceNM(
  coord1: [number, number] | LatLng,
  coord2: [number, number] | LatLng,
): number {
  const p1: LatLng = Array.isArray(coord1) ? { lng: coord1[0], lat: coord1[1] } : coord1;
  const p2: LatLng = Array.isArray(coord2) ? { lng: coord2[0], lat: coord2[1] } : coord2;
  const km = calculateDistanceKm(p1, p2);
  return Math.round(km * NM_PER_KM * 10) / 10;
}

/**
 * Checks if a line segment between p1 and p2 intersects a circle of radiusKm centered at circleCenter.
 */
export function lineSegmentIntersectsCircle(
  p1: LatLng,
  p2: LatLng,
  circleCenter: LatLng,
  radiusKm: number,
): boolean {
  // If either endpoint is inside the circle, it intersects
  if (
    calculateDistanceKm(p1, circleCenter) <= radiusKm ||
    calculateDistanceKm(p2, circleCenter) <= radiusKm
  ) {
    return true;
  }

  // Planar projection approximation in local km space around circleCenter
  const avgLat = (circleCenter.lat * Math.PI) / 180;
  const kx = 111.32 * Math.cos(avgLat);
  const ky = 110.574;

  const x1 = (p1.lng - circleCenter.lng) * kx;
  const y1 = (p1.lat - circleCenter.lat) * ky;

  const x2 = (p2.lng - circleCenter.lng) * kx;
  const y2 = (p2.lat - circleCenter.lat) * ky;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt(x1 * x1 + y1 * y1) <= radiusKm;
  }

  // Projection parameter t of center (0,0) onto segment (x1,y1)-(x2,y2)
  const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lenSq));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distSq = closestX * closestX + closestY * closestY;

  return distSq <= radiusKm * radiusKm;
}

/**
 * Ray-casting algorithm to test if a point is inside a 2D polygon.
 */
export function isPointInPolygon(point: LatLng, ring: [number, number][]): boolean {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Checks if two 2D line segments (p1-p2 and p3-p4) intersect.
 */
function segmentsIntersect2D(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };

  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

/**
 * Checks if a line segment between p1 and p2 intersects or enters a GeoJSON Polygon ring.
 */
export function lineSegmentIntersectsPolygonRing(
  p1: LatLng,
  p2: LatLng,
  ring: [number, number][],
): boolean {
  if (isPointInPolygon(p1, ring) || isPointInPolygon(p2, ring)) {
    return true;
  }

  for (let i = 0; i < ring.length - 1; i++) {
    const edgeP1 = ring[i];
    const edgeP2 = ring[i + 1];
    if (
      segmentsIntersect2D(
        p1.lng,
        p1.lat,
        p2.lng,
        p2.lat,
        edgeP1[0],
        edgeP1[1],
        edgeP2[0],
        edgeP2[1],
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Generates circle polygon coordinates [lng, lat] for MapLibre rendering.
 */
export function generateCirclePolygon(
  center: LatLng,
  radiusKm: number,
  steps = 48,
): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLng = dLat / Math.cos(latRad);

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * (2 * Math.PI);
    const lng = center.lng + dLng * Math.sin(theta);
    const lat = center.lat + dLat * Math.cos(theta);
    coords.push([+lng.toFixed(5), +lat.toFixed(5)]);
  }

  return coords;
}

export interface RouteSegmentRisk {
  p1: LatLng;
  p2: LatLng;
  status: 'safe' | 'caution' | 'critical';
  lengthKm: number;
  threatsIntersected: { id: string; type: string; confidence: number; rangeKm: number }[];
  airspacesIntersected: { id: string; name: string; type: string }[];
  warningMessage?: string;
}

export interface RouteRiskAnalysis {
  totalDistanceKm: number;
  isCompromised: boolean;
  overallStatus: 'safe' | 'caution' | 'critical';
  riskScore: number; // 0 (safe) - 100 (lethal)
  segments: RouteSegmentRisk[];
  warnings: string[];
}

/**
 * Evaluates tactical risk for an operational flight route against active threats and airspace rules.
 */
export function evaluateRouteRisk(
  route: LatLng[],
  threats: Threat[] = [],
  airspaces: Airspace[] = [],
): RouteRiskAnalysis {
  if (!route || route.length < 2) {
    return {
      totalDistanceKm: 0,
      isCompromised: false,
      overallStatus: 'safe',
      riskScore: 0,
      segments: [],
      warnings: [],
    };
  }

  let totalDistanceKm = 0;
  let maxRiskScore = 0;
  const warningsSet = new Set<string>();
  const evaluatedSegments: RouteSegmentRisk[] = [];

  const activeThreats = threats.filter((t) => t.status === 'active' || t.status === 'suspected');

  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const segDist = calculateDistanceKm(p1, p2);
    totalDistanceKm += segDist;

    const threatsHit: RouteSegmentRisk['threatsIntersected'] = [];
    const airspacesHit: RouteSegmentRisk['airspacesIntersected'] = [];

    // Check threats
    activeThreats.forEach((thr) => {
      if (lineSegmentIntersectsCircle(p1, p2, thr.position, thr.rangeKm)) {
        threatsHit.push({
          id: thr.id,
          type: thr.type,
          confidence: thr.confidence,
          rangeKm: thr.rangeKm,
        });
        warningsSet.add(
          `Segment ${i + 1}-${i + 2} intersects ${thr.type} (${thr.id}) engagement envelope (${thr.rangeKm}km)`,
        );
      }
    });

    // Check airspaces
    airspaces.forEach((as) => {
      let ring: [number, number][] = [];
      if (as.polygon.type === 'Polygon' && as.polygon.coordinates.length > 0) {
        ring = as.polygon.coordinates[0] as [number, number][];
      }
      if (ring.length >= 3 && lineSegmentIntersectsPolygonRing(p1, p2, ring)) {
        airspacesHit.push({
          id: as.id,
          name: as.name,
          type: as.type,
        });

        if (as.type === 'no-fly') {
          warningsSet.add(`Segment ${i + 1}-${i + 2} penetrates prohibited airspace: ${as.name}`);
        } else if (as.type === 'restricted' || as.type === 'danger') {
          warningsSet.add(`Segment ${i + 1}-${i + 2} traverses restricted zone: ${as.name}`);
        }
      }
    });

    let segStatus: RouteSegmentRisk['status'] = 'safe';
    let segWarning: string | undefined;

    const hasNoFly = airspacesHit.some((a) => a.type === 'no-fly');
    const hasSam = threatsHit.some((t) => t.type === 'SAM' || t.type === 'fighter');

    if (hasNoFly || hasSam) {
      segStatus = 'critical';
      segWarning = hasNoFly
        ? 'Breaches No-Fly Airspace'
        : `Inside ${threatsHit[0]?.type || 'Threat'} Zone`;
      maxRiskScore = Math.max(maxRiskScore, 85 + Math.round((threatsHit[0]?.confidence || 0.8) * 15));
    } else if (threatsHit.length > 0 || airspacesHit.some((a) => a.type === 'restricted')) {
      segStatus = 'caution';
      segWarning = threatsHit.length > 0 ? 'Radar / AAA Detection' : 'Restricted Corridor Transit';
      maxRiskScore = Math.max(maxRiskScore, 45);
    }

    evaluatedSegments.push({
      p1,
      p2,
      status: segStatus,
      lengthKm: Math.round(segDist * 10) / 10,
      threatsIntersected: threatsHit,
      airspacesIntersected: airspacesHit,
      warningMessage: segWarning,
    });
  }

  const overallStatus =
    maxRiskScore >= 70 ? 'critical' : maxRiskScore >= 35 ? 'caution' : 'safe';

  return {
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    isCompromised: maxRiskScore >= 70,
    overallStatus,
    riskScore: maxRiskScore,
    segments: evaluatedSegments,
    warnings: Array.from(warningsSet),
  };
}
