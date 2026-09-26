import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tables = {
    discogRecordings: {
      id: 'recording-id',
      creatorProfileId: 'recording-profile-id',
      slug: 'recording-slug',
    },
    discogReleases: {
      id: 'release-id',
      creatorProfileId: 'release-profile-id',
      slug: 'release-slug',
    },
    discogTracks: {
      id: 'track-id',
      creatorProfileId: 'track-profile-id',
      slug: 'track-slug',
    },
  };

  return {
    dbSelect: vi.fn(),
    loggerError: vi.fn(),
    shouldBypassPublicProfileQaCache: vi.fn().mockReturnValue(false),
    tables,
    unstableCache: vi.fn((load: () => Promise<unknown>) => load),
    withRetry: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  };
});

vi.mock('server-only', () => ({}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (...values: unknown[]) => values,
}));

vi.mock('next/cache', () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock('@/app/[username]/_lib/public-profile-qa', () => ({
  shouldBypassPublicProfileQaCache: mocks.shouldBypassPublicProfileQaCache,
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.dbSelect },
  withRetry: mocks.withRetry,
}));

vi.mock('@/lib/db/schema/content', () => mocks.tables);

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: mocks.loggerError },
}));

type QueryResult = Promise<readonly { readonly id: string }[]>;

function mockCandidateQueries(
  results: readonly QueryResult[],
  expectedSlug: string
) {
  const resultByTable = new Map<unknown, QueryResult>([
    [mocks.tables.discogReleases, results[0]],
    [mocks.tables.discogRecordings, results[1]],
    [mocks.tables.discogTracks, results[2]],
  ]);

  mocks.dbSelect.mockImplementation(() => ({
    from: vi.fn((table: (typeof mocks.tables)[keyof typeof mocks.tables]) => {
      const result = resultByTable.get(table);
      if (!result) throw new Error('Unexpected candidate query table');

      return {
        where: vi.fn((conditions: unknown) => {
          expect(conditions).toEqual([
            [table.creatorProfileId, 'profile-1'],
            [table.slug, expectedSlug],
          ]);
          return {
            limit: vi.fn((limit: number) => {
              expect(limit).toBe(1);
              return result;
            }),
          };
        }),
      };
    }),
  }));
}

describe('profile mode alias content candidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.shouldBypassPublicProfileQaCache.mockReturnValue(false);
    mocks.unstableCache.mockImplementation(
      (load: () => Promise<unknown>) => load
    );
    mocks.withRetry.mockImplementation(
      async (operation: () => Promise<unknown>) => operation()
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('proves a miss only after all three indexed lookups miss in parallel', async () => {
    let resolveRelease:
      | ((rows: readonly { readonly id: string }[]) => void)
      | undefined;
    let resolveRecording:
      | ((rows: readonly { readonly id: string }[]) => void)
      | undefined;
    let resolveLegacyTrack:
      | ((rows: readonly { readonly id: string }[]) => void)
      | undefined;
    mockCandidateQueries(
      [
        new Promise(resolve => {
          resolveRelease = resolve;
        }),
        new Promise(resolve => {
          resolveRecording = resolve;
        }),
        new Promise(resolve => {
          resolveLegacyTrack = resolve;
        }),
      ],
      'listen'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );
    const result = hasProfileModeAliasContentCandidate('profile-1', 'listen');

    await vi.waitFor(() => expect(mocks.dbSelect).toHaveBeenCalledTimes(3));
    resolveRelease?.([]);
    resolveRecording?.([]);
    resolveLegacyTrack?.([]);

    await expect(result).resolves.toBe(false);
  });

  it.each([
    0, 1, 2,
  ])('delegates to the canonical resolver when candidate lookup %i finds a row', async candidateIndex => {
    mockCandidateQueries(
      [0, 1, 2].map(index =>
        Promise.resolve(index === candidateIndex ? [{ id: 'candidate' }] : [])
      ),
      'music'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );

    await expect(
      hasProfileModeAliasContentCandidate('profile-1', 'music')
    ).resolves.toBe(true);
  });

  it('delegates when a candidate hit has a parallel lookup failure', async () => {
    mockCandidateQueries(
      [
        Promise.resolve([{ id: 'candidate' }]),
        Promise.reject(new Error('recording lookup unavailable')),
        Promise.resolve([]),
      ],
      'music'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );

    await expect(
      hasProfileModeAliasContentCandidate('profile-1', 'music')
    ).resolves.toBe(true);
  });

  it('fails closed when any candidate lookup is uncertain', async () => {
    const failure = new Error('database unavailable');
    mockCandidateQueries(
      [Promise.reject(failure), Promise.resolve([]), Promise.resolve([])],
      'tour'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );

    await expect(
      hasProfileModeAliasContentCandidate('profile-1', 'tour')
    ).rejects.toThrow('database unavailable');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed profile mode alias content candidate check',
      expect.objectContaining({
        creatorProfileId: 'profile-1',
        helper: 'hasProfileModeAliasContentCandidate',
        slug: 'tour',
      }),
      'public-profile'
    );
  });

  it('shares the canonical smart-link tags and five-minute TTL in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockCandidateQueries(
      [Promise.resolve([]), Promise.resolve([]), Promise.resolve([])],
      'alerts'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );
    await hasProfileModeAliasContentCandidate('profile-1', 'alerts');

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['profile-mode-alias-content-candidate-profile-1-alerts'],
      {
        tags: [
          'smartlink-content',
          'smartlink-content:profile-1',
          'smartlink-content:profile-1:alerts',
        ],
        revalidate: 300,
      }
    );
  });

  it('bypasses cross-request caching for deterministic profile QA', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mocks.shouldBypassPublicProfileQaCache.mockReturnValue(true);
    mockCandidateQueries(
      [Promise.resolve([]), Promise.resolve([]), Promise.resolve([])],
      'shop'
    );

    const { hasProfileModeAliasContentCandidate } = await import(
      '@/app/[username]/[...slug]/_lib/content-candidate'
    );
    await hasProfileModeAliasContentCandidate('profile-1', 'shop');

    expect(mocks.unstableCache).not.toHaveBeenCalled();
    expect(mocks.dbSelect).toHaveBeenCalledTimes(3);
  });
});
