import { beforeEach, describe, expect, it, vi } from 'vitest';

// Split from route.test.ts (size-500): Spotify identity for legacy profiles
// that store only spotify_url (JOV-7140).

const hoisted = vi.hoisted(() => ({
  getProfileWithUser: vi.fn(),
  getReleasesForProfileLite: vi.fn(),
  getLiveMerchCardsForProfile: vi.fn(),
  getUpcomingTourDatesForProfile: vi.fn(),
  getActiveLinksForProfile: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: () => ({}),
  getClientIP: () => '203.0.113.10',
  publicArtistApiLimiter: {
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    }),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] }),
          limit: async () => [],
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/flags/profile-variant', () => ({
  getMerchMvpEnabled: async () => true,
}));
vi.mock('@/lib/services/profile', () => ({
  getProfileWithUser: hoisted.getProfileWithUser,
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: hoisted.getReleasesForProfileLite,
}));
vi.mock('@/lib/merch/service', () => ({
  getLiveMerchCardsForProfile: hoisted.getLiveMerchCardsForProfile,
}));
vi.mock('@/lib/tour-dates/queries', () => ({
  getUpcomingTourDatesForProfile: hoisted.getUpcomingTourDatesForProfile,
}));
vi.mock('@/lib/services/social-links/queries', () => ({
  getActiveLinksForProfile: hoisted.getActiveLinksForProfile,
}));
vi.mock('@/constants/app', () => ({ BASE_URL: 'https://jov.ie' }));

const legacyProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-1',
  username: 'realartist',
  displayName: 'Real Artist',
  isPublic: true,
  bio: null,
  location: null,
  genres: [],
  avatarUrl: null,
  spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
  appleMusicUrl: null,
  youtubeUrl: null,
  creatorType: 'artist',
  spotifyId: null,
  appleMusicId: null,
  youtubeMusicId: null,
  deezerId: null,
  tidalId: null,
  soundcloudId: null,
  musicbrainzId: null,
  spotifyFollowers: null,
  ...overrides,
});

async function getArtist() {
  const { GET } = await import('./route');
  const res = await GET(new Request('https://jov.ie/api/v1/realartist'), {
    params: Promise.resolve({ username: 'realartist' }),
  });
  return (await res.json()).artist;
}

describe('GET /api/v1/[username] Spotify identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getActiveLinksForProfile.mockResolvedValue([]);
    hoisted.getReleasesForProfileLite.mockResolvedValue([]);
    hoisted.getLiveMerchCardsForProfile.mockResolvedValue([]);
    hoisted.getUpcomingTourDatesForProfile.mockResolvedValue([]);
  });

  it('derives the Spotify artist ID from spotify_url on legacy profiles', async () => {
    hoisted.getProfileWithUser.mockResolvedValue(legacyProfile());
    expect((await getArtist()).platformIds.spotify).toBe(
      '4Uwpa6zW3zzCSQvooQNksm'
    );
  });

  it('keeps the stored spotify_id when it is set', async () => {
    hoisted.getProfileWithUser.mockResolvedValue(
      legacyProfile({ spotifyId: '0000000000000000000001' })
    );
    expect((await getArtist()).platformIds.spotify).toBe(
      '0000000000000000000001'
    );
  });
});
