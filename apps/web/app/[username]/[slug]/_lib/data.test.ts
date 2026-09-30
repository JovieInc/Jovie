import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  column: vi.fn(),
  cache: vi.fn(),
  entitlements: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('next/cache', () => ({ unstable_cache: mocks.cache }));
vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  doesColumnExist: mocks.column,
  withRetry: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/entitlements/creator-plan', () => ({
  getCreatorEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: mocks.error } }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mocks.warning }));

import {
  checkPromoDownloads,
  getContentBySlug,
  getCreatorByUsername,
  getCreatorPlan,
  getReleaseTrackList,
  getTrackBySlugInRelease,
  getUnpublishedReleasePresence,
  groupReleaseCredits,
} from './data';

// Model the async query boundary while keeping real Drizzle predicates and
// all mapping, publication, cache, and fallback behavior under test.
const predicates: SQL[] = [];
function queries(...results: Array<unknown[] | Error>) {
  for (const result of results) {
    mocks.select.mockImplementationOnce(() => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: (predicate: SQL) => {
          predicates.push(predicate);
          return query;
        },
        limit: () => query,
        orderBy: () => query,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown
        ) =>
          (result instanceof Error
            ? Promise.reject(result)
            : Promise.resolve(result)
          ).then(resolve, reject),
      };
      return query;
    });
  }
}
const release = {
  id: 'release-1',
  title: 'Album',
  slug: 'album',
  artworkUrl: 'https://example.com/art.jpg',
  releaseDate: new Date('2026-01-01'),
  revealDate: new Date('2025-12-01'),
  releaseType: 'album',
  totalTracks: 2,
  metadata: { artworkSizes: { small: 'https://example.com/small.jpg' } },
  upc: '1234',
};
const spotify = {
  providerId: 'spotify',
  url: 'https://open.spotify.com/track/1',
  isPrimary: true,
};
const apple = {
  providerId: 'apple_music',
  url: 'https://music.apple.com/song/1',
};
const recording = {
  id: 'recording-1',
  title: 'Song',
  slug: 'song',
  previewUrl: 'https://example.com/preview.mp3',
  durationMs: 123000,
  isrc: 'TEST0001',
};
const credit = {
  artistId: 'artist-1',
  artistName: 'Artist',
  creditName: null,
  handle: 'testartist',
  role: 'main_artist' as const,
  position: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  predicates.length = 0;
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
  mocks.cache.mockImplementation((fn: () => unknown) => fn);
  mocks.column.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('published smart-link content', () => {
  it('returns release metadata, earliest preview and canonical credits with rehydrated dates', async () => {
    queries(
      [release],
      [spotify],
      [credit],
      [{ previewUrl: recording.previewUrl, isrc: recording.isrc }]
    );
    const result = await getContentBySlug('profile-1', 'album');
    expect(result).toMatchObject({
      type: 'release',
      id: 'release-1',
      releaseDate: release.releaseDate,
      revealDate: release.revealDate,
      artworkSizes: release.metadata.artworkSizes,
      providerLinks: [spotify],
      previewUrl: recording.previewUrl,
      isrc: recording.isrc,
      primaryArtists: [
        { name: 'Artist', handle: 'testartist', role: 'main_artist' },
      ],
    });
    const sql = new PgDialect().sqlToQuery(predicates[0]);
    expect(sql.params).toEqual(
      expect.arrayContaining(['profile-1', 'album', 'draft'])
    );
    expect(sql.sql).toContain('"creator_profile_id"');
    expect(sql.sql).toContain('"deleted_at" is null');
    expect(sql.sql).toContain('"artwork_url"');
  });

  it('returns a recording through its published parent and scoped provider links', async () => {
    queries(
      [],
      [recording],
      [{ id: 'rt-1', releaseId: 'release-1', trackNumber: 2 }],
      [release],
      [spotify],
      [credit]
    );
    expect(await getContentBySlug('profile-1', 'song')).toMatchObject({
      type: 'track',
      id: 'recording-1',
      releaseId: 'release-1',
      releaseSlug: 'album',
      releaseTitle: 'Album',
      trackNumber: 2,
      durationMs: 123000,
      releaseDate: release.releaseDate,
      providerLinks: [spotify],
    });
    const parentFilter = new PgDialect().sqlToQuery(predicates[2]);
    expect(parentFilter.params).toContain('recording-1');
    expect(parentFilter.sql).toContain('"deleted_at" is null');
  });

  it('hides an orphan recording instead of exposing it without a public release', async () => {
    queries([], [recording], [], [credit]);
    expect(await getContentBySlug('profile-1', 'song')).toBeNull();
  });

  it('hides recording content without provider destinations', async () => {
    queries(
      [],
      [recording],
      [{ id: 'rt-1', releaseId: 'release-1' }],
      [release],
      [],
      []
    );
    expect(await getContentBySlug('profile-1', 'song')).toBeNull();
  });

  it('serves legacy tracks only when a public parent and destinations exist', async () => {
    const track = { ...recording, id: 'legacy-1', releaseId: 'release-1' };
    queries([], [], [track], [release], [spotify]);
    expect(await getContentBySlug('profile-1', 'song')).toMatchObject({
      id: 'legacy-1',
      type: 'track',
      releaseSlug: 'album',
      releaseDate: release.releaseDate,
      providerLinks: [spotify],
      previewMetadata: null,
    });
    queries([], [], [track], [], [spotify]);
    expect(await getContentBySlug('profile-1', 'song')).toBeNull();
  });

  it('returns null for absent content and reports query errors without throwing to the page', async () => {
    queries([], [], [], new Error('query failed'));
    expect(await getContentBySlug('profile-1', 'missing')).toBeNull();
    expect(await getContentBySlug('profile-1', 'failed')).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to load smart-link content',
      expect.objectContaining({
        creatorProfileId: 'profile-1',
        slug: 'failed',
      }),
      'public-smart-link'
    );
  });

  it('uses invalidatable production content and creator caches and fails soft if the cache fails', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    queries(
      [release],
      [spotify],
      [],
      [],
      [{ id: 'profile-1', isClaimed: false }]
    );
    expect((await getContentBySlug('profile-1', 'album'))?.releaseDate).toEqual(
      release.releaseDate
    );
    expect(mocks.cache).toHaveBeenCalledWith(
      expect.any(Function),
      ['smartlink-content-profile-1-album'],
      {
        tags: [
          'smartlink-content',
          'smartlink-content:profile-1',
          'smartlink-content:profile-1:album',
        ],
        revalidate: 300,
      }
    );
    expect(await getCreatorByUsername('testartist')).toMatchObject({
      id: 'profile-1',
      isClaimed: false,
    });
    expect(mocks.cache).toHaveBeenCalledWith(
      expect.any(Function),
      ['smartlink-creator-testartist'],
      expect.objectContaining({ revalidate: 3600 })
    );
    mocks.cache.mockImplementation(() => async () => {
      throw new Error('cache failed');
    });
    expect(await getContentBySlug('profile-1', 'album')).toBeNull();
    expect(await getCreatorByUsername('testartist')).toBeNull();
  });
});

describe('release-scoped track lookup', () => {
  const rt = {
    id: 'rt-1',
    recordingId: 'recording-1',
    title: 'Release edit',
    slug: 'song',
    trackNumber: 2,
  };
  it('merges missing legacy providers without replacing the canonical release-track link', async () => {
    queries(
      [rt],
      [recording],
      [release],
      [spotify],
      [{ id: 'legacy-1' }],
      [credit],
      [{ ...spotify, url: 'https://open.spotify.com/legacy' }, apple]
    );
    expect(await getTrackBySlugInRelease('release-1', 'song')).toMatchObject({
      id: 'recording-1',
      title: 'Release edit',
      trackNumber: 2,
      durationMs: 123000,
      releaseTitle: 'Album',
      providerLinks: [spotify, apple],
    });
    expect(new PgDialect().sqlToQuery(predicates[0]).params).toEqual([
      'release-1',
      'song',
    ]);
  });

  it.each(['parent', 'links'])(
    'hides a release track with missing %s',
    async missing => {
      queries(
        [rt],
        [recording],
        missing === 'parent' ? [] : [release],
        missing === 'links' ? [] : [spotify],
        [],
        []
      );
      expect(await getTrackBySlugInRelease('release-1', 'song')).toBeNull();
    }
  );

  it('falls back to recording title when the release track has no override', async () => {
    queries(
      [{ ...rt, title: null, slug: null }],
      [recording],
      [release],
      [spotify],
      [],
      []
    );
    expect(await getTrackBySlugInRelease('release-1', 'song')).toMatchObject({
      title: 'Song',
      slug: 'song',
      providerLinks: [spotify],
    });
  });

  it('supports legacy-only tracks but rejects unpublished parents', async () => {
    queries([], [recording], [release], [spotify]);
    expect(await getTrackBySlugInRelease('release-1', 'song')).toMatchObject({
      id: 'recording-1',
      releaseId: 'release-1',
      providerLinks: [spotify],
      isrc: null,
    });
    queries([], [recording], [], [spotify]);
    expect(await getTrackBySlugInRelease('release-1', 'song')).toBeNull();
  });

  it('fails soft for missing tracks and storage failures', async () => {
    queries([], [], new Error('storage down'));
    expect(await getTrackBySlugInRelease('release-1', 'missing')).toBeNull();
    expect(await getTrackBySlugInRelease('release-1', 'error')).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to load smart-link track',
      expect.objectContaining({ releaseId: 'release-1', trackSlug: 'error' }),
      'public-smart-link'
    );
  });
});

describe('public release supporting contracts', () => {
  it('deduplicates credits by identity within each role and omits blank names', () => {
    const result = groupReleaseCredits([
      credit,
      credit,
      { ...credit, role: 'producer' },
      { ...credit, artistId: '', artistName: '   ' },
      { ...credit, artistId: '', spotifyId: 'provider-1', role: 'with' },
      { ...credit, artistId: '', spotifyId: 'provider-1', role: 'vs' },
    ]);
    expect(result.map(group => group.role)).toEqual([
      'main_artist',
      'producer',
      'other',
    ]);
    expect(result.map(group => group.entries.length)).toEqual([1, 1, 1]);
  });

  it('omits tracks without routable slugs and preserves title fallback and duration', async () => {
    queries([
      { slug: null },
      {
        slug: 'one',
        releaseTrackTitle: 'Edit',
        recordingTitle: 'Recording',
        trackNumber: 1,
        durationMs: 1000,
      },
      {
        slug: 'two',
        releaseTrackTitle: null,
        recordingTitle: 'Recording',
        trackNumber: 2,
        durationMs: null,
      },
    ]);
    expect(await getReleaseTrackList('release-1')).toEqual([
      { slug: 'one', title: 'Edit', trackNumber: 1, durationMs: 1000 },
      { slug: 'two', title: 'Recording', trackNumber: 2, durationMs: null },
    ]);
  });

  it('reveals only the title for unreleased presence and supports an explicit throw-on-error caller', async () => {
    queries(
      [{ title: 'Hidden album', status: 'draft', privateField: 'not public' }],
      [],
      new Error('soft error'),
      new Error('strict error')
    );
    expect(await getUnpublishedReleasePresence('profile-1', 'album')).toEqual({
      title: 'Hidden album',
    });
    expect(new PgDialect().sqlToQuery(predicates[0]).sql).toContain(
      '"deleted_at" is null'
    );
    expect(
      await getUnpublishedReleasePresence('profile-1', 'absent')
    ).toBeNull();
    expect(
      await getUnpublishedReleasePresence('profile-1', 'error')
    ).toBeNull();
    await expect(
      getUnpublishedReleasePresence('profile-1', 'error', { onError: 'throw' })
    ).rejects.toThrow('strict error');
  });

  it('fails closed for creator entitlements and promo downloads', async () => {
    mocks.entitlements
      .mockResolvedValueOnce({
        entitlements: { booleans: { canAccessFutureReleases: true } },
      })
      .mockRejectedValueOnce(new Error('entitlements down'));
    expect(await getCreatorPlan('profile-1')).toEqual({
      canAccessFutureReleases: true,
    });
    expect(await getCreatorPlan('profile-1')).toEqual({
      canAccessFutureReleases: false,
    });
    queries([{ id: 'download-1' }], [], new Error('downloads down'));
    expect(await checkPromoDownloads('release-1', 'artist', 'album')).toBe(
      '/artist/album/download'
    );
    expect(
      await checkPromoDownloads('release-1', 'artist', 'album')
    ).toBeNull();
    expect(
      await checkPromoDownloads('release-1', 'artist', 'album')
    ).toBeNull();
  });
});
