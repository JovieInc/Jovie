import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const dbSelectResults: unknown[][] = [];
  const txSelectResults: unknown[][] = [];
  const txReturningResults: unknown[][] = [];
  const insertedValues: Array<Record<string, unknown>> = [];
  const updatedValues: Array<Record<string, unknown>> = [];

  function query(result: unknown[]) {
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'where', 'for', 'orderBy']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.limit = vi.fn().mockResolvedValue(result);
    builder.then = (
      resolve: (value: unknown[]) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }

  const dbSelect = vi.fn(() => query(dbSelectResults.shift() ?? []));
  const txSelect = vi.fn(() => query(txSelectResults.shift() ?? []));
  const txUpdate = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.set = vi.fn((value: Record<string, unknown>) => {
      updatedValues.push(value);
      return builder;
    });
    builder.where = vi.fn(() => builder);
    builder.returning = vi
      .fn()
      .mockImplementation(async () => txReturningResults.shift() ?? []);
    builder.then = (resolve: (value: undefined) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return builder;
  });
  const txInsert = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.values = vi.fn((value: Record<string, unknown>) => {
      insertedValues.push(value);
      return builder;
    });
    builder.onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    builder.returning = vi
      .fn()
      .mockImplementation(async () => txReturningResults.shift() ?? []);
    return builder;
  });
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: txInsert,
    select: txSelect,
    update: txUpdate,
  };

  return {
    captureWarning: vi.fn(),
    dbSelect,
    dbSelectResults,
    getSpotifyArtistsBatch: vi.fn(),
    insertedValues,
    invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
    loggerInfo: vi.fn(),
    tx,
    txInsert,
    txReturningResults,
    txSelectResults,
    txUpdate,
    updatedValues,
    withSystemIngestionSession: vi.fn(
      async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)
    ),
  };
});

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.dbSelect, selectDistinct: hoisted.dbSelect },
}));

vi.mock('@/lib/db/schema/content', () => ({
  artists: {
    creatorProfileId: 'artists.creatorProfileId',
    id: 'artists.id',
    imageUrl: 'artists.imageUrl',
    metadata: 'artists.metadata',
    name: 'artists.name',
    spotifyId: 'artists.spotifyId',
    updatedAt: 'artists.updatedAt',
  },
  discogReleases: {
    creatorProfileId: 'discogReleases.creatorProfileId',
    id: 'discogReleases.id',
  },
  releaseArtists: {
    artistId: 'releaseArtists.artistId',
    releaseId: 'releaseArtists.releaseId',
    role: 'releaseArtists.role',
  },
}));

vi.mock('@/lib/db/schema/links', () => ({ socialLinks: 'socialLinks' }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    isClaimed: 'creatorProfiles.isClaimed',
    isPublic: 'creatorProfiles.isPublic',
    settings: 'creatorProfiles.settings',
    spotifyId: 'creatorProfiles.spotifyId',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
  },
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: hoisted.withSystemIngestionSession,
}));
vi.mock('@/lib/spotify', () => ({
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
  getSpotifyArtistsBatch: hoisted.getSpotifyArtistsBatch,
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: hoisted.invalidateProfileCache,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: hoisted.captureWarning,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: hoisted.loggerInfo },
}));
vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: vi.fn(() => 'public-release-only'),
}));

const { reconcileCreditedArtistProfiles } = await import(
  '@/lib/discography/collaborator-profile-reconciliation'
);

const candidate = {
  artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
  imageUrl: null,
  name: 'Austin Leeds',
  spotifyId: 'spotify-austin',
};

function queueOwnerAndCandidates() {
  hoisted.dbSelectResults.push(
    [{ spotifyId: 'spotify-owner', usernameNormalized: 'owner-handle' }],
    [candidate, { ...candidate }]
  );
  hoisted.txSelectResults.push([], []);
}

describe('credited artist profile reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbSelectResults.length = 0;
    hoisted.txSelectResults.length = 0;
    hoisted.txReturningResults.length = 0;
    hoisted.insertedValues.length = 0;
    hoisted.updatedValues.length = 0;
    hoisted.getSpotifyArtistsBatch.mockResolvedValue([]);
  });

  it('creates one claim-safe minimal profile for repeated exact-ID credits', async () => {
    queueOwnerAndCandidates();
    hoisted.txSelectResults.push(
      [
        {
          ...candidate,
          creatorProfileId: null,
          id: candidate.artistId,
        },
      ],
      [],
      []
    );
    hoisted.txReturningResults.push(
      [
        {
          id: 'created-profile',
          usernameNormalized: 'a_eiqd46x3irj64dlgo8a3glau4',
        },
      ],
      [{ id: candidate.artistId }]
    );

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toEqual({
      candidates: 1,
      conflicted: 0,
      created: 1,
      deferred: false,
      metadataUnavailable: 1,
      reused: 0,
    });
    const profileInsert = hoisted.insertedValues[0];
    expect(profileInsert).toMatchObject({
      displayName: 'Austin Leeds',
      isClaimed: false,
      isPublic: true,
      isVerified: false,
      marketingOptOut: true,
      spotifyId: 'spotify-austin',
      usernameNormalized: 'a_eiqd46x3irj64dlgo8a3glau4',
      settings: {
        unclaimedArtistProfile: expect.objectContaining({
          consentObtained: false,
          ownershipVerified: false,
          representationVerified: false,
          state: 'unclaimed',
        }),
      },
    });
    expect(hoisted.invalidateProfileCache).toHaveBeenCalledWith('owner-handle');
    expect(hoisted.invalidateProfileCache).toHaveBeenCalledWith(
      'a_eiqd46x3irj64dlgo8a3glau4'
    );
  });

  it('fails closed when the owner identity already belongs to another profile', async () => {
    hoisted.dbSelectResults.push([{ usernameNormalized: 'owner-handle' }]);
    hoisted.txSelectResults.push([{ id: 'other-profile' }]);

    await expect(
      reconcileCreditedArtistProfiles('owner-profile', 'spotify-owner')
    ).rejects.toThrow('explicit verified profile merge');
    expect(hoisted.getSpotifyArtistsBatch).not.toHaveBeenCalled();
  });

  it('preserves the write receipt when request-scoped cache invalidation is unavailable', async () => {
    queueOwnerAndCandidates();
    hoisted.txSelectResults.push(
      [
        {
          ...candidate,
          creatorProfileId: null,
          id: candidate.artistId,
        },
      ],
      [],
      []
    );
    hoisted.txReturningResults.push(
      [
        {
          id: 'created-profile',
          usernameNormalized: 'a_eiqd46x3irj64dlgo8a3glau4',
        },
      ],
      [{ id: candidate.artistId }]
    );
    hoisted.invalidateProfileCache.mockRejectedValueOnce(
      new Error('static generation store missing')
    );

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toMatchObject({ created: 1, conflicted: 0 });
    expect(hoisted.captureWarning).toHaveBeenCalledWith(
      'Credited artist profile cache invalidation deferred',
      expect.objectContaining({ creatorProfileId: 'owner-profile' })
    );
  });

  it('never creates a collaborator profile for a legacy owner with only the import identity', async () => {
    hoisted.dbSelectResults.push(
      [{ usernameNormalized: 'owner-handle' }],
      [
        {
          artistId: 'owner-registry-artist',
          imageUrl: null,
          name: 'Owner Artist',
          spotifyId: 'spotify-owner',
        },
        candidate,
      ]
    );
    hoisted.txSelectResults.push(
      [],
      [],
      [
        {
          ...candidate,
          creatorProfileId: null,
          id: candidate.artistId,
        },
      ],
      [],
      []
    );
    hoisted.txReturningResults.push(
      [
        {
          id: 'created-profile',
          usernameNormalized: 'a_eiqd46x3irj64dlgo8a3glau4',
        },
      ],
      [{ id: candidate.artistId }]
    );

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toMatchObject({ candidates: 1, created: 1 });
    expect(hoisted.getSpotifyArtistsBatch).toHaveBeenCalledWith([
      'spotify-austin',
    ]);
    expect(hoisted.insertedValues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ spotifyId: 'spotify-owner' }),
      ])
    );
  });

  it('reuses one exact-ID claimed profile without creating a duplicate', async () => {
    queueOwnerAndCandidates();
    hoisted.txSelectResults.push(
      [
        {
          ...candidate,
          creatorProfileId: null,
          id: candidate.artistId,
        },
      ],
      [{ id: 'claimed-profile', usernameNormalized: 'austinleeds' }]
    );

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toMatchObject({ created: 0, reused: 1, conflicted: 0 });
    expect(hoisted.txInsert).not.toHaveBeenCalled();
    expect(hoisted.invalidateProfileCache).toHaveBeenCalledWith('austinleeds');
    expect(hoisted.invalidateProfileCache).toHaveBeenCalledWith('owner-handle');
  });

  it('fails closed and reports duplicate exact-ID profile conflicts', async () => {
    queueOwnerAndCandidates();
    hoisted.txSelectResults.push(
      [
        {
          ...candidate,
          creatorProfileId: null,
          id: candidate.artistId,
        },
      ],
      [
        { id: 'profile-one', usernameNormalized: 'one' },
        { id: 'profile-two', usernameNormalized: 'two' },
      ]
    );

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toMatchObject({ created: 0, reused: 0, conflicted: 1 });
    expect(hoisted.txInsert).not.toHaveBeenCalled();
    expect(hoisted.updatedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            publicProfileReconciliation: expect.objectContaining({
              reason: 'duplicate_profiles',
              status: 'conflicted',
            }),
          }),
        }),
      ])
    );
    expect(hoisted.captureWarning).toHaveBeenCalledWith(
      'Credited artist profile identity conflicts detected',
      expect.objectContaining({
        conflicted: 1,
        creatorProfileId: 'owner-profile',
      })
    );
    expect(hoisted.invalidateProfileCache).not.toHaveBeenCalled();
  });

  it('bounds large catalogs and leaves an observable retry receipt', async () => {
    const candidates = Array.from({ length: 25 }, (_, index) => ({
      artistId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      imageUrl: null,
      name: `Artist ${index}`,
      spotifyId: `spotify-${index}`,
    }));
    hoisted.dbSelectResults.push(
      [{ spotifyId: 'spotify-owner', usernameNormalized: 'owner-handle' }],
      candidates
    );
    hoisted.txSelectResults.push([], []);
    for (const creditedArtist of candidates.slice(0, 24)) {
      hoisted.txSelectResults.push([
        {
          ...creditedArtist,
          creatorProfileId: 'existing-profile',
          id: creditedArtist.artistId,
        },
      ]);
    }

    const result = await reconcileCreditedArtistProfiles(
      'owner-profile',
      'spotify-owner'
    );

    expect(result).toMatchObject({
      candidates: 24,
      deferred: true,
      reused: 24,
    });
    expect(hoisted.captureWarning).toHaveBeenCalledWith(
      'Credited artist profile reconciliation was bounded',
      expect.objectContaining({
        creatorProfileId: 'owner-profile',
        limit: 24,
        processed: 24,
      })
    );
  });
});
