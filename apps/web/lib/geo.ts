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
 * @deprecated Use calculateLocalNearbyRadius() for density-aware thresholds.
 */
export const NEAR_YOU_THRESHOLD_KM = 160;

// Density-aware proximity constants
export const DENSE_RADIUS_MILES = 50;
export const SPARSE_RADIUS_MILES = 150;
export const DENSITY_SCAN_MILES = 200;
export const DENSITY_THRESHOLD = 3;

/**
 * Calculate the nearby radius based on venue density around the user's nearest venue.
 *
 * Algorithm:
 * 1. Find the user's nearest venue
 * 2. Count how many OTHER venues are within DENSITY_SCAN_MILES of that nearest venue
 * 3. If count >= DENSITY_THRESHOLD: dense cluster → small radius (50mi)
 * 4. Otherwise: sparse area → large radius (150mi)
 *
 * This avoids a global classification problem where a dense European cluster
 * would shrink the radius for a fan near an isolated US date.
 */
export function calculateLocalNearbyRadius(
  userLocation: Coordinates,
  allVenueCoords: Coordinates[]
): number {
  if (allVenueCoords.length === 0) {
    return SPARSE_RADIUS_MILES;
  }

  // Find the nearest venue to the user
  let nearestIdx = 0;
  let nearestDist = Infinity;

  for (let i = 0; i < allVenueCoords.length; i++) {
    const dist = calculateDistanceMiles(userLocation, allVenueCoords[i]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }

  const nearestVenue = allVenueCoords[nearestIdx];

  // Count other venues within DENSITY_SCAN_MILES of the nearest venue
  let neighborCount = 0;
  for (let i = 0; i < allVenueCoords.length; i++) {
    if (i === nearestIdx) continue;
    const dist = calculateDistanceMiles(nearestVenue, allVenueCoords[i]);
    if (dist <= DENSITY_SCAN_MILES) {
      neighborCount++;
    }
  }

  return neighborCount >= DENSITY_THRESHOLD
    ? DENSE_RADIUS_MILES
    : SPARSE_RADIUS_MILES;
}

/**
 * Check if a venue is near the user given a specific radius.
 */
export function isNearUser(
  userLocation: Coordinates,
  venueLocation: Coordinates,
  radiusMiles: number
): { isNearby: boolean; distanceMiles: number } {
  const distanceMiles = calculateDistanceMiles(userLocation, venueLocation);
  return {
    isNearby: distanceMiles <= radiusMiles,
    distanceMiles,
  };
}
