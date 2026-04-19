import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCalculateAndStoreFitScore,
  mockGetSpotifyArtist,
  mockGetSpotifyArtists,
  mockIsSpotifyAvailable,
  mockDbSelect,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockCalculateAndStoreFitScore: vi.fn(),
  mockGetSpotifyArtist: vi.fn(),
  mockGetSpotifyArtists: vi.fn(),
  mockIsSpotifyAvailable: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

function makeChain(resolvedValue: unknown = []) {
  const obj: Record<string, unknown> = {};
  const chainMethods = ['select', 'from', 'where', 'update', 'set'];

  for (const method of chainMethods) {
    obj[method] = vi.fn().mockReturnValue(obj);
  }

  obj.limit = vi.fn().mockResolvedValue(resolvedValue);
  obj.then = (
    resolve: (value: unknown) => void,
    reject: (error: unknown) => void
  ) => Promise.resolve(resolvedValue).then(resolve, reject);

  return obj;
}

function setupSelectSequence(results: unknown[]) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const value = results[callIndex] ?? [];
    callIndex += 1;
    return makeChain(value);
  });
}

function setupUpdateChain(implementation?: () => unknown) {
  mockDbUpdate.mockImplementation(() => {
    const chain = makeChain([]);
    if (implementation) {
      chain.where = vi.fn().mockImplementation(implementation);
    }
    return chain;
  });
}

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    spotifyId: 'spotify_id',
    genres: 'genres',
    spotifyFollowers: 'spotify_followers',
    spotifyPopularity: 'spotify_popularity',
    updatedAt: 'updated_at',
    username: 'username',
  },
}));

vi.mock('@/lib/dsp-enrichment/providers/spotify', () => ({
  getSpotifyArtists: mockGetSpotifyArtists,
}));

vi.mock('@/lib/spotify/index', () => ({
  getSpotifyArtist: mockGetSpotifyArtist,
  isSpotifyAvailable: mockIsSpotifyAvailable,
}));

vi.mock('@/lib/fit-scoring/service', () => ({
  calculateAndStoreFitScore: mockCalculateAndStoreFitScore,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ _type: 'eq', left, right })),
  isNotNull: vi.fn((column: unknown) => ({ _type: 'isNotNull', column })),
  isNull: vi.fn((column: unknown) => ({ _type: 'isNull', column })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _type: 'sql',
      strings,
      values,
    }),
    {
      join: vi.fn((...args: unknown[]) => ({ _type: 'sql_join', args })),
    }
  ),
}));

describe('fit-scoring/spotify-enrichment.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsSpotifyAvailable.mockReturnValue(true);
    mockCalculateAndStoreFitScore.mockResolvedValue({
      score: 42,
      breakdown: {},
    });
  });

  describe('enrichProfileWithSpotify', () => {
    it('returns a configuration error when Spotify is unavailable', async () => {
      mockIsSpotifyAvailable.mockReturnValue(false);

      const { enrichProfileWithSpotify } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const result = await enrichProfileWithSpotify({} as never, 'profile-1');

      expect(result).toEqual({
        profileId: 'profile-1',
        success: false,
        enriched: false,
        error: 'Spotify API not configured',
      });
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it('returns a not-found error when the profile is missing', async () => {
      setupSelectSequence([[]]);

      const { enrichProfileWithSpotify } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichProfileWithSpotify(db as never, 'missing');

      expect(result).toEqual({
        profileId: 'missing',
        success: false,
        enriched: false,
        error: 'Profile not found',
      });
    });

    it('skips profiles that do not have a Spotify ID', async () => {
      setupSelectSequence([
        [
          {
            id: 'profile-1',
            spotifyId: null,
            genres: [],
            spotifyFollowers: null,
            spotifyPopularity: null,
          },
        ],
      ]);

      const { enrichProfileWithSpotify } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichProfileWithSpotify(db as never, 'profile-1');

      expect(result).toEqual({
        profileId: 'profile-1',
        success: true,
        enriched: false,
        error: 'No Spotify ID on profile',
      });
      expect(mockGetSpotifyArtist).not.toHaveBeenCalled();
    });

    it('returns a fetch error when Spotify artist lookup fails', async () => {
      setupSelectSequence([
        [
          {
            id: 'profile-1',
            spotifyId: 'spotify-123',
            genres: [],
            spotifyFollowers: null,
            spotifyPopularity: null,
          },
        ],
      ]);
      mockGetSpotifyArtist.mockResolvedValue(null);

      const { enrichProfileWithSpotify } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichProfileWithSpotify(db as never, 'profile-1');

      expect(mockGetSpotifyArtist).toHaveBeenCalledWith('spotify-123');
      expect(result).toEqual({
        profileId: 'profile-1',
        success: false,
        enriched: false,
        error: 'Failed to fetch Spotify artist data',
      });
    });

    it('updates the profile and recalculates the fit score on success', async () => {
      setupSelectSequence([
        [
          {
            id: 'profile-1',
            spotifyId: 'spotify-123',
            genres: [],
            spotifyFollowers: null,
            spotifyPopularity: null,
          },
        ],
      ]);
      setupUpdateChain();
      mockGetSpotifyArtist.mockResolvedValue({
        id: 'spotify-123',
        genres: ['pop', 'dance'],
        followerCount: 1234,
        popularity: 77,
      });

      const { enrichProfileWithSpotify } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichProfileWithSpotify(db as never, 'profile-1');

      expect(mockDbUpdate).toHaveBeenCalledTimes(1);
      expect(mockCalculateAndStoreFitScore).toHaveBeenCalledWith(
        db,
        'profile-1'
      );
      expect(result).toEqual({
        profileId: 'profile-1',
        success: true,
        enriched: true,
        spotifyData: {
          genres: ['pop', 'dance'],
          followers: 1234,
          popularity: 77,
        },
      });
    });
  });

  describe('enrichMissingSpotifyData', () => {
    it('returns an empty list when Spotify is unavailable', async () => {
      mockIsSpotifyAvailable.mockReturnValue(false);

      const { enrichMissingSpotifyData } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const result = await enrichMissingSpotifyData({} as never);

      expect(result).toEqual([]);
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it('returns an empty list when there are no profiles to enrich', async () => {
      setupSelectSequence([[]]);

      const { enrichMissingSpotifyData } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichMissingSpotifyData(db as never, 25);

      expect(result).toEqual([]);
      expect(mockGetSpotifyArtists).not.toHaveBeenCalled();
    });

    it('enriches batch results and reports missing artists and update failures', async () => {
      setupSelectSequence([
        [
          { id: 'profile-1', spotifyId: 'spotify-1' },
          { id: 'profile-2', spotifyId: 'spotify-2' },
          { id: 'profile-3', spotifyId: 'spotify-3' },
          { id: 'profile-4', spotifyId: null },
        ],
      ]);
      let updateCalls = 0;
      setupUpdateChain(() => {
        updateCalls += 1;
        if (updateCalls === 2) {
          throw new Error('db write failed');
        }
        return Promise.resolve([]);
      });
      mockGetSpotifyArtists.mockResolvedValue([
        {
          id: 'spotify-1',
          genres: ['pop'],
          followers: { total: 111 },
          popularity: 61,
        },
        {
          id: 'spotify-3',
          genres: ['rock'],
          followers: { total: 333 },
          popularity: 83,
        },
      ]);

      const { enrichMissingSpotifyData } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await enrichMissingSpotifyData(db as never, 10);

      expect(mockGetSpotifyArtists).toHaveBeenCalledWith([
        'spotify-1',
        'spotify-2',
        'spotify-3',
      ]);
      expect(mockCalculateAndStoreFitScore).toHaveBeenNthCalledWith(
        1,
        db,
        'profile-1'
      );
      expect(result).toEqual([
        {
          profileId: 'profile-1',
          success: true,
          enriched: true,
          spotifyData: {
            genres: ['pop'],
            followers: 111,
            popularity: 61,
          },
        },
        {
          profileId: 'profile-2',
          success: false,
          enriched: false,
          error: 'Artist not found in batch response',
        },
        {
          profileId: 'profile-3',
          success: false,
          enriched: false,
          error: 'db write failed',
        },
      ]);
    });
  });

  describe('getEnrichmentQueue', () => {
    it('returns the total count and filters null Spotify IDs from the sample', async () => {
      setupSelectSequence([
        [{ count: 3 }],
        [
          { id: 'profile-1', username: 'alpha', spotifyId: 'spotify-1' },
          { id: 'profile-2', username: 'beta', spotifyId: null },
          { id: 'profile-3', username: 'gamma', spotifyId: 'spotify-3' },
        ],
      ]);

      const { getEnrichmentQueue } = await import(
        '@/lib/fit-scoring/spotify-enrichment'
      );

      const db = {
        select: mockDbSelect,
        update: mockDbUpdate,
      };

      const result = await getEnrichmentQueue(db as never, 5);

      expect(result).toEqual({
        total: 3,
        sample: [
          { id: 'profile-1', username: 'alpha', spotifyId: 'spotify-1' },
          { id: 'profile-3', username: 'gamma', spotifyId: 'spotify-3' },
        ],
      });
    });
  });
});
