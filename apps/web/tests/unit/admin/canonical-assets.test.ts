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
  throwOnSelect: false,
}));

function thenable(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  };
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: (table: object) => {
        if (state.throwOnSelect) throw new Error('db down');
        // Count queries select `{ value: count() }` — count() is tagged below.
        if (
          fields &&
          typeof fields === 'object' &&
          (fields.value as { __count?: boolean } | undefined)?.__count
        ) {
          const total =
            state.totalsByTable.get(table) ??
            state.rowsByTable.get(table)?.length ??
            0;
          return thenable([{ value: total }]);
        }
        return thenable(state.rowsByTable.get(table) ?? []);
      },
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: [column, value] })),
  ilike: vi.fn((column: unknown, value: unknown) => ({
    ilike: [column, value],
  })),
  inArray: vi.fn((column: unknown, value: unknown) => ({
    inArray: [column, value],
  })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  isNotNull: vi.fn((column: unknown) => ({ isNotNull: column })),
  count: vi.fn(() => ({ __count: true })),
  sql: vi.fn(() => ({ __sql: true })),
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: TABLES.discogReleases,
  discogReleaseTracks: TABLES.discogReleaseTracks,
  discogRecordings: TABLES.discogRecordings,
  providerLinks: TABLES.providerLinks,
}));
vi.mock('@/lib/db/schema/links', () => ({ socialLinks: TABLES.socialLinks }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: TABLES.creatorProfiles,
  profilePhotos: TABLES.profilePhotos,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/sql', () => ({
  escapeLikePattern: vi.fn((value: string) => value),
}));

import { getAdminAssets } from '@/lib/admin/assets';
import { captureError } from '@/lib/error-tracking';

const NOW = new Date('2026-09-28T00:00:00Z');
const EARLIER = new Date('2026-09-01T00:00:00Z');

function seed(rows: {
  releases?: unknown[];
  tracks?: unknown[];
  links?: unknown[];
  photos?: unknown[];
  providerCounts?: unknown[];
}) {
  state.rowsByTable.set(TABLES.discogReleases, rows.releases ?? []);
  state.rowsByTable.set(TABLES.discogReleaseTracks, rows.tracks ?? []);
  state.rowsByTable.set(TABLES.socialLinks, rows.links ?? []);
  state.rowsByTable.set(TABLES.profilePhotos, rows.photos ?? []);
  state.rowsByTable.set(TABLES.providerLinks, rows.providerCounts ?? []);
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.totalsByTable.clear();
  state.throwOnSelect = false;
  vi.clearAllMocks();
});

describe('canonical admin asset library (JOV-6889)', () => {
  it('merges all four asset types, maps issue pills, and sorts by createdAt desc', async () => {
    seed({
      releases: [
        {
          id: 'r1',
          title: 'Zebra EP',
          slug: 'zebra-ep',
          releaseType: 'ep',
          status: 'live',
          artworkUrl: null,
          upc: null,
          totalTracks: 0,
          releaseDate: null,
          deletedAt: null,
          isExplicit: false,
          sourceType: 'ingest',
          createdAt: EARLIER,
          ownerUsername: 'ada',
          ownerDisplayName: 'Ada',
          ownerAvatarUrl: null,
          ownerUserId: 'u1',
          ownerIsVerified: true,
        },
      ],
      tracks: [
        {
          id: 't1',
          title: 'Solo',
          trackNumber: 1,
          isExplicit: true,
          sourceType: 'ingest',
          createdAt: NOW,
          releaseTitle: 'Zebra EP',
          releaseSlug: 'zebra-ep',
          releaseStatus: 'live',
          releaseDeletedAt: null,
          releaseArtworkUrl: 'https://img/art.png',
          recordingIsrc: null,
          recordingDurationMs: null,
          recordingAudioUrl: null,
          recordingPreviewUrl: null,
          ownerUsername: 'ada',
          ownerDisplayName: 'Ada',
          ownerAvatarUrl: null,
          ownerUserId: 'u1',
          ownerIsVerified: true,
        },
      ],
      links: [
        {
          id: 'l1',
          platform: 'instagram',
          url: 'https://instagram.com/ada',
          displayText: null,
          isActive: true,
          state: 'active',
          verificationStatus: 'passed',
          sourceType: 'manual',
          createdAt: NOW,
          ownerUsername: 'ada',
          ownerDisplayName: 'Ada',
          ownerAvatarUrl: null,
          ownerUserId: 'u1',
          ownerIsVerified: true,
        },
      ],
      photos: [
        {
          id: 'ph1',
          title: 'headshot.png',
          photoType: 'avatar',
          status: 'failed',
          blobUrl: null,
          smallUrl: null,
          errorMessage: 'upload failed',
          creatorProfileId: null,
          sourceType: 'upload',
          createdAt: EARLIER,
          ownerUsername: null,
          ownerDisplayName: null,
          ownerAvatarUrl: null,
          ownerUserId: null,
          ownerIsVerified: null,
        },
      ],
    });

    const result = await getAdminAssets({ pageSize: 50 });

    expect(result.total).toBe(4);
    expect(result.assets).toHaveLength(4);
    // created_desc: NOW rows first, EARLIER rows last.
    expect(result.assets.map(a => a.assetType)).toEqual([
      'track',
      'link',
      'release',
      'photo',
    ]);

    const release = result.assets.find(a => a.assetType === 'release');
    expect(release!.issues).toEqual(
      expect.arrayContaining([
        'No artwork',
        'No UPC',
        '0 tracks',
        'No release date',
        'No providers',
      ])
    );
    expect(release!.href).toBe('/ada/zebra-ep');

    const track = result.assets.find(a => a.assetType === 'track');
    expect(track!.issues).toEqual(
      expect.arrayContaining(['No ISRC', 'No duration', 'No audio'])
    );
    expect(track!.subtitle).toBe('Zebra EP · #1');

    const link = result.assets.find(a => a.assetType === 'link');
    expect(link!.title).toBe('instagram');
    expect(link!.issues).toHaveLength(0);

    const photo = result.assets.find(a => a.assetType === 'photo');
    expect(photo!.issues).toEqual(
      expect.arrayContaining(['Failed', 'No file', 'Error', 'No owner'])
    );
    expect(photo!.ownerIsVerified).toBe(false);
  });

  it('counts provider links so healthy releases do not flag "No providers"', async () => {
    seed({
      releases: [
        {
          id: 'r1',
          title: 'Good LP',
          slug: 'good-lp',
          releaseType: 'album',
          status: 'live',
          artworkUrl: 'https://img/a.png',
          upc: '12345',
          totalTracks: 10,
          releaseDate: NOW,
          deletedAt: null,
          isExplicit: false,
          sourceType: 'ingest',
          createdAt: NOW,
          ownerUsername: 'ada',
        },
      ],
      providerCounts: [{ releaseId: 'r1', count: 3 }],
    });

    const { assets } = await getAdminAssets({ type: 'release' });
    expect(assets).toHaveLength(1);
    expect(assets[0].issues).toHaveLength(0);
    expect(assets[0].thumbnailUrl).toBe('https://img/a.png');
  });

  it('restricts to a single type and paginates the merged page', async () => {
    seed({
      links: [
        {
          id: 'l1',
          platform: 'instagram',
          url: 'https://instagram.com/a',
          isActive: true,
          state: 'active',
          verificationStatus: 'passed',
          sourceType: 'manual',
          createdAt: EARLIER,
        },
        {
          id: 'l2',
          platform: 'tiktok',
          url: 'https://tiktok.com/@a',
          isActive: true,
          state: 'active',
          verificationStatus: 'passed',
          sourceType: 'manual',
          createdAt: NOW,
        },
      ],
    });

    const onlyLinks = await getAdminAssets({ type: 'link' });
    expect(onlyLinks.total).toBe(2);
    expect(onlyLinks.assets.every(a => a.assetType === 'link')).toBe(true);

    const pageTwo = await getAdminAssets({
      type: 'link',
      page: 2,
      pageSize: 1,
    });
    expect(pageTwo.assets).toHaveLength(1);
    expect(pageTwo.assets[0].id).toBe('l1');
    expect(pageTwo.page).toBe(2);
  });

  it('orders merged assets by title for title sorts', async () => {
    seed({
      links: [
        {
          id: 'l1',
          platform: 'zzz',
          url: 'https://zzz.example.com',
          isActive: true,
          state: 'active',
          verificationStatus: 'passed',
          sourceType: 'manual',
          createdAt: NOW,
        },
      ],
      photos: [
        {
          id: 'ph1',
          title: 'aaa.png',
          photoType: 'avatar',
          status: 'ready',
          blobUrl: 'https://blob/aaa.png',
          smallUrl: null,
          errorMessage: null,
          creatorProfileId: 'p1',
          sourceType: 'upload',
          createdAt: NOW,
          ownerUsername: 'ada',
        },
      ],
    });

    const asc = await getAdminAssets({ sort: 'title_asc' });
    expect(asc.assets[0].title).toBe('aaa.png');

    const desc = await getAdminAssets({ sort: 'title_desc' });
    expect(desc.assets[0].title).toBe('zzz');
  });

  it('accepts search/issues/verified filters without error', async () => {
    seed({ links: [] });

    const result = await getAdminAssets({
      search: '  ada%_  ',
      issues: 'issues',
      verified: 'unverified',
      sort: 'created_asc',
    });
    expect(result.assets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('fails soft with an empty result when a source read throws', async () => {
    state.throwOnSelect = true;

    const result = await getAdminAssets();
    expect(result).toEqual({ assets: [], page: 1, pageSize: 20, total: 0 });
    expect(captureError).toHaveBeenCalledWith(
      'Error loading admin asset library',
      expect.any(Error),
      expect.objectContaining({ page: 1, pageSize: 20 })
    );
  });
});
