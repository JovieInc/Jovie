import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  where: whereMock,
}));
const fromMock = vi.fn(() => ({ where: whereMock, innerJoin: innerJoinMock }));
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

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    username: 'username',
    usernameNormalized: 'usernameNormalized',
    updatedAt: 'updatedAt',
    avatarUrl: 'avatarUrl',
    isClaimed: 'isClaimed',
    isPublic: 'isPublic',
    settings: 'settings',
    id: 'id',
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
        { username: 'tim', updatedAt: new Date('2026-01-01') },
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
        'https://jov.ie/blog/hello-world',
        'https://jov.ie/changelog/26.8.0',
        'https://jov.ie/legal/privacy',
        'https://jov.ie/legal/terms',
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
    ]) {
      expect(entries.map(entry => entry.url)).not.toContain(blockedUrl);
    }

    for (const entry of entries) {
      expect(
        entry.lastModified,
        `${entry.url} must include lastModified for sitemap <lastmod>`
      ).toBeDefined();
    }

    expect(entries.length).toBeGreaterThan(0);
    expect(selectMock).toHaveBeenCalledTimes(4);
    expect(queryMock).toHaveBeenCalled();
  });

  it('every sitemap entry has a lastModified date (SEO ratchet #11044)', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        { username: 'artist', updatedAt: new Date('2026-01-01') },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        entry.lastModified,
        `sitemap entry "${entry.url}" is missing lastModified`
      ).toBeDefined();
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it('excludes automatic unclaimed structured-credit profiles', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock
      .mockResolvedValueOnce([
        {
          username: 'claimed-artist',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'a_unclaimed',
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
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'testartist',
          updatedAt: new Date('2026-01-01'),
          isClaimed: true,
          settings: {},
        },
        {
          username: 'dualipa-official',
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

  it('returns a non-empty sitemap where every entry has lastModified', async () => {
    getBlogPosts.mockResolvedValue([]);
    whereMock.mockResolvedValue([]);

    const { default: sitemap } = await import('../../app/sitemap');
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.url).toMatch(/^https:\/\/jov\.ie/);
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
