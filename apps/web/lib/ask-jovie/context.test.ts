import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProfileLoaderResult } from '@/app/[username]/_lib/public-profile-loader';

const { mockGetProfileAndLinks, mockGetReleases, mockGetTourDates } =
  vi.hoisted(() => ({
    mockGetProfileAndLinks: vi.fn(),
    mockGetReleases: vi.fn(),
    mockGetTourDates: vi.fn(),
  }));

vi.mock('@/app/[username]/_lib/public-profile-loader', () => ({
  getProfileAndLinks: mockGetProfileAndLinks,
}));

vi.mock('@/lib/releases/public-release-loader', () => ({
  getCachedPublicReleasesForProfile: mockGetReleases,
}));

vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: mockGetTourDates,
}));

import { loadAskJovieContext } from './context';

function loaderResult(
  overrides: Partial<PublicProfileLoaderResult> = {}
): PublicProfileLoaderResult {
  return {
    profile: {
      id: 'profile_1',
      username: 'tim',
      display_name: 'Tim White',
      bio: 'artist',
      location: 'Los Angeles, CA',
      genres: ['pop'],
    },
    links: [],
    contacts: [],
    creatorIsPro: false,
    creatorClerkId: null,
    creatorMetaPixelId: null,
    genres: ['pop'],
    latestRelease: null,
    pressPhotos: [],
    status: 'ok',
    ...overrides,
  } as PublicProfileLoaderResult;
}

describe('loadAskJovieContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReleases.mockResolvedValue([]);
    mockGetTourDates.mockResolvedValue([]);
  });

  it('returns null context when the profile is missing', async () => {
    mockGetProfileAndLinks.mockResolvedValue(
      loaderResult({ profile: null, status: 'not_found' })
    );

    await expect(loadAskJovieContext('tim')).resolves.toEqual({
      context: null,
      creatorProfileId: null,
    });
  });

  it('normalizes string dates from the unstable_cache JSON round-trip', async () => {
    // A warm page cache returns releaseDate as an ISO string, not a Date —
    // calling .toISOString() on it used to throw and 500 the route (JOV-7109).
    mockGetProfileAndLinks.mockResolvedValue(
      loaderResult({
        latestRelease: {
          title: 'Glasshouse',
          releaseType: 'album',
          releaseDate: '2026-03-01T00:00:00.000Z',
        },
      } as unknown as Partial<PublicProfileLoaderResult>)
    );

    const { context } = await loadAskJovieContext('tim');
    expect(context?.latestRelease?.releaseDate).toBe(
      '2026-03-01T00:00:00.000Z'
    );
  });

  it('normalizes Date objects on release rows into ISO strings', async () => {
    mockGetProfileAndLinks.mockResolvedValue(loaderResult());
    mockGetReleases.mockResolvedValue([
      {
        title: 'Waves',
        releaseType: 'single',
        releaseDate: new Date('2025-11-10T00:00:00.000Z'),
        slug: 'waves',
      },
    ]);

    const { context, creatorProfileId } = await loadAskJovieContext('tim');
    expect(creatorProfileId).toBe('profile_1');
    expect(context?.releases?.[0]?.releaseDate).toBe(
      '2025-11-10T00:00:00.000Z'
    );
  });
});
