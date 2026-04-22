/**
 * Tests for filterReleases — the client-side search and filter logic.
 *
 * Covers:
 * - Text search by title (case-insensitive, partial match)
 * - Release type filter (single/multi, OR within group)
 * - Popularity level filter
 * - Label filter
 * - Combined filter dimensions (AND across groups)
 * - Edge cases: empty inputs, null values
 */

import { describe, expect, it } from 'vitest';

import type {
  PopularityLevel,
  ReleaseFilters,
} from '@/features/dashboard/organisms/release-provider-matrix/ReleaseTableSubheader';
import { filterReleases } from '@/features/dashboard/organisms/release-provider-matrix/utils/filterReleases';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRelease(
  overrides: Partial<ReleaseViewModel> & { id: string }
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    title: 'Test Release',
    slug: 'test-release',
    smartLinkPath: '/r/test-release',
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    providers: [],
    ...overrides,
  } as ReleaseViewModel;
}

const EMPTY_FILTERS: ReleaseFilters = {
  releaseTypes: [],
  popularity: [],
  labels: [],
};

// Sample releases used across multiple tests
const RELEASES: ReleaseViewModel[] = [
  makeRelease({
    id: '1',
    title: 'Midnights',
    releaseType: 'album',
    spotifyPopularity: 95,
    label: 'Republic',
  }),
  makeRelease({
    id: '2',
    title: 'Anti-Hero',
    releaseType: 'single',
    spotifyPopularity: 88,
    label: 'Republic',
  }),
  makeRelease({
    id: '3',
    title: 'Lavender Haze',
    releaseType: 'single',
    spotifyPopularity: 50,
    label: 'Interscope',
  }),
  makeRelease({
    id: '4',
    title: 'Folklore',
    releaseType: 'album',
    spotifyPopularity: 20,
    label: 'Republic',
  }),
  makeRelease({
    id: '5',
    title: 'Willow EP',
    releaseType: 'ep',
    spotifyPopularity: null,
    label: null,
  }),
];

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------

describe('filterReleases — text search', () => {
  it('returns all releases when search query is empty', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, '');
    expect(result).toHaveLength(5);
  });

  it('filters by title case-insensitively', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, 'midnights');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches partial substrings', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, 'lav');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty array when nothing matches', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, 'zzzznotfound');
    expect(result).toHaveLength(0);
  });

  it('matches mixed-case queries', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, 'ANTI');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('matches by artist name (case-insensitive)', () => {
    const releases = [
      makeRelease({ id: 'a', title: 'Song A', artistNames: ['Deadmau5'] }),
      makeRelease({ id: 'b', title: 'Song B', artistNames: ['Kaskade'] }),
      makeRelease({
        id: 'c',
        title: 'Song C',
        artistNames: ['Deadmau5', 'Kaskade'],
      }),
    ];
    const result = filterReleases(releases, EMPTY_FILTERS, 'deadmau5');
    expect(result.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('matches artist name even when title does not contain the query', () => {
    const releases = [
      makeRelease({ id: 'x', title: 'Unrelated', artistNames: ['Avicii'] }),
    ];
    const result = filterReleases(releases, EMPTY_FILTERS, 'Avicii');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('x');
  });

  it('does not match when neither title nor artist names contain the query', () => {
    const releases = [
      makeRelease({ id: 'y', title: 'Foo', artistNames: ['Bar'] }),
    ];
    const result = filterReleases(releases, EMPTY_FILTERS, 'baz');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Release type filter
// ---------------------------------------------------------------------------

describe('filterReleases — release type', () => {
  it('returns all releases when releaseTypes is empty', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, '');
    expect(result).toHaveLength(5);
  });

  it('filters by a single type', () => {
    const filters = {
      ...EMPTY_FILTERS,
      releaseTypes: ['album'] as ReleaseType[],
    };
    const result = filterReleases(RELEASES, filters, '');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.releaseType === 'album')).toBe(true);
  });

  it('filters by multiple types (OR logic)', () => {
    const filters = {
      ...EMPTY_FILTERS,
      releaseTypes: ['single', 'ep'] as ReleaseType[],
    };
    const result = filterReleases(RELEASES, filters, '');
    expect(result).toHaveLength(3);
    expect(result.map(r => r.releaseType).sort()).toEqual([
      'ep',
      'single',
      'single',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Popularity filter
// ---------------------------------------------------------------------------

describe('filterReleases — popularity', () => {
  it('filters by a single popularity level', () => {
    const filters = {
      ...EMPTY_FILTERS,
      popularity: ['high'] as PopularityLevel[],
    };
    const result = filterReleases(RELEASES, filters, '');
    // high = 67-100: id 1 (95), id 2 (88)
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['1', '2']);
  });

  it('filters by multiple popularity levels', () => {
    const filters = {
      ...EMPTY_FILTERS,
      popularity: ['low', 'med'] as PopularityLevel[],
    };
    const result = filterReleases(RELEASES, filters, '');
    // low = 0-33: id 4 (20), med = 34-66: id 3 (50)
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['3', '4']);
  });

  it('excludes releases with null popularity when filter is active', () => {
    const filters = {
      ...EMPTY_FILTERS,
      popularity: ['low'] as PopularityLevel[],
    };
    const result = filterReleases(RELEASES, filters, '');
    // Only id 4 (20) is low; id 5 (null) should be excluded
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('includes releases with null popularity when no popularity filter', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, '');
    expect(result.find(r => r.id === '5')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Label filter
// ---------------------------------------------------------------------------

describe('filterReleases — label', () => {
  it('filters by a single label', () => {
    const filters = { ...EMPTY_FILTERS, labels: ['Interscope'] };
    const result = filterReleases(RELEASES, filters, '');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('filters by multiple labels (OR logic)', () => {
    const filters = {
      ...EMPTY_FILTERS,
      labels: ['Republic', 'Interscope'],
    };
    const result = filterReleases(RELEASES, filters, '');
    // Republic: id 1, 2, 4; Interscope: id 3
    expect(result).toHaveLength(4);
  });

  it('excludes releases with null/undefined label when filter is active', () => {
    const filters = { ...EMPTY_FILTERS, labels: ['Republic'] };
    const result = filterReleases(RELEASES, filters, '');
    // id 5 has label: null — should be excluded
    expect(result.find(r => r.id === '5')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Combined filters
// ---------------------------------------------------------------------------

describe('filterReleases — combined', () => {
  it('applies text search AND type filter', () => {
    const filters = {
      ...EMPTY_FILTERS,
      releaseTypes: ['album'] as ReleaseType[],
    };
    const result = filterReleases(RELEASES, filters, 'folk');
    // "Folklore" is an album, matches "folk"
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('applies text search AND popularity filter', () => {
    const filters = {
      ...EMPTY_FILTERS,
      popularity: ['high'] as PopularityLevel[],
    };
    const result = filterReleases(RELEASES, filters, 'anti');
    // "Anti-Hero" has popularity 88 (high)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('applies text search AND label filter', () => {
    const filters = { ...EMPTY_FILTERS, labels: ['Republic'] };
    const result = filterReleases(RELEASES, filters, 'mid');
    // "Midnights" has label Republic
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('applies all filters simultaneously (AND across groups)', () => {
    const filters = {
      releaseTypes: ['single'] as ReleaseType[],
      popularity: ['high'] as PopularityLevel[],
      labels: ['Republic'],
    };
    const result = filterReleases(RELEASES, filters, '');
    // single + high + Republic = Anti-Hero (id 2)
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns empty when combined filters exclude everything', () => {
    const filters = {
      releaseTypes: ['ep'] as ReleaseType[],
      popularity: ['high'] as PopularityLevel[],
      labels: ['Republic'],
    };
    const result = filterReleases(RELEASES, filters, '');
    // No EP that is also high popularity and Republic
    expect(result).toHaveLength(0);
  });

  it('applies search on top of all filters', () => {
    const filters = {
      releaseTypes: ['album', 'single'] as ReleaseType[],
      popularity: ['high'] as PopularityLevel[],
      labels: ['Republic'],
    };
    // With search "hero" — only Anti-Hero (single, high, Republic) matches
    const result = filterReleases(RELEASES, filters, 'hero');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Anti-Hero');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('filterReleases — edge cases', () => {
  it('handles empty releases array', () => {
    const result = filterReleases([], EMPTY_FILTERS, 'test');
    expect(result).toHaveLength(0);
  });

  it('handles empty search with empty filters', () => {
    const result = filterReleases(RELEASES, EMPTY_FILTERS, '');
    expect(result).toHaveLength(RELEASES.length);
  });

  it('does not mutate the input array', () => {
    const copy = [...RELEASES];
    filterReleases(RELEASES, EMPTY_FILTERS, 'test');
    expect(RELEASES).toEqual(copy);
  });
});
