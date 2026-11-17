import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  available: vi.fn(),
  bound: vi.fn(),
  albums: vi.fn(),
  upsertRelease: vi.fn(),
  upsertProviderLink: vi.fn(),
  slug: vi.fn(),
  insertValues: vi.fn(),
  library: vi.fn(),
  links: vi.fn(),
  due: vi.fn(),
  selectCalls: 0,
  releaseWhere: undefined as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/dsp-enrichment/providers/apple-music', () => ({
  isAppleMusicAvailable: h.available,
  getArtistAlbums: h.albums,
}));
vi.mock('@/lib/dsp-enrichment/apple-music-target', () => ({
  getBoundAppleMusicArtistId: h.bound,
}));
vi.mock('./queries', () => ({
  upsertRelease: h.upsertRelease,
  upsertProviderLink: h.upsertProviderLink,
}));
vi.mock('./slug', () => ({ generateUniqueSlug: h.slug }));

// Library reads go through select().from().where(): first the releases,
// then their Apple provider links. The sweep adds orderBy().limit().
const selectChain = () => ({
  from: () => ({
    where: (clause: unknown) => {
      h.selectCalls += 1;
      if (h.selectCalls === 1) h.releaseWhere = clause;
      const rows = h.selectCalls === 1 ? h.library() : h.links();
      return Object.assign(Promise.resolve(rows), {
        orderBy: () => ({ limit: async () => h.due() }),
      });
    },
  }),
});

vi.mock('@/lib/db', () => ({
  db: {
    select: () => selectChain(),
    insert: () => ({ values: h.insertValues }),
  },
}));

import {
  importMissingAppleMusicReleases,
  sweepAppleMusicCatalogCompletenessForCron,
} from './apple-music-import';

function clauseText(value: unknown, seen = new Set<object>()): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return '';
  if (seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map(item => clauseText(item, seen)).join(' ');
  }
  const record = value as { name?: unknown; queryChunks?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  return `${name} ${clauseText(record.queryChunks, seen)}`;
}

const profileId = '00000000-0000-4000-8000-000000000001';
const appleAlbum = (id: string, name: string) => ({
  id,
  type: 'albums',
  attributes: {
    name,
    artistName: 'Tim White',
    releaseDate: '2015-08-14',
    trackCount: 4,
    upc: '0859712345678',
    recordLabel: 'TALUS',
    url: `https://music.apple.com/us/album/x/${id}`,
    artwork: { url: 'https://img/{w}x{h}.jpg', width: 3000, height: 3000 },
  },
});

describe('importMissingAppleMusicReleases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.selectCalls = 0;
    h.available.mockReturnValue(true);
    h.bound.mockResolvedValue('859547284');
    h.slug.mockImplementation(async (_p: string, t: string) =>
      t.toLowerCase().replace(/\W+/g, '-')
    );
    h.upsertRelease.mockImplementation(async (i: { slug: string }) => ({
      id: `rel-${i.slug}`,
    }));
    h.insertValues.mockResolvedValue(undefined);
    h.library.mockReturnValue([
      { id: 'r1', title: 'Seaside Heights', upc: null },
    ]);
    h.links.mockReturnValue([]);
  });

  it('treats an Apple album already linked to a release as present', async () => {
    h.library.mockReturnValue([{ id: 'r9', title: 'Renamed', upc: null }]);
    h.links.mockReturnValue([
      {
        releaseId: 'r9',
        url: 'https://music.apple.com/us/album/all-this-noise-ep/1031580711',
      },
    ]);
    h.albums.mockResolvedValue([
      appleAlbum('1031580711', 'All This Noise - EP'),
    ]);
    const result = await importMissingAppleMusicReleases(profileId);
    expect(result.status).toBe('up_to_date');
    expect(h.upsertRelease).not.toHaveBeenCalled();
  });

  it('adds Apple-only releases with an Apple link and records the run', async () => {
    h.albums.mockResolvedValue([
      appleAlbum('1031580711', 'All This Noise - EP'),
      appleAlbum('2', 'Seaside Heights - Single'),
    ]);

    const result = await importMissingAppleMusicReleases(profileId);

    expect(result).toMatchObject({
      status: 'imported',
      albumsScanned: 2,
      imported: ['All This Noise'],
    });
    expect(h.upsertRelease).toHaveBeenCalledTimes(1);
    expect(h.upsertRelease.mock.calls[0][0]).toMatchObject({
      creatorProfileId: profileId,
      title: 'All This Noise',
      releaseType: 'ep',
      label: 'TALUS',
      upc: '0859712345678',
      artworkUrl: 'https://img/1000x1000.jpg',
      sourceType: 'ingested',
    });
    expect(h.upsertRelease.mock.calls[0][0].releaseDate.toISOString()).toBe(
      '2015-08-14T00:00:00.000Z'
    );
    expect(h.upsertProviderLink).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseId: 'rel-all-this-noise',
        providerId: 'apple_music',
        externalId: null,
        metadata: { providerExternalId: '1031580711' },
      })
    );
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        providerId: 'apple_music',
        externalArtistId: '859547284',
        status: 'completed',
        missingCount: 1,
      })
    );
  });

  it('records no authority so the weekly batch can move on', async () => {
    h.bound.mockResolvedValue(null);
    const result = await importMissingAppleMusicReleases(profileId);
    expect(result.status).toBe('no_authority');
    expect(h.albums).not.toHaveBeenCalled();
    expect(h.upsertRelease).not.toHaveBeenCalled();
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        providerId: 'apple_music',
        externalArtistId: 'unbound',
        status: 'failed',
        error: 'no_authority',
        albumsScanned: 0,
      })
    );
  });

  it('matches archived releases so a removed album is not imported again', async () => {
    h.albums.mockResolvedValue([appleAlbum('9', 'Seaside Heights - Single')]);
    await importMissingAppleMusicReleases(profileId);
    const clause = clauseText(h.releaseWhere);
    expect(clause).toMatch(/creator_profile_id/);
    expect(clause).not.toMatch(/deleted_at|deletedAt/);
    expect(h.upsertRelease).not.toHaveBeenCalled();
  });

  it('does nothing when Apple Music is unavailable', async () => {
    h.available.mockReturnValue(false);
    expect((await importMissingAppleMusicReleases(profileId)).status).toBe(
      'unavailable'
    );
    expect(h.bound).not.toHaveBeenCalled();
  });

  it('records a failed run instead of throwing', async () => {
    h.albums.mockRejectedValue(new Error('Apple 503'));
    const result = await importMissingAppleMusicReleases(profileId);
    expect(result).toMatchObject({ status: 'failed', error: 'Apple 503' });
    expect(h.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'Apple 503' })
    );
  });

  it('reports up to date when nothing is missing', async () => {
    h.albums.mockResolvedValue([appleAlbum('2', 'Seaside Heights - Single')]);
    const result = await importMissingAppleMusicReleases(profileId);
    expect(result.status).toBe('up_to_date');
    expect(h.upsertRelease).not.toHaveBeenCalled();
  });
});

describe('sweepAppleMusicCatalogCompletenessForCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.available.mockReturnValue(true);
  });

  it('skips the whole sweep when Apple Music is unavailable', async () => {
    h.available.mockReturnValue(false);
    expect(await sweepAppleMusicCatalogCompletenessForCron()).toEqual({
      profilesChecked: 0,
      releasesImported: 0,
      failed: 0,
    });
    expect(h.due).not.toHaveBeenCalled();
  });
});
