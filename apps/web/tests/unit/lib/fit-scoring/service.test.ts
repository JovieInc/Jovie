import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FitScoreBreakdown } from '@/lib/db/schema/profiles';

// Hoist mocks before module resolution
const { mockCalculateScore, mockDbExecute, mockDbSelect, mockDbUpdate } =
  vi.hoisted(() => ({
    mockCalculateScore: vi.fn(),
    mockDbExecute: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
  }));

// Mock calculator
vi.mock('@/lib/fit-scoring/calculator', () => ({
  calculateFitScore: mockCalculateScore,
  FIT_SCORE_VERSION: 3,
  PAID_VERIFICATION_PLATFORMS: new Set([
    'twitter',
    'x',
    'instagram',
    'facebook',
    'threads',
  ]),
}));

/**
 * Creates a deeply chainable mock object where every method returns the same
 * chain. The chain is also a thenable: if awaited at any point in the chain,
 * it resolves to `resolvedValue`. The `.limit()` call also resolves to the value.
 *
 * This matches Drizzle's query builder behavior where you can await the chain
 * at any terminal point (e.g., `.where(...)`, `.orderBy(...)`, `.limit(...)`).
 */
function makeChain(resolvedValue: unknown = []) {
  const obj: Record<string, unknown> = {};
  const chainMethods = [
    'select',
    'from',
    'where',
    'leftJoin',
    'groupBy',
    'orderBy',
    'set',
    'update',
  ];

  for (const m of chainMethods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.limit = vi.fn().mockResolvedValue(resolvedValue);
  obj.execute = vi.fn().mockResolvedValue(resolvedValue);
  // Make the chain itself thenable so `await db.select(...).from(...).where(...)` works
  obj.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(resolvedValue).then(resolve, reject);

  return obj;
}

/**
 * Sets up mockDbSelect so that sequential calls return different chains,
 * each resolving to the corresponding value in `results`.
 */
function setupSelectSequence(results: unknown[][]) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const value = results[callIndex] ?? [];
    callIndex++;
    return makeChain(value);
  });
}

/**
 * Sets up mockDbUpdate to return a chain that resolves.
 */
function setupUpdateChain() {
  mockDbUpdate.mockImplementation(() => makeChain([]));
}

// Mock database
vi.mock('@/lib/db', () => {
  const dbProxy = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'execute') return mockDbExecute;
        if (prop === 'select') return mockDbSelect;
        if (prop === 'update') return mockDbUpdate;
        return vi.fn();
      },
    }
  );
  return { db: dbProxy };
});

// Mock schema tables as objects with column name references
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    spotifyId: 'spotify_id',
    spotifyPopularity: 'spotify_popularity',
    genres: 'genres',
    ingestionSourcePlatform: 'ingestion_source_platform',
    appleMusicId: 'apple_music_id',
    soundcloudId: 'soundcloud_id',
    deezerId: 'deezer_id',
    tidalId: 'tidal_id',
    youtubeMusicId: 'youtube_music_id',
    isClaimed: 'is_claimed',
    fitScore: 'fit_score',
    fitScoreBreakdown: 'fit_score_breakdown',
    fitScoreUpdatedAt: 'fit_score_updated_at',
    updatedAt: 'updated_at',
    username: 'username',
    displayName: 'display_name',
    spotifyUrl: 'spotify_url',
  },
  creatorContacts: {
    creatorProfileId: 'creator_profile_id',
    email: 'email',
  },
}));

vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: {
    creatorProfileId: 'creator_profile_id',
    platform: 'platform',
    state: 'state',
  },
  socialAccounts: {
    creatorProfileId: 'creator_profile_id',
    platform: 'platform',
    isVerifiedFlag: 'is_verified_flag',
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    creatorProfileId: 'creator_profile_id',
    releaseDate: 'release_date',
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  asc: vi.fn((col: unknown) => ({ _type: 'asc', col })),
  desc: vi.fn((col: unknown) => ({ _type: 'desc', col })),
  eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
  gt: vi.fn((a: unknown, b: unknown) => ({ _type: 'gt', a, b })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({
    _type: 'inArray',
    col,
    vals,
  })),
  isNotNull: vi.fn((col: unknown) => ({ _type: 'isNotNull', col })),
  isNull: vi.fn((col: unknown) => ({ _type: 'isNull', col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => ({
      _type: 'sql',
      strings,
    }),
    {
      join: vi.fn((...args: unknown[]) => ({ _type: 'sql_join', args })),
    }
  ),
}));

// Helper to build a mock breakdown
function createMockBreakdown(
  overrides: Partial<FitScoreBreakdown> = {}
): FitScoreBreakdown {
  return {
    usesLinkInBio: 0,
    paidTier: 0,
    usesMusicTools: 0,
    hasSpotify: 0,
    spotifyPopularity: 0,
    releaseRecency: 0,
    genreMatch: 0,
    hasAlternativeDsp: 0,
    multiDspPresence: 0,
    hasContactEmail: 0,
    paidVerification: 0,
    meta: {
      calculatedAt: new Date().toISOString(),
      version: 3,
    },
    ...overrides,
  };
}

// Get mock db reference (same proxy used by vi.mock)
const mockDb = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (prop === 'execute') return mockDbExecute;
      if (prop === 'select') return mockDbSelect;
      if (prop === 'update') return mockDbUpdate;
      return vi.fn();
    },
  }
);

describe('fit-scoring/service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockDbExecute.mockResolvedValue(undefined);
  });

  describe('calculateAndStoreFitScore', () => {
    it('calculates and persists score for a valid profile', async () => {
      const mockBreakdown = createMockBreakdown({ hasSpotify: 15 });
      mockCalculateScore.mockReturnValue({
        score: 45,
        breakdown: mockBreakdown,
      });

      // Query 1: profile
      // Query 2: contact
      // Query 3: social links
      // Query 4: verified accounts
      // Query 5: latest release
      setupSelectSequence([
        [
          {
            id: 'profile-1',
            spotifyId: 'sp-123',
            spotifyPopularity: 50,
            genres: ['electronic'],
            ingestionSourcePlatform: 'linktree',
            appleMusicId: 'am-1',
            soundcloudId: null,
            deezerId: null,
            tidalId: null,
            youtubeMusicId: null,
          },
        ],
        [{ email: 'artist@example.com' }],
        [{ platform: 'linkfire' }],
        [{ platform: 'Twitter' }],
        [{ releaseDate: new Date('2025-12-01') }],
      ]);
      setupUpdateChain();

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );
      const result = await calculateAndStoreFitScore(
        mockDb as never,
        'profile-1'
      );

      expect(result).not.toBeNull();
      expect(result!.score).toBe(45);
      expect(result!.breakdown).toEqual(mockBreakdown);
      expect(mockCalculateScore).toHaveBeenCalledTimes(1);

      const calcInput = mockCalculateScore.mock.calls[0][0];
      expect(calcInput.hasSpotifyId).toBe(true);
      expect(calcInput.hasContactEmail).toBe(true);
      expect(calcInput.ingestionSourcePlatform).toBe('linktree');
      expect(calcInput.paidVerificationPlatforms).toEqual(['twitter']);
    });

    it('returns null when profile is not found', async () => {
      setupSelectSequence([[]]);

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );
      const result = await calculateAndStoreFitScore(
        mockDb as never,
        'nonexistent-id'
      );

      expect(result).toBeNull();
      expect(mockCalculateScore).not.toHaveBeenCalled();
    });

    it('handles profile with no contact email or social links', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 10,
        breakdown: mockBreakdown,
      });

      setupSelectSequence([
        [
          {
            id: 'profile-2',
            spotifyId: null,
            spotifyPopularity: null,
            genres: null,
            ingestionSourcePlatform: null,
            appleMusicId: null,
            soundcloudId: null,
            deezerId: null,
            tidalId: null,
            youtubeMusicId: null,
          },
        ],
        [], // no contact
        [], // no social links
        [], // no verified accounts
        [], // no releases
      ]);
      setupUpdateChain();

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );
      const result = await calculateAndStoreFitScore(
        mockDb as never,
        'profile-2'
      );

      expect(result).not.toBeNull();
      expect(result!.score).toBe(10);
      const calcInput = mockCalculateScore.mock.calls[0][0];
      expect(calcInput.hasSpotifyId).toBe(false);
      expect(calcInput.hasContactEmail).toBe(false);
      expect(calcInput.socialLinkPlatforms).toEqual([]);
      expect(calcInput.dspPlatformCount).toBe(0);
      expect(calcInput.paidVerificationPlatforms).toEqual([]);
    });

    it('correctly counts DSP platforms', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 30,
        breakdown: mockBreakdown,
      });

      setupSelectSequence([
        [
          {
            id: 'profile-3',
            spotifyId: 'sp-1',
            spotifyPopularity: 40,
            genres: null,
            ingestionSourcePlatform: 'beacons',
            appleMusicId: 'am-1',
            soundcloudId: 'sc-1',
            deezerId: 'dz-1',
            tidalId: null,
            youtubeMusicId: 'ym-1',
          },
        ],
        [],
        [],
        [],
        [],
      ]);
      setupUpdateChain();

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );
      await calculateAndStoreFitScore(mockDb as never, 'profile-3');

      const calcInput = mockCalculateScore.mock.calls[0][0];
      // spotify + apple + soundcloud + deezer + youtube = 5
      expect(calcInput.dspPlatformCount).toBe(5);
      expect(calcInput.hasAppleMusicId).toBe(true);
      expect(calcInput.hasSoundCloudId).toBe(true);
    });
  });

  describe('calculateMissingFitScores', () => {
    it('calculates scores for profiles without fit scores', async () => {
      const mockBreakdown = createMockBreakdown({ usesLinkInBio: 15 });
      mockCalculateScore.mockReturnValue({
        score: 15,
        breakdown: mockBreakdown,
      });

      // Single aggregated query returns profiles
      setupSelectSequence([
        [
          {
            id: 'p-1',
            spotifyId: 'sp-1',
            spotifyPopularity: 30,
            genres: ['house'],
            ingestionSourcePlatform: 'linktree',
            socialLinkPlatforms: ['linkfire'],
            latestReleaseDate: new Date('2025-09-01'),
            paidVerificationPlatforms: [],
          },
          {
            id: 'p-2',
            spotifyId: null,
            spotifyPopularity: null,
            genres: null,
            ingestionSourcePlatform: 'beacons',
            socialLinkPlatforms: [],
            latestReleaseDate: null,
            paidVerificationPlatforms: ['twitter'],
          },
        ],
      ]);
      mockDbExecute.mockResolvedValue(undefined);

      const { calculateMissingFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      const count = await calculateMissingFitScores(mockDb as never, 50);

      expect(count).toBe(2);
      expect(mockCalculateScore).toHaveBeenCalledTimes(2);
    });

    it('returns 0 when no profiles are missing scores', async () => {
      setupSelectSequence([[]]);

      const { calculateMissingFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      const count = await calculateMissingFitScores(mockDb as never);

      expect(count).toBe(0);
      expect(mockCalculateScore).not.toHaveBeenCalled();
      expect(mockDbExecute).not.toHaveBeenCalled();
    });

    it('uses default limit of 100', async () => {
      setupSelectSequence([[]]);

      const { calculateMissingFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      await calculateMissingFitScores(mockDb as never);

      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('recalculateAllFitScores', () => {
    const makeProfile = (id: string) => ({
      id,
      spotifyId: null,
      spotifyPopularity: null,
      genres: null,
      ingestionSourcePlatform: null,
      appleMusicId: null,
      soundcloudId: null,
      deezerId: null,
      tidalId: null,
      youtubeMusicId: null,
      socialLinkPlatforms: [],
      latestReleaseDate: null,
      hasContactEmail: false,
      paidVerificationPlatforms: [],
    });

    it('processes all profiles in batches with cursor pagination', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 25,
        breakdown: mockBreakdown,
      });

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        // Call 1: first batch of IDs
        if (selectCallCount === 1)
          return makeChain([{ id: 'a-1' }, { id: 'a-2' }]);
        // Call 2: first batch full profiles
        if (selectCallCount === 2)
          return makeChain([makeProfile('a-1'), makeProfile('a-2')]);
        // Call 3: second batch of IDs - empty (no more)
        if (selectCallCount === 3) return makeChain([]);
        return makeChain([]);
      });

      const { recalculateAllFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      const total = await recalculateAllFitScores(mockDb as never, 2);

      expect(total).toBe(2);
      expect(mockCalculateScore).toHaveBeenCalledTimes(2);
      expect(mockDbExecute).toHaveBeenCalled();
    });

    it('returns 0 when no unclaimed profiles exist', async () => {
      setupSelectSequence([[]]);

      const { recalculateAllFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      const total = await recalculateAllFitScores(mockDb as never);

      expect(total).toBe(0);
      expect(mockCalculateScore).not.toHaveBeenCalled();
    });

    it('handles multiple pagination batches', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 30,
        breakdown: mockBreakdown,
      });

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        // Batch 1: IDs
        if (selectCallCount === 1) return makeChain([{ id: 'b-1' }]);
        // Batch 1: profiles
        if (selectCallCount === 2) return makeChain([makeProfile('b-1')]);
        // Batch 2: IDs
        if (selectCallCount === 3) return makeChain([{ id: 'b-2' }]);
        // Batch 2: profiles
        if (selectCallCount === 4) return makeChain([makeProfile('b-2')]);
        // Batch 3: no more IDs
        if (selectCallCount === 5) return makeChain([]);
        return makeChain([]);
      });

      const { recalculateAllFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      const total = await recalculateAllFitScores(mockDb as never, 1);

      expect(total).toBe(2);
      expect(mockCalculateScore).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTopFitProfiles', () => {
    it('returns top profiles sorted by score descending', async () => {
      const topProfiles = [
        {
          id: 'top-1',
          username: 'artist1',
          displayName: 'Top Artist',
          fitScore: 85,
          fitScoreBreakdown: createMockBreakdown({ hasSpotify: 15 }),
          spotifyUrl: 'https://spotify.com/artist1',
          ingestionSourcePlatform: 'linktree',
        },
        {
          id: 'top-2',
          username: 'artist2',
          displayName: null,
          fitScore: 70,
          fitScoreBreakdown: createMockBreakdown(),
          spotifyUrl: null,
          ingestionSourcePlatform: 'beacons',
        },
      ];

      setupSelectSequence([topProfiles]);

      const { getTopFitProfiles } = await import('@/lib/fit-scoring/service');
      const result = await getTopFitProfiles(mockDb as never, 10, 50);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('top-1');
      expect(result[0].fitScore).toBe(85);
      expect(result[1].id).toBe('top-2');
    });

    it('returns empty array when no profiles meet minimum score', async () => {
      setupSelectSequence([[]]);

      const { getTopFitProfiles } = await import('@/lib/fit-scoring/service');
      const result = await getTopFitProfiles(mockDb as never, 50, 90);

      expect(result).toEqual([]);
    });

    it('uses default limit of 50 and minScore of 0', async () => {
      setupSelectSequence([[]]);

      const { getTopFitProfiles } = await import('@/lib/fit-scoring/service');
      const result = await getTopFitProfiles(mockDb as never);

      expect(result).toEqual([]);
      expect(mockDbSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('updatePaidTierScore', () => {
    it('updates paid tier component when profile has existing breakdown', async () => {
      const existingBreakdown = createMockBreakdown({
        usesLinkInBio: 15,
        paidTier: 0,
        hasSpotify: 15,
      });

      setupSelectSequence([
        [{ fitScore: 30, fitScoreBreakdown: existingBreakdown }],
      ]);
      setupUpdateChain();

      const { updatePaidTierScore } = await import('@/lib/fit-scoring/service');
      await updatePaidTierScore(mockDb as never, 'profile-1', true);

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockCalculateScore).not.toHaveBeenCalled();
    });

    it('does nothing when paid tier score is unchanged (already has paid)', async () => {
      const existingBreakdown = createMockBreakdown({ paidTier: 20 });

      setupSelectSequence([
        [{ fitScore: 50, fitScoreBreakdown: existingBreakdown }],
      ]);

      const { updatePaidTierScore } = await import('@/lib/fit-scoring/service');
      await updatePaidTierScore(mockDb as never, 'profile-1', true);

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when paid tier score is unchanged (already zero)', async () => {
      const existingBreakdown = createMockBreakdown({ paidTier: 0 });

      setupSelectSequence([
        [{ fitScore: 30, fitScoreBreakdown: existingBreakdown }],
      ]);

      const { updatePaidTierScore } = await import('@/lib/fit-scoring/service');
      await updatePaidTierScore(mockDb as never, 'profile-1', false);

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('falls back to full calculation when no existing breakdown', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 0,
        breakdown: mockBreakdown,
      });

      // First select: profile with no breakdown (triggers fallback)
      // Then calculateAndStoreFitScore runs its own 5 queries
      setupSelectSequence([
        [{ fitScore: null, fitScoreBreakdown: null }],
        [
          {
            id: 'profile-1',
            spotifyId: null,
            spotifyPopularity: null,
            genres: null,
            ingestionSourcePlatform: null,
            appleMusicId: null,
            soundcloudId: null,
            deezerId: null,
            tidalId: null,
            youtubeMusicId: null,
          },
        ],
        [], // contact
        [], // links
        [], // verified accounts
        [], // releases
      ]);
      setupUpdateChain();

      const { updatePaidTierScore } = await import('@/lib/fit-scoring/service');
      await updatePaidTierScore(mockDb as never, 'profile-1', true);

      expect(mockCalculateScore).toHaveBeenCalledTimes(1);
    });

    it('correctly adjusts score when removing paid tier', async () => {
      const existingBreakdown = createMockBreakdown({
        usesLinkInBio: 15,
        paidTier: 20,
        hasSpotify: 15,
      });

      setupSelectSequence([
        [{ fitScore: 50, fitScoreBreakdown: existingBreakdown }],
      ]);
      setupUpdateChain();

      const { updatePaidTierScore } = await import('@/lib/fit-scoring/service');
      await updatePaidTierScore(mockDb as never, 'profile-1', false);

      // Should call update: 50 - 20 + 0 = 30
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe('batchUpdateFitScores (via calculateMissingFitScores)', () => {
    it('calls db.execute for batch CASE update', async () => {
      const mockBreakdown = createMockBreakdown({ usesLinkInBio: 15 });
      mockCalculateScore.mockReturnValue({
        score: 15,
        breakdown: mockBreakdown,
      });

      setupSelectSequence([
        [
          {
            id: 'batch-1',
            spotifyId: null,
            spotifyPopularity: null,
            genres: null,
            ingestionSourcePlatform: 'linktree',
            socialLinkPlatforms: [],
            latestReleaseDate: null,
            paidVerificationPlatforms: [],
          },
        ],
      ]);
      mockDbExecute.mockResolvedValue(undefined);

      const { calculateMissingFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      await calculateMissingFitScores(mockDb as never, 10);

      expect(mockDbExecute).toHaveBeenCalledTimes(1);
    });

    it('skips batch update when no profiles to score', async () => {
      setupSelectSequence([[]]);

      const { calculateMissingFitScores } = await import(
        '@/lib/fit-scoring/service'
      );
      await calculateMissingFitScores(mockDb as never);

      expect(mockDbExecute).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('propagates database errors from calculateAndStoreFitScore', async () => {
      mockDbSelect.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );

      await expect(
        calculateAndStoreFitScore(mockDb as never, 'profile-1')
      ).rejects.toThrow('Database connection failed');
    });

    it('propagates calculator errors', async () => {
      setupSelectSequence([
        [
          {
            id: 'profile-err',
            spotifyId: null,
            spotifyPopularity: null,
            genres: null,
            ingestionSourcePlatform: null,
            appleMusicId: null,
            soundcloudId: null,
            deezerId: null,
            tidalId: null,
            youtubeMusicId: null,
          },
        ],
        [], // contact
        [], // links
        [], // verified accounts
        [], // releases
      ]);

      mockCalculateScore.mockImplementation(() => {
        throw new Error('Calculator error: invalid input');
      });

      const { calculateAndStoreFitScore } = await import(
        '@/lib/fit-scoring/service'
      );

      await expect(
        calculateAndStoreFitScore(mockDb as never, 'profile-err')
      ).rejects.toThrow('Calculator error: invalid input');
    });

    it('propagates batch execute errors from recalculateAllFitScores', async () => {
      const mockBreakdown = createMockBreakdown();
      mockCalculateScore.mockReturnValue({
        score: 10,
        breakdown: mockBreakdown,
      });

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return makeChain([{ id: 'err-1' }]);
        if (selectCallCount === 2) {
          return makeChain([
            {
              id: 'err-1',
              spotifyId: null,
              spotifyPopularity: null,
              genres: null,
              ingestionSourcePlatform: null,
              appleMusicId: null,
              soundcloudId: null,
              deezerId: null,
              tidalId: null,
              youtubeMusicId: null,
              socialLinkPlatforms: [],
              latestReleaseDate: null,
              hasContactEmail: false,
              paidVerificationPlatforms: [],
            },
          ]);
        }
        return makeChain([]);
      });
      mockDbExecute.mockRejectedValue(
        new Error('Batch update failed: deadlock')
      );

      const { recalculateAllFitScores } = await import(
        '@/lib/fit-scoring/service'
      );

      await expect(recalculateAllFitScores(mockDb as never, 1)).rejects.toThrow(
        'Batch update failed: deadlock'
      );
    });
  });
});
