import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unit coverage for the JOV-6528 handle-selection wiring in
// collaborator-profile-reconciliation.ts. The DB access is mocked at the
// module boundary; assertions target the new friendly-handle selection and
// opaque-fallback behavior inside reconcileCandidate via the exported
// reconcileCreditedArtistProfiles entry point.
vi.mock('server-only', () => ({}));

type Row = Record<string, unknown>;

const hoisted = vi.hoisted(() => ({
  selectResults: [] as Row[][],
  insertedProfiles: [] as Row[],
  updatedArtists: [] as Row[],
}));

const chainState = vi.hoisted(() => ({ call: 0 }));

function nextSelectResult(): Row[] {
  const result = hoisted.selectResults[chainState.call] ?? [];
  chainState.call += 1;
  return result;
}

function selectBuilder() {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.innerJoin = () => builder;
  builder.leftJoin = () => builder;
  builder.where = () => builder;
  builder.orderBy = () => builder;
  builder.limit = () => nextSelectResult();
  builder.for = () => builder;
  builder.then = (
    resolve: (value: Row[]) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(nextSelectResult()).then(resolve, reject);
  return builder;
}

vi.mock('@/lib/db', () => ({
  db: {
    selectDistinct: () => selectBuilder(),
    select: () => selectBuilder(),
  },
}));

vi.mock('drizzle-orm', () => {
  const passthrough = (value: unknown) => value;
  return {
    and: (...args: unknown[]) => args,
    eq: (column: unknown, value: unknown) => ({ column, value }),
    ne: (column: unknown, value: unknown) => ({ column, value, op: 'ne' }),
    inArray: (column: unknown, values: unknown) => ({ column, values }),
    isNotNull: passthrough,
    isNull: passthrough,
    or: passthrough,
    sql: Object.assign((strings: unknown) => strings, { raw: passthrough }),
  };
});

vi.mock('@/lib/db/schema/content', () => ({
  artists: { _: { name: 'artists' } },
  discogReleases: { _: { name: 'discogReleases' } },
  releaseArtists: { _: { name: 'releaseArtists' } },
}));
vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: { _: { name: 'socialLinks' } },
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { _: { name: 'creatorProfiles' } },
}));
vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn(async () => undefined),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(async () => undefined),
}));
vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: async (op: (tx: unknown) => unknown) =>
    op(mockTx),
}));
vi.mock('@/lib/profile/public-release-eligibility', () => ({
  publicReleaseEligibilitySqlPredicate: () => 'eligible',
}));
vi.mock('@/lib/profile/spotify-profile-identity', () => ({
  lockSpotifyProfileIdentity: vi.fn(async () => undefined),
}));
vi.mock('@/lib/profile/unclaimed-artist-profile', () => ({
  buildStructuredCreditProfileMarker: (params: Record<string, string>) => ({
    state: 'unclaimed',
    ...params,
  }),
}));
vi.mock('@/lib/spotify', () => ({
  buildSpotifyArtistUrl: (id: string) =>
    `https://open.spotify.com/artist/${id}`,
  getSpotifyArtistsBatch: vi.fn(async (ids: readonly string[]) =>
    ids.map(id => ({ id, name: 'Fedde Le Grand' }))
  ),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let mockTx: Record<string, unknown>;

import { reconcileCreditedArtistProfiles } from '@/lib/discography/collaborator-profile-reconciliation';
import { isEncodedUnclaimedArtistHandle } from '@/lib/profile/opaque-internal-profile-handle';

const OWNER_PROFILE_ID = 'owner-profile-1';
const OWNER_SPOTIFY_ID = 'sp-owner';
const ARTIST_ID = 'f5441adb-6789-449a-9553-ab7460c9c61c';
const ARTIST_SPOTIFY_ID = 'sp-fedde';

/**
 * Select-call order for a created outcome:
 *  0. db owner lookup (reconcileCreditedArtistProfiles)
 *  1. tx owner exact-profile check (bindOwnerRegistryArtist)
 *  2. tx owner registry-binding check (bindOwnerRegistryArtist)
 *  3. db.selectDistinct credited-artist candidates
 *  4. tx artist lock select
 *  5. tx exact-ID profiles
 *  6. tx friendly-candidate taken batch (JOV-6528)
 *  7. tx chosen-handle owner
 */
function seedCreatedPath(friendlyTaken: Row[]) {
  hoisted.selectResults = [
    [{ id: OWNER_PROFILE_ID, usernameNormalized: 'owner-handle' }],
    [],
    [],
    [
      {
        artistId: ARTIST_ID,
        name: 'Fedde Le Grand',
        spotifyId: ARTIST_SPOTIFY_ID,
        imageUrl: null,
      },
    ],
    [
      {
        id: ARTIST_ID,
        creatorProfileId: null,
        name: 'Fedde Le Grand',
        spotifyId: ARTIST_SPOTIFY_ID,
        imageUrl: null,
        metadata: null,
      },
    ],
    [],
    friendlyTaken,
    [],
  ];
}

describe('reconcileCandidate handle selection (JOV-6528)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainState.call = 0;
    hoisted.insertedProfiles = [];
    hoisted.updatedArtists = [];

    mockTx = {
      select: () => selectBuilder(),
      insert: (table: { _: { name: string } }) => ({
        values: (values: Row) => ({
          returning: () => {
            if (table._.name === 'creatorProfiles') {
              hoisted.insertedProfiles.push(values);
              return Promise.resolve([
                { id: 'new-profile-1', usernameNormalized: values.username },
              ]);
            }
            return Promise.resolve([{ id: 'ignored' }]);
          },
          onConflictDoNothing: () => Promise.resolve(),
          then: (resolve: (value: Row[]) => unknown) =>
            Promise.resolve([{ id: 'ignored' }]).then(resolve),
        }),
      }),
      update: (table: { _: { name: string } }) => ({
        set: (values: Row) => {
          const builder: Record<string, unknown> = {};
          builder.where = () => builder;
          builder.returning = () => {
            if (table._.name === 'artists') hoisted.updatedArtists.push(values);
            return Promise.resolve([{ id: ARTIST_ID }]);
          };
          builder.then = (resolve: (value: undefined) => unknown) =>
            Promise.resolve(undefined).then(resolve);
          return builder;
        },
      }),
    };
  });

  it('reserves a friendly composed handle for a new credited artist', async () => {
    seedCreatedPath([]);

    const result = await reconcileCreditedArtistProfiles(
      OWNER_PROFILE_ID,
      OWNER_SPOTIFY_ID
    );

    expect(result.created).toBe(1);
    const inserted = hoisted.insertedProfiles[0];
    expect(inserted).toBeDefined();
    const handle = inserted.username as string;
    expect(handle).toBe('feddelegrand');
    expect(isEncodedUnclaimedArtistHandle(handle)).toBe(false);
  });

  it('falls back to the deterministic a_* handle only when friendly forms are taken', async () => {
    seedCreatedPath([
      { usernameNormalized: 'feddelegrand' },
      { usernameNormalized: 'fedde' },
    ]);

    const result = await reconcileCreditedArtistProfiles(
      OWNER_PROFILE_ID,
      OWNER_SPOTIFY_ID
    );

    expect(result.created).toBe(1);
    const handle = hoisted.insertedProfiles[0]?.username as string;
    expect(isEncodedUnclaimedArtistHandle(handle)).toBe(true);
  });
});
