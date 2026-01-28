/**
 * Geographic utilities for distance calculations.
 * Uses the Haversine formula for accurate Earth surface distances.
 */

const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate the distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 *
 * Performance: This is a pure mathematical calculation with no external
 * dependencies, making it extremely fast (~microseconds per call).
 */
export function calculateDistanceKm(
  from: Coordinates,
  to: Coordinates
): number {
  const lat1Rad = toRadians(from.latitude);
  const lat2Rad = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate distance in miles.
 */
export function calculateDistanceMiles(
  from: Coordinates,
  to: Coordinates
): number {
  return calculateDistanceKm(from, to) * 0.621371;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Threshold for "Near You" badge in kilometers (~100 miles).
 */
export const NEAR_YOU_THRESHOLD_KM = 160;
