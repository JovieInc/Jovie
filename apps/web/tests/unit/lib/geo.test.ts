import { describe, expect, it } from 'vitest';
import {
  calculateDistanceKm,
  calculateDistanceMiles,
  calculateLocalNearbyRadius,
  DENSE_RADIUS_MILES,
  isNearUser,
  NEAR_YOU_THRESHOLD_KM,
  SPARSE_RADIUS_MILES,
} from '@/lib/geo';

describe('calculateDistanceKm', () => {
  it('returns 0 for same coordinates', () => {
    const coord = { latitude: 34.0522, longitude: -118.2437 };
    expect(calculateDistanceKm(coord, coord)).toBe(0);
  });

  it('calculates LA to NYC distance (~3940 km)', () => {
    const la = { latitude: 34.0522, longitude: -118.2437 };
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    const distance = calculateDistanceKm(la, nyc);

    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(4000);
  });

  it('calculates London to Paris distance (~343 km)', () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    const distance = calculateDistanceKm(london, paris);

    expect(distance).toBeGreaterThan(330);
    expect(distance).toBeLessThan(360);
  });

  it('handles antipodal points (~20000 km)', () => {
    const north = { latitude: 0, longitude: 0 };
    const south = { latitude: 0, longitude: 180 };
    const distance = calculateDistanceKm(north, south);

    expect(distance).toBeGreaterThan(19500);
    expect(distance).toBeLessThan(20100);
  });

  it('handles negative coordinates', () => {
    const sydney = { latitude: -33.8688, longitude: 151.2093 };
    const tokyo = { latitude: 35.6762, longitude: 139.6503 };
    const distance = calculateDistanceKm(sydney, tokyo);

    expect(distance).toBeGreaterThan(7700);
    expect(distance).toBeLessThan(7900);
  });
});

describe('calculateDistanceMiles', () => {
  it('returns 0 for same coordinates', () => {
    const coord = { latitude: 34.0522, longitude: -118.2437 };
    expect(calculateDistanceMiles(coord, coord)).toBe(0);
  });

  it('returns distance in miles (km * 0.621371)', () => {
    const la = { latitude: 34.0522, longitude: -118.2437 };
    const nyc = { latitude: 40.7128, longitude: -74.006 };
    const km = calculateDistanceKm(la, nyc);
    const miles = calculateDistanceMiles(la, nyc);

    expect(miles).toBeCloseTo(km * 0.621371, 2);
  });
});

describe('NEAR_YOU_THRESHOLD_KM', () => {
  it('is 160 km (~100 miles)', () => {
    expect(NEAR_YOU_THRESHOLD_KM).toBe(160);
  });
});

describe('calculateLocalNearbyRadius', () => {
  // Dense cluster: US Northeast cities within reasonable proximity
  const denseCluster = [
    { latitude: 40.7128, longitude: -74.006 }, // NYC
    { latitude: 40.4406, longitude: -79.9959 }, // Pittsburgh (~300mi, outside 200mi)
    { latitude: 39.9526, longitude: -75.1652 }, // Philadelphia (~100mi from NYC)
    { latitude: 40.0583, longitude: -74.4057 }, // Trenton (~60mi from NYC)
    { latitude: 41.0534, longitude: -73.5387 }, // Stamford (~30mi from NYC)
  ];

  const sparseVenues = [
    { latitude: 51.503, longitude: 0.003 }, // London
    { latitude: 38.9067, longitude: 1.4206 }, // Ibiza
  ];

  it('returns SPARSE_RADIUS_MILES for empty venues', () => {
    const user = { latitude: 40.7128, longitude: -74.006 };
    expect(calculateLocalNearbyRadius(user, [])).toBe(SPARSE_RADIUS_MILES);
  });

  it('returns SPARSE_RADIUS_MILES for single venue', () => {
    const user = { latitude: 51.5, longitude: -0.1 };
    const venues = [{ latitude: 51.503, longitude: 0.003 }];
    expect(calculateLocalNearbyRadius(user, venues)).toBe(SPARSE_RADIUS_MILES);
  });

  it('returns DENSE_RADIUS_MILES when nearest venue has 3+ neighbors within 200mi', () => {
    // User near NYC, which has Philadelphia, Trenton, Stamford within 200mi
    const user = { latitude: 40.75, longitude: -73.99 };
    const radius = calculateLocalNearbyRadius(user, denseCluster);
    expect(radius).toBe(DENSE_RADIUS_MILES);
  });

  it('returns SPARSE_RADIUS_MILES when nearest venue has fewer than 3 neighbors within 200mi', () => {
    // User near London, only Ibiza is the other venue (far away)
    const user = { latitude: 51.5, longitude: -0.1 };
    const radius = calculateLocalNearbyRadius(user, sparseVenues);
    expect(radius).toBe(SPARSE_RADIUS_MILES);
  });

  it('uses local density (nearest venue to user), not global', () => {
    // User near London. Dense cluster exists on US east coast but is far away.
    // Nearest venue to user is London, which has 0 neighbors within 200mi.
    const allVenues = [...denseCluster, ...sparseVenues];
    const londonUser = { latitude: 51.5, longitude: -0.1 };
    const radius = calculateLocalNearbyRadius(londonUser, allVenues);
    expect(radius).toBe(SPARSE_RADIUS_MILES);
  });

  it('user near dense cluster gets DENSE radius', () => {
    // User near NYC, mixed venues exist globally
    const allVenues = [...denseCluster, ...sparseVenues];
    const nycUser = { latitude: 40.75, longitude: -73.99 };
    const radius = calculateLocalNearbyRadius(nycUser, allVenues);
    expect(radius).toBe(DENSE_RADIUS_MILES);
  });

  it('user far from all venues still classifies by nearest venue density', () => {
    // User in middle of Atlantic, nearest venue is some US city
    const atlanticUser = { latitude: 35, longitude: -40 };
    const radius = calculateLocalNearbyRadius(atlanticUser, denseCluster);
    // Nearest venue is one of the east coast cities, which has 3+ neighbors
    expect(radius).toBe(DENSE_RADIUS_MILES);
  });
});

describe('isNearUser', () => {
  it('returns isNearby true when within radius', () => {
    const user = { latitude: 51.507, longitude: -0.128 }; // Central London
    const venue = { latitude: 51.503, longitude: 0.003 }; // The O2
    const result = isNearUser(user, venue, 50);
    expect(result.isNearby).toBe(true);
    expect(result.distanceMiles).toBeLessThan(10);
  });

  it('returns isNearby false when outside radius', () => {
    const user = { latitude: 40.7128, longitude: -74.006 }; // NYC
    const venue = { latitude: 51.503, longitude: 0.003 }; // London
    const result = isNearUser(user, venue, 150);
    expect(result.isNearby).toBe(false);
    expect(result.distanceMiles).toBeGreaterThan(3000);
  });

  it('handles exact boundary (distance equals radius)', () => {
    const user = { latitude: 51.507, longitude: -0.128 };
    const venue = { latitude: 51.503, longitude: 0.003 };
    const distance = calculateDistanceMiles(user, venue);
    // Use exact distance as radius — should be nearby (<=)
    const result = isNearUser(user, venue, distance);
    expect(result.isNearby).toBe(true);
  });
});
