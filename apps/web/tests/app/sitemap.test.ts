import { describe, expect, it, vi } from 'vitest';

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
    id: 'id',
  },
  discogRecordings: {
    slug: 'slug',
    updatedAt: 'updatedAt',
    creatorProfileId: 'creatorProfileId',
    id: 'id',
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
    isPublic: 'isPublic',
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: queryMock,
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
}));

describe('sitemap', () => {
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

    expect(selectMock).toHaveBeenCalledTimes(4);
    expect(queryMock).toHaveBeenCalled();
  });
});
