import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectSitemapInventoryViolations,
  type SitemapManifestRoute,
} from '@/lib/seo/sitemap-publication';

vi.mock('next/cache', () => ({
  unstable_cache: (callback: () => Promise<unknown>) => callback,
}));

vi.mock('@/constants/app', () => ({
  BASE_URL: 'https://jov.ie',
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    DATABASE_URL: 'postgres://test',
  },
}));

const getBlogPosts = vi.fn();
vi.mock('@/lib/blog/getBlogPosts', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/blog/getBlogPosts')>();
  return {
    getBlogPosts,
    slugifyCategory: actual.slugifyCategory,
  };
});

const getChangelogReleases = vi.fn();
vi.mock('@/lib/changelog-source', () => ({ getChangelogReleases }));

const queryMock = vi.fn();
const whereMock = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([]));
const innerJoinMock = vi.fn(() => ({
  innerJoin: innerJoinMock,
  leftJoin: leftJoinMock,
  where: whereMock,
}));
const leftJoinMock = vi.fn(() => ({
  innerJoin: innerJoinMock,
  leftJoin: leftJoinMock,
  where: whereMock,
}));
const fromMock = vi.fn(() => ({
  where: whereMock,
  innerJoin: innerJoinMock,
  leftJoin: leftJoinMock,
}));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    slug: 'slug',
    updatedAt: 'updatedAt',
    artworkUrl: 'artworkUrl',
    creatorProfileId: 'creatorProfileId',
    deletedAt: 'deletedAt',
    id: 'id',
    releaseDate: 'releaseDate',
    revealDate: 'revealDate',
    status: 'status',
  },
  discogRecordings: {
    slug: 'slug',
    updatedAt: 'updatedAt',
    creatorProfileId: 'creatorProfileId',
    id: 'id',
  },
  discogReleaseTracks: {
    releaseId: 'releaseId',
    recordingId: 'recordingId',
  },
  providerLinks: {
    ownerType: 'ownerType',
    releaseId: 'releaseId',
    url: 'url',
  },
}));

vi.mock('@/lib/db/schema/playlists', () => ({
  joviePlaylists: {
    slug: 'slug',
    title: 'title',
    coverImageUrl: 'coverImageUrl',
    trackCount: 'trackCount',
    updatedAt: 'updatedAt',
    status: 'status',
    publishedAt: 'publishedAt',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    email: 'email',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    username: 'username',
    usernameNormalized: 'usernameNormalized',
    updatedAt: 'updatedAt',
    avatarUrl: 'avatarUrl',
    isClaimed: 'isClaimed',
    isPublic: 'isPublic',
    displayName: 'displayName',
    settings: 'settings',
    id: 'id',
    userId: 'userId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: queryMock,
  eq: queryMock,
  isNotNull: queryMock,
  isNull: queryMock,
  ne: queryMock,
  or: queryMock,
  sql: queryMock,
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
}));

describe('sitemap', () => {
  beforeEach(() => {
    getChangelogReleases.mockResolvedValue([
      {
        version: '26.8.0',
        date: '2026-08-14',
        summary: 'A concise release.',
        sections: {
          featured: [],
          added: [],
          changed: [],
          fixed: [],
          removed: [],
        },
      },
    ]);
  });

  it('returns marketing, blog, profile, release, and deduplicated track URLs', async () => {
    getBlogPosts.mockResolvedValue([
      {
        slug: 'hello-world',
        title: 'Hello World',
        date: '2026-01-01',
        author: 'Tim',
        authorUsername: 'tim',
        category: 'Test',
        tags: [],
        excerpt: 'Test',
        readingTime: 3,
        wordCount: 714,
      },
    ]);

    whereMock
      .mockResolvedValueOnce([
        {
          username: 'tim',
          displayName: 'Tim White',
          updatedAt: new Date('2026-01-01'),
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'tim',
          slug: 'album',
          updatedAt: new Date('2026-01-02'),
          artworkUrl: 'https://cdn.example.com/art.jpg',
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'tim',
          slug: 'album',
          updatedAt: new Date('2026-01-03'),
        },
        {
          username: 'tim',
          slug: 'single',
          updatedAt: new Date('2026-01-04'),
        },
      ])
      // playlists query
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.map(entry => entry.url)).toEqual(
      expect.arrayContaining([
        'https://jov.ie',
        'https://jov.ie/blog',
        'https://jov.ie/developers',
        'https://jov.ie/cli',
        'https://jov.ie/api-versioning',
        'https://jov.ie/openapi.json',
        'https://jov.ie/llms.txt',
        'https://jov.ie/llms-full.txt',
        'https://jov.ie/blog/hello-world',
        'https://jov.ie/changelog/26.8.0',
        'https://jov.ie/engineering',
        'https://jov.ie/legal/privacy',
        'https://jov.ie/legal/terms',
        'https://jov.ie/legal/cookies',
        'https://jov.ie/legal/dmca',
        'https://jov.ie/artist-profiles',
        'https://jov.ie/youtube-thumbnails',
        'https://jov.ie/tim',
        'https://jov.ie/tim/album',
        'https://jov.ie/tim/single',
      ])
    );

    const albumMatches = entries.filter(
      entry => entry.url === 'https://jov.ie/tim/album'
    );
    expect(albumMatches).toHaveLength(1);

    for (const blockedUrl of [
      'https://jov.ie/demo',
      'https://jov.ie/sandbox',
      'https://jov.ie/spinner-test',
      'https://jov.ie/sentry-example-page',
      'https://jov.ie/ui/buttons',
      'https://jov.ie/hud',
      'https://jov.ie/investor-portal',
      'https://jov.ie/api/v1',
      'https://jov.ie/engineering/preview',
      'https://jov.ie/engineering/preview/verified-changelog',
      'https://jov.ie/engineering/verified-changelog',
      'https://jov.ie/new',
      'https://jov.ie/artist-profile',
      'https://jov.ie/voice',
      'https://jov.ie/waitlist',
      'https://jov.ie/ai',
      'https://jov.ie/renders',
      'https://jov.ie/product',
      'https://jov.ie/solutions',
      'https://jov.ie/music',
      'https://jov.ie/shows',
      'https://jov.ie/you',
      'https://jov.ie/privacy',
      'https://jov.ie/terms',
    ]) {
      expect(entries.map(entry => entry.url)).not.toContain(blockedUrl);
    }

    const inventoryViolations = collectSitemapInventoryViolations(entries, {
      generatedAt: new Date('2026-09-16T20:30:02.784Z'),
    });
    expect(inventoryViolations).toEqual([]);
    for (const entry of entries) {
      if (entry.lastModified) {
        expect(entry.lastModified).toBeInstanceOf(Date);
      }
    }

    expect(entries.length).toBeGreaterThan(0);
    expect(selectMock).toHaveBeenCalledTimes(4);
    expect(queryMock).toHaveBeenCalled();
  });

  it('uses catalog revision dates and omits lastmod when the revision is unknown', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'artist',
          displayName: 'Artist Name',
          updatedAt: new Date('2026-01-01'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();
    const artist = entries.find(entry => entry.url === 'https://jov.ie/artist');
    const about = entries.find(entry => entry.url === 'https://jov.ie/about');

    expect(entries.length).toBeGreaterThan(0);
    expect(artist?.lastModified).toEqual(new Date('2026-01-01'));
    expect(about?.lastModified).toBeUndefined();
  });

  it('excludes automatic unclaimed structured-credit profiles', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'claimed-artist',
          displayName: 'Claimed Artist',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'a_unclaimed',
          displayName: null,
          updatedAt: new Date('2026-01-01'),
          isClaimed: false,
          settings: {
            unclaimedArtistProfile: {
              state: 'unclaimed',
              source: 'structured_spotify_release_credit',
              artistRegistryId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
              provider: 'spotify',
              providerArtistId: 'spotify-austin',
              ownershipVerified: false,
              representationVerified: false,
              consentObtained: false,
            },
          },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();
    const urls = entries.map(entry => entry.url);

    expect(urls).toContain('https://jov.ie/claimed-artist');
    expect(urls).not.toContain('https://jov.ie/a_unclaimed');
  });

  it('excludes synthetic profiles and their content without hiding similar real handles', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'dualipa',
          displayName: 'Dua Lipa',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'testartist',
          displayName: 'Test Artist',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'dualipa-official',
          displayName: 'Dua Lipa Official',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'dualipa',
          slug: 'fixture-release',
          updatedAt: new Date('2026-01-02'),
          artworkUrl: null,
        },
        {
          username: 'dualipa-official',
          slug: 'real-release',
          updatedAt: new Date('2026-01-02'),
          artworkUrl: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'testartist',
          slug: 'fixture-track',
          updatedAt: new Date('2026-01-03'),
        },
        {
          username: 'dualipa-official',
          slug: 'real-track',
          updatedAt: new Date('2026-01-03'),
        },
      ])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    expect(urls).not.toContain('https://jov.ie/dualipa');
    expect(urls).not.toContain('https://jov.ie/dualipa/fixture-release');
    expect(urls).not.toContain('https://jov.ie/testartist');
    expect(urls).not.toContain('https://jov.ie/testartist/fixture-track');
    expect(urls).toContain('https://jov.ie/dualipa-official');
    expect(urls).toContain('https://jov.ie/dualipa-official/real-release');
    expect(urls).toContain('https://jov.ie/dualipa-official/real-track');
  });

  it('excludes claimed Clerk-test machine-handle profiles and every URL under them (JOV-6126 canary)', async () => {
    // Live production evidence 2026-09-10: five claimed Clerk-test profiles
    // (tmoc* handles, display names like 'gp moc…+clerk test') shipped ~230
    // junk URLs into the sitemap. Every profile/release/track URL under those
    // identities must be excluded from the sitemap catalog.
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'tmoc0g1x9dwmk71',
          displayName: 'gp moc+clerk test',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'tmoc209131l1r6w',
          displayName: 'gp moc 986+clerk test',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'tmoc46fryq6bfjq',
          displayName: 'gp moc+clerk test',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'tmoc5lql8bre49o',
          displayName: 'gp moc+clerk test',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'tmoc9mm7xfvx02c',
          displayName: 'gp moc+clerk test',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'tmoc0g1x9dwmk71',
          slug: 'qa-release-986',
          updatedAt: new Date('2026-09-10'),
          artworkUrl: null,
        },
        {
          username: 'tmoc9mm7xfvx02c',
          slug: 'gp-moc-test-release',
          updatedAt: new Date('2026-09-10'),
          artworkUrl: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'tmoc209131l1r6w',
          slug: 'qa-track-1',
          updatedAt: new Date('2026-09-10'),
        },
      ])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    // Zero tmoc* profile URLs in the sitemap.
    for (const handle of [
      'tmoc0g1x9dwmk71',
      'tmoc209131l1r6w',
      'tmoc46fryq6bfjq',
      'tmoc5lql8bre49o',
      'tmoc9mm7xfvx02c',
    ]) {
      expect(urls).not.toContain(`https://jov.ie/${handle}`);
    }
    // Zero release/track URLs under them.
    expect(urls).not.toContain('https://jov.ie/tmoc0g1x9dwmk71/qa-release-986');
    expect(urls).not.toContain(
      'https://jov.ie/tmoc9mm7xfvx02c/gp-moc-test-release'
    );
    expect(urls).not.toContain('https://jov.ie/tmoc209131l1r6w/qa-track-1');
    // The whole sitemap stays well-formed: no tmoc* URL of any shape.
    for (const url of urls) {
      expect(url).not.toMatch(/jov\.ie\/tmoc[0-9a-z]{10,}(\/|$)/);
    }
  });

  it('keeps legitimate creators in the sitemap when only their handle shares a tmoc prefix', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'tmoc-artist',
          displayName: 'Real Artist',
          updatedAt: new Date('2026-09-10'),
          isClaimed: true,
          settings: {},
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    expect(urls).toContain('https://jov.ie/tmoc-artist');
  });

  it('excludes a realistic test account and its URLs without a handle denylist', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'jordanmiles',
          displayName: 'Jordan Miles',
          updatedAt: new Date('2026-09-13'),
          isClaimed: true,
          settings: {},
          ownerEmail: 'e2e+jordan@example.com',
        },
        {
          username: 'tim',
          displayName: 'Tim White',
          updatedAt: new Date('2026-09-13'),
          isClaimed: true,
          settings: {},
          ownerEmail: 'tim@timwhite.audio',
        },
      ])
      .mockResolvedValueOnce([
        {
          username: 'jordanmiles',
          slug: 'realistic-release',
          updatedAt: new Date('2026-09-13'),
          artworkUrl: null,
        },
        {
          username: 'tim',
          slug: 'never-say-a-word',
          updatedAt: new Date('2026-09-13'),
          artworkUrl: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    expect(urls).not.toContain('https://jov.ie/jordanmiles');
    expect(urls).not.toContain('https://jov.ie/jordanmiles/realistic-release');
    expect(urls).toContain('https://jov.ie/tim');
    expect(urls).toContain('https://jov.ie/tim/never-say-a-word');
  });

  it('is non-empty (at minimum static marketing pages are included)', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map(e => e.url)).toContain('https://jov.ie');
  });

  it('returns a non-empty canonical sitemap and omits unknown lastmod', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock.mockResolvedValue([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/jov\.ie/);
      if (entry.lastModified) {
        expect(entry.lastModified).toBeInstanceOf(Date);
      }
    }
  });

  it('does not resurrect unpublished or QA identities when the catalog is unavailable', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock.mockRejectedValue(new Error('database unavailable'));

    const { default: sitemap } = await import('../../app/sitemap');
    const urls = (await sitemap()).map(entry => entry.url);

    expect(urls).toContain('https://jov.ie/artist-profiles');
    expect(urls).not.toContain('https://jov.ie/unpublished-band');
    expect(urls).not.toContain('https://jov.ie/tmoc0g1x9dwmk71');
    expect(urls.some(url => /\/tmoc[0-9a-z]{10,}/.test(url))).toBe(false);
  });
});

describe('sitemap publication inventory fixtures (JOV-6263)', () => {
  const generatedAt = new Date('2026-09-16T20:30:02.784Z');
  const manifest: SitemapManifestRoute[] = [
    { url: '/youtube-thumbnails', status: 'active', recipeId: 'feature' },
    { url: '/artist-profiles', status: 'active', recipeId: 'artist-lp' },
  ];
  const hubs = [
    { url: 'https://jov.ie/artist-profiles' },
    { url: 'https://jov.ie/youtube-thumbnails' },
  ];

  it('flags an omitted commercial page, QA identity, and request-time lastmod', () => {
    expect(
      collectSitemapInventoryViolations(hubs.slice(0, 1), { manifest })
    ).toContain('omitted commercial page: /youtube-thumbnails');
    expect(
      collectSitemapInventoryViolations(
        [...hubs, { url: 'https://jov.ie/tmoc0g1x9dwmk71' }],
        { manifest }
      )
    ).toContain('QA identity included: /tmoc0g1x9dwmk71');
    expect(
      collectSitemapInventoryViolations(
        [{ ...hubs[0], lastModified: generatedAt }, hubs[1]],
        { generatedAt, manifest }
      )
    ).toContain('request-time lastmod on unchanged page: /artist-profiles');
  });

  it('flags gone and alias public roots if they leak into the sitemap', () => {
    expect(
      collectSitemapInventoryViolations(
        [
          { url: 'https://jov.ie/artist-profiles' },
          { url: 'https://jov.ie/youtube-thumbnails' },
          { url: 'https://jov.ie/music' },
          { url: 'https://jov.ie/privacy' },
        ],
        { manifest }
      )
    ).toEqual(
      expect.arrayContaining([
        'non-indexable public url: /music',
        'non-indexable public url: /privacy',
      ])
    );
  });
});
