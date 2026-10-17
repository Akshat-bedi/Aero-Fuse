/**
 * Geo helpers for fictional airspace and tactical plotting
 */

const NM_PER_KM = 0.539957;
const EARTH_RADIUS_KM = 6371;

/**
 * Calculates Great-Circle distance between two coordinates in Nautical Miles (NM)
 */
export function calculateDistanceNM(
  coord1: [number, number],
  coord2: [number, number],
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distKm = EARTH_RADIUS_KM * c;

  return Math.round(distKm * NM_PER_KM * 10) / 10;
}
