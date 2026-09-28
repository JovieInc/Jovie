import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TABLES = vi.hoisted(() => ({
  discogReleases: { __table: 'discog_releases' },
  discogReleaseTracks: { __table: 'discog_release_tracks' },
  discogRecordings: { __table: 'discog_recordings' },
  providerLinks: { __table: 'provider_links' },
  socialLinks: { __table: 'social_links' },
  creatorProfiles: { __table: 'creator_profiles' },
  profilePhotos: { __table: 'profile_photos' },
}));

const state = vi.hoisted(() => ({
  rowsByTable: new Map<object, unknown[]>(),
  totalsByTable: new Map<object, number>(),
  providerCounts: [] as { releaseId: string; count: number }[],
  selectError: null as Error | null,
}));

function thenable(resolve: () => unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    'innerJoin',
    'leftJoin',
    'where',
    'orderBy',
    'groupBy',
    'limit',
  ]) {
    chain[method] = () => chain;
  }
  chain.then = (fn: (value: unknown[]) => unknown) => {
    if (state.selectError) throw state.selectError;
    return fn(resolve());
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (cols: Record<string, unknown>) => ({
      from: (table: object) => {
        if ('value' in cols) {
          const total =
            state.totalsByTable.get(table) ??
            state.rowsByTable.get(table)?.length ??
            0;
          return thenable(() => [{ value: total }]);
        }
        if ('count' in cols) {
          return thenable(() => state.providerCounts);
        }
        return thenable(() => state.rowsByTable.get(table) ?? []);
      },
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  count: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: TABLES.discogReleases,
  discogReleaseTracks: TABLES.discogReleaseTracks,
  discogRecordings: TABLES.discogRecordings,
  providerLinks: TABLES.providerLinks,
}));
vi.mock('@/lib/db/schema/links', () => ({
  socialLinks: TABLES.socialLinks,
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: TABLES.creatorProfiles,
  profilePhotos: TABLES.profilePhotos,
}));

const captureError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/error-tracking', () => ({ captureError }));

import { getAdminAssets } from '@/lib/admin/assets';

const NOW = new Date('2026-09-28T00:00:00Z');
const OLDER = new Date('2026-09-01T00:00:00Z');

const owner = {
  ownerUsername: 'ada',
  ownerDisplayName: 'Ada',
  ownerAvatarUrl: 'https://img/ada.png',
  ownerUserId: 'u1',
  ownerIsVerified: true,
};

const releaseRow = (o: Record<string, unknown> = {}) => ({
  id: 'rel-1',
  title: 'Zeta EP',
  slug: 'zeta-ep',
  releaseType: 'ep',
  status: 'live',
  artworkUrl: 'https://img/art.png',
  upc: '12345',
  totalTracks: 3,
  releaseDate: NOW,
  deletedAt: null,
  isExplicit: false,
  sourceType: 'manual',
  createdAt: NOW,
  ...owner,
  ...o,
});

const trackRow = (o: Record<string, unknown> = {}) => ({
  id: 'trk-1',
  title: 'Alpha Song',
  trackNumber: 1,
  isExplicit: false,
  sourceType: 'manual',
  createdAt: OLDER,
  releaseTitle: 'Zeta EP',
  releaseSlug: 'zeta-ep',
  releaseStatus: 'live',
  releaseDeletedAt: null,
  releaseArtworkUrl: 'https://img/art.png',
  recordingIsrc: 'USABC123',
  recordingDurationMs: 180000,
  recordingAudioUrl: 'https://audio/a.mp3',
  recordingPreviewUrl: null,
  ...owner,
  ...o,
});

const linkRow = (o: Record<string, unknown> = {}) => ({
  id: 'lnk-1',
  platform: 'instagram',
  url: 'https://instagram.com/ada',
  displayText: '@ada',
  isActive: true,
  state: 'active',
  verificationStatus: 'verified',
  sourceType: 'claimed',
  createdAt: NOW,
  ...owner,
  ...o,
});

const photoRow = (o: Record<string, unknown> = {}) => ({
  id: 'ph-1',
  title: 'press.png',
  photoType: 'press',
  status: 'ready',
  blobUrl: 'https://blob/press.png',
  smallUrl: 'https://blob/press-small.png',
  errorMessage: null,
  creatorProfileId: 'cp-1',
  sourceType: 'upload',
  createdAt: NOW,
  ...owner,
  ...o,
});

function seed(rows: {
  releases?: unknown[];
  tracks?: unknown[];
  links?: unknown[];
  photos?: unknown[];
}) {
  state.rowsByTable.set(TABLES.discogReleases, rows.releases ?? []);
  state.rowsByTable.set(TABLES.discogReleaseTracks, rows.tracks ?? []);
  state.rowsByTable.set(TABLES.socialLinks, rows.links ?? []);
  state.rowsByTable.set(TABLES.profilePhotos, rows.photos ?? []);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.totalsByTable.clear();
  state.providerCounts = [{ releaseId: 'rel-1', count: 2 }];
  state.selectError = null;
});

describe('getAdminAssets (JOV-6889)', () => {
  it('merges all four asset types into one sorted page', async () => {
    seed({
      releases: [releaseRow()],
      tracks: [trackRow()],
      links: [linkRow()],
      photos: [photoRow()],
    });

    const result = await getAdminAssets({ pageSize: 10 });

    expect(result.total).toBe(4);
    expect(result.assets).toHaveLength(4);
    expect(result.assets.map(a => a.assetType).sort()).toEqual([
      'link',
      'photo',
      'release',
      'track',
    ]);
  });

  it('surfaces data-quality issue pills per asset type', async () => {
    seed({
      releases: [
        releaseRow({
          id: 'rel-bad',
          artworkUrl: null,
          upc: null,
          totalTracks: 0,
          releaseDate: null,
          deletedAt: NOW,
        }),
      ],
      tracks: [
        trackRow({
          id: 'trk-bad',
          recordingIsrc: null,
          recordingDurationMs: null,
          recordingAudioUrl: null,
          releaseDeletedAt: NOW,
        }),
      ],
      links: [
        linkRow({
          id: 'lnk-bad',
          isActive: false,
          state: 'rejected',
          verificationStatus: 'failed',
        }),
      ],
      photos: [
        photoRow({
          id: 'ph-bad',
          status: 'processing',
          blobUrl: null,
          errorMessage: 'boom',
          creatorProfileId: null,
        }),
      ],
    });
    state.providerCounts = [];

    const { assets } = await getAdminAssets({ pageSize: 10 });
    const byType = Object.fromEntries(assets.map(a => [a.assetType, a]));

    expect(byType.release.issues).toEqual(
      expect.arrayContaining([
        'No artwork',
        'No UPC',
        '0 tracks',
        'No release date',
        'Deleted',
        'No providers',
      ])
    );
    expect(byType.track.issues).toEqual(
      expect.arrayContaining([
        'No ISRC',
        'No duration',
        'No audio',
        'Deleted release',
      ])
    );
    expect(byType.link.issues).toEqual(
      expect.arrayContaining(['Inactive', 'Rejected', 'Verification failed'])
    );
    expect(byType.photo.issues).toEqual(
      expect.arrayContaining(['Status: processing', 'No file', 'Error'])
    );
    expect(byType.photo.issues).toContain('No owner');
  });

  it('respects the type filter and ownership provenance', async () => {
    seed({
      releases: [releaseRow()],
      links: [linkRow()],
    });

    const { assets, total } = await getAdminAssets({
      type: 'release',
      pageSize: 10,
    });

    expect(total).toBe(1);
    expect(assets).toHaveLength(1);
    expect(assets[0].assetType).toBe('release');
    expect(assets[0].href).toBe('/ada/zeta-ep');
    expect(assets[0].ownerUsername).toBe('ada');
    expect(assets[0].ownerIsVerified).toBe(true);
  });

  it('paginates the merged result deterministically by created_at', async () => {
    seed({
      releases: [
        releaseRow({ id: 'rel-old', createdAt: OLDER }),
        releaseRow({ id: 'rel-new', createdAt: NOW }),
      ],
      photos: [photoRow({ id: 'ph-mid', createdAt: new Date('2026-09-15') })],
    });

    const page1 = await getAdminAssets({ page: 1, pageSize: 2 });
    const page2 = await getAdminAssets({ page: 2, pageSize: 2 });

    expect(page1.total).toBe(3);
    expect(page1.assets.map(a => a.id)).toEqual(['rel-new', 'ph-mid']);
    expect(page2.assets.map(a => a.id)).toEqual(['rel-old']);
  });

  it('orders by title when title sort is requested', async () => {
    seed({
      links: [
        linkRow({ id: 'l-b', displayText: 'Beta', createdAt: NOW }),
        linkRow({ id: 'l-a', displayText: 'Alpha', createdAt: OLDER }),
      ],
    });

    const asc = await getAdminAssets({ type: 'link', sort: 'title_asc' });
    expect(asc.assets.map(a => a.id)).toEqual(['l-a', 'l-b']);

    const desc = await getAdminAssets({ type: 'link', sort: 'title_desc' });
    expect(desc.assets.map(a => a.id)).toEqual(['l-b', 'l-a']);
  });

  it('normalizes invalid filters and clamps pagination', async () => {
    seed({ links: [linkRow()] });

    const result = await getAdminAssets({
      page: -5,
      pageSize: 10000,
      sort: 'bogus' as never,
      issues: 'bogus' as never,
      verified: 'bogus' as never,
      search: '   ',
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(result.assets).toHaveLength(1);
  });

  it('marks orphaned photos unverified with no owner', async () => {
    seed({
      photos: [
        photoRow({
          ownerUsername: null,
          ownerDisplayName: null,
          ownerAvatarUrl: null,
          ownerUserId: null,
          ownerIsVerified: null,
        }),
      ],
    });

    const { assets } = await getAdminAssets({
      type: 'photo',
      verified: 'unverified',
    });
    expect(assets[0].ownerUsername).toBeNull();
    expect(assets[0].ownerIsVerified).toBe(false);
  });

  it('fails soft and reports when a source query throws', async () => {
    state.selectError = new Error('db down');
    seed({});

    const result = await getAdminAssets();
    expect(result).toEqual({ assets: [], page: 1, pageSize: 20, total: 0 });
    expect(captureError).toHaveBeenCalledWith(
      'Error loading admin asset library',
      state.selectError,
      expect.objectContaining({ page: 1 })
    );
  });
});
