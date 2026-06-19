import { describe, expect, it, vi } from 'vitest';
import { validateSitemapEntries } from '@/lib/seo/ratchet';

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
    isPublic: 'isPublic',
    id: 'id',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  getClient: vi.fn(() => undefined),
  captureException: vi.fn(),
}));

describe('SEO ratchet — sitemap must stay reachable and fresh (JOV-11044)', () => {
  it('returns non-empty sitemap entries with lastModified on every URL', async () => {
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
      ])
      .mockResolvedValueOnce([]);

    const { default: sitemap } = await import('../../../app/sitemap');
    const entries = await sitemap();
    const issues = validateSitemapEntries(entries);

    expect(issues, issues.map(issue => issue.message).join('\n')).toEqual([]);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.lastModified)).toBe(true);
  });
});
