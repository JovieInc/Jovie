/**
 * Tests for getPopularityLevel and useReleaseFilterCounts.
 *
 * Covers:
 * - Popularity level boundaries (low/med/high/null)
 * - Filter count computation by type, popularity, availability, label
 * - Edge cases: empty array, null values, missing labels
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  getPopularityLevel,
  useReleaseFilterCounts,
} from '@/components/dashboard/organisms/release-provider-matrix/hooks/useReleaseFilterCounts';
import type { ReleaseViewModel } from '@/lib/discography/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    id: 'release-1',
    profileId: 'profile-1',
    title: 'Test Release',
    slug: 'test-release',
    smartLinkPath: '/r/test-release',
    releaseType: 'single',
    totalTracks: 1,
    providers: [],
    ...overrides,
  } as ReleaseViewModel;
}

// ---------------------------------------------------------------------------
// getPopularityLevel
// ---------------------------------------------------------------------------

describe('getPopularityLevel', () => {
  it('returns "low" for values 0–33', () => {
    expect(getPopularityLevel(0)).toBe('low');
    expect(getPopularityLevel(1)).toBe('low');
    expect(getPopularityLevel(16)).toBe('low');
    expect(getPopularityLevel(33)).toBe('low');
  });

  it('returns "med" for values 34–66', () => {
    expect(getPopularityLevel(34)).toBe('med');
    expect(getPopularityLevel(50)).toBe('med');
    expect(getPopularityLevel(66)).toBe('med');
  });

  it('returns "high" for values 67–100', () => {
    expect(getPopularityLevel(67)).toBe('high');
    expect(getPopularityLevel(85)).toBe('high');
    expect(getPopularityLevel(100)).toBe('high');
  });

  it('returns null for null or undefined', () => {
    expect(getPopularityLevel(null)).toBeNull();
    expect(getPopularityLevel(undefined)).toBeNull();
  });

  it('returns null for non-finite numbers', () => {
    expect(getPopularityLevel(NaN)).toBeNull();
    expect(getPopularityLevel(Infinity)).toBeNull();
    expect(getPopularityLevel(-Infinity)).toBeNull();
  });

  it('handles exact boundary values', () => {
    // 33 is the boundary between low and med
    expect(getPopularityLevel(33)).toBe('low');
    expect(getPopularityLevel(34)).toBe('med');
    // 66 is the boundary between med and high
    expect(getPopularityLevel(66)).toBe('med');
    expect(getPopularityLevel(67)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// useReleaseFilterCounts
// ---------------------------------------------------------------------------

describe('useReleaseFilterCounts', () => {
  it('returns zero counts for empty releases array', () => {
    const { result } = renderHook(() => useReleaseFilterCounts([]));

    expect(result.current.byType).toEqual({
      album: 0,
      ep: 0,
      single: 0,
      compilation: 0,
      live: 0,
      mixtape: 0,
      other: 0,
    });
    expect(result.current.byAvailability).toEqual({
      all: 0,
      complete: 0,
      incomplete: 0,
    });
    expect(result.current.byPopularity).toEqual({ low: 0, med: 0, high: 0 });
    expect(result.current.byLabel).toEqual([]);
  });

  it('counts releases by type', () => {
    const releases = [
      makeRelease({ id: '1', releaseType: 'album' }),
      makeRelease({ id: '2', releaseType: 'album' }),
      makeRelease({ id: '3', releaseType: 'single' }),
      makeRelease({ id: '4', releaseType: 'ep' }),
      makeRelease({ id: '5', releaseType: 'compilation' }),
    ];

    const { result } = renderHook(() => useReleaseFilterCounts(releases));

    expect(result.current.byType.album).toBe(2);
    expect(result.current.byType.single).toBe(1);
    expect(result.current.byType.ep).toBe(1);
    expect(result.current.byType.compilation).toBe(1);
    expect(result.current.byType.live).toBe(0);
  });

  it('counts releases by popularity level', () => {
    const releases = [
      makeRelease({ id: '1', spotifyPopularity: 10 }), // low
      makeRelease({ id: '2', spotifyPopularity: 25 }), // low
      makeRelease({ id: '3', spotifyPopularity: 50 }), // med
      makeRelease({ id: '4', spotifyPopularity: 80 }), // high
      makeRelease({ id: '5', spotifyPopularity: 95 }), // high
      makeRelease({ id: '6', spotifyPopularity: null }), // none
    ];

    const { result } = renderHook(() => useReleaseFilterCounts(releases));

    expect(result.current.byPopularity.low).toBe(2);
    expect(result.current.byPopularity.med).toBe(1);
    expect(result.current.byPopularity.high).toBe(2);
  });

  it('counts labels sorted by count descending', () => {
    const releases = [
      makeRelease({ id: '1', label: 'Republic' }),
      makeRelease({ id: '2', label: 'Republic' }),
      makeRelease({ id: '3', label: 'Republic' }),
      makeRelease({ id: '4', label: 'Interscope' }),
      makeRelease({ id: '5', label: 'Columbia' }),
      makeRelease({ id: '6', label: 'Columbia' }),
    ];

    const { result } = renderHook(() => useReleaseFilterCounts(releases));

    expect(result.current.byLabel).toEqual([
      { label: 'Republic', count: 3 },
      { label: 'Columbia', count: 2 },
      { label: 'Interscope', count: 1 },
    ]);
  });

  it('skips releases with no label', () => {
    const releases = [
      makeRelease({ id: '1', label: 'Republic' }),
      makeRelease({ id: '2', label: null }),
      makeRelease({ id: '3', label: undefined }),
    ];

    const { result } = renderHook(() => useReleaseFilterCounts(releases));

    expect(result.current.byLabel).toEqual([{ label: 'Republic', count: 1 }]);
  });

  it('computes availability: complete when all providers have URLs', () => {
    const releases = [
      makeRelease({
        id: '1',
        providers: [
          {
            key: 'spotify',
            url: 'https://open.spotify.com/album/abc',
            source: 'ingested',
            updatedAt: '2024-01-01',
            label: 'Spotify',
            path: '/spotify',
            isPrimary: true,
          },
        ],
      }),
      makeRelease({
        id: '2',
        providers: [
          {
            key: 'spotify',
            url: '',
            source: 'ingested',
            updatedAt: '2024-01-01',
            label: 'Spotify',
            path: '/spotify',
            isPrimary: true,
          },
        ],
      }),
      makeRelease({ id: '3', providers: [] }),
    ];

    const { result } = renderHook(() => useReleaseFilterCounts(releases));

    expect(result.current.byAvailability.all).toBe(3);
    expect(result.current.byAvailability.complete).toBe(1);
    expect(result.current.byAvailability.incomplete).toBe(2);
  });
});
