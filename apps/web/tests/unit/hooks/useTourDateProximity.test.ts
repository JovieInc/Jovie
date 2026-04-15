import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTourDateProximity } from '@/hooks/useTourDateProximity';
import type { TourDateViewModel } from '@/lib/tour-dates/types';

const makeTourDate = (
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel => ({
  id: `tour-${Math.random().toString(36).slice(2, 8)}`,
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  title: null,
  startDate: '2026-05-01T00:00:00.000Z',
  startTime: null,
  timezone: null,
  venueName: 'Test Venue',
  city: 'Test City',
  region: null,
  country: 'US',
  latitude: null,
  longitude: null,
  ticketUrl: null,
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  ...overrides,
});

describe('useTourDateProximity', () => {
  it('returns empty nearby and allDates when no tour dates', () => {
    const { result } = renderHook(() => useTourDateProximity([], null));
    expect(result.current.nearbyDates).toHaveLength(0);
    expect(result.current.allDates).toHaveLength(0);
    expect(result.current.radiusMiles).toBeNull();
  });

  it('returns all dates chronologically with no nearby when location is null', () => {
    const dates = [
      makeTourDate({ id: 'b', startDate: '2026-06-01T00:00:00.000Z' }),
      makeTourDate({ id: 'a', startDate: '2026-05-01T00:00:00.000Z' }),
    ];
    const { result } = renderHook(() => useTourDateProximity(dates, null));
    expect(result.current.nearbyDates).toHaveLength(0);
    expect(result.current.allDates).toHaveLength(2);
    expect(result.current.allDates[0].date.id).toBe('a');
    expect(result.current.allDates[1].date.id).toBe('b');
    expect(result.current.radiusMiles).toBeNull();
  });

  it('identifies nearby dates when location is provided', () => {
    const londonUser = { latitude: 51.507, longitude: -0.128 };
    const dates = [
      makeTourDate({
        id: 'london',
        city: 'London',
        latitude: 51.503,
        longitude: 0.003,
        startDate: '2026-04-25T00:00:00.000Z',
      }),
      makeTourDate({
        id: 'nyc',
        city: 'New York',
        latitude: 40.7128,
        longitude: -74.006,
        startDate: '2026-05-01T00:00:00.000Z',
      }),
    ];
    const { result } = renderHook(() =>
      useTourDateProximity(dates, londonUser)
    );
    expect(result.current.nearbyDates).toHaveLength(1);
    expect(result.current.nearbyDates[0].date.id).toBe('london');
    expect(result.current.nearbyDates[0].isNearby).toBe(true);
    // allDates includes both (chronological)
    expect(result.current.allDates).toHaveLength(2);
    expect(result.current.allDates[0].date.id).toBe('london');
    expect(result.current.allDates[1].date.id).toBe('nyc');
  });

  it('handles dates with no coordinates', () => {
    const user = { latitude: 51.507, longitude: -0.128 };
    const dates = [
      makeTourDate({ id: 'no-coords', latitude: null, longitude: null }),
    ];
    const { result } = renderHook(() => useTourDateProximity(dates, user));
    expect(result.current.nearbyDates).toHaveLength(0);
    expect(result.current.allDates).toHaveLength(1);
    expect(result.current.allDates[0].isNearby).toBe(false);
    expect(result.current.allDates[0].distanceMiles).toBeNull();
  });
});
