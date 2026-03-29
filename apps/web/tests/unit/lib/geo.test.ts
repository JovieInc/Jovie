import { describe, expect, it } from 'vitest';
import {
  calculateDistanceKm,
  calculateDistanceMiles,
  NEAR_YOU_THRESHOLD_KM,
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
