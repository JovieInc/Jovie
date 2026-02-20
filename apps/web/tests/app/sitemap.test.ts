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

const getBlogPostSlugs = vi.fn();
vi.mock('@/lib/blog/getBlogPosts', () => ({
  getBlogPostSlugs,
}));

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
  discogTracks: {
    slug: 'slug',
    updatedAt: 'updatedAt',
    releaseId: 'releaseId',
    creatorProfileId: 'creatorProfileId',
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
  captureException: vi.fn(),
}));

describe('sitemap', () => {
  it('returns marketing, blog, profile, release, and deduplicated track URLs', async () => {
    getBlogPostSlugs.mockResolvedValue(['hello-world']);

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
          artworkUrl: 'https://cdn.example.com/art.jpg',
        },
        {
          username: 'tim',
          slug: 'single',
          updatedAt: new Date('2026-01-04'),
          artworkUrl: null,
        },
      ]);

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

    expect(selectMock).toHaveBeenCalledTimes(3);
    expect(queryMock).toHaveBeenCalled();
  });
});
