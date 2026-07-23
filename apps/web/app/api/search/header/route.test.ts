import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const and = vi.fn((...conditions: unknown[]) => conditions);
  const asc = vi.fn((value: unknown) => value);
  const eq = vi.fn((left: unknown, right: unknown) => ({
    left,
    op: 'eq',
    right,
  }));
  const ilike = vi.fn((left: unknown, right: unknown) => ({
    left,
    op: 'ilike',
    right,
  }));
  const isNull = vi.fn((value: unknown) => ({ op: 'isNull', value }));
  const ne = vi.fn((left: unknown, right: unknown) => ({
    left,
    op: 'ne',
    right,
  }));

  return {
    and,
    asc,
    captureError: vi.fn(),
    eq,
    getSessionContext: vi.fn(),
    ilike,
    isNull,
    limit,
    ne,
    orderBy,
    select,
  };
});

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContext,
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));

vi.mock('@/lib/db', () => ({
  db: { select: hoisted.select },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    creatorProfileId: 'creatorProfileId',
    deletedAt: 'deletedAt',
    id: 'id',
    slug: 'slug',
    status: 'status',
    title: 'title',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  asc: hoisted.asc,
  eq: hoisted.eq,
  ilike: hoisted.ilike,
  isNull: hoisted.isNull,
  ne: hoisted.ne,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { GET } from './route';

describe('GET /api/search/header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionContext.mockResolvedValue({
      profile: {
        id: 'profile-1',
        displayName: 'Midnight Artist',
        username: 'midnight-artist',
        usernameNormalized: 'midnight-artist',
      },
    });
    hoisted.limit.mockResolvedValue([]);
  });

  it('rejects unauthenticated requests before querying', async () => {
    hoisted.getSessionContext.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(
      new Request('http://localhost/api/search/header?q=midnight')
    );

    expect(response.status).toBe(401);
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it.each([
    ['missing query', 'http://localhost/api/search/header'],
    ['short query', 'http://localhost/api/search/header?q=m'],
    ['long query', `http://localhost/api/search/header?q=${'m'.repeat(81)}`],
    ['zero limit', 'http://localhost/api/search/header?q=midnight&limit=0'],
    [
      'non-numeric limit',
      'http://localhost/api/search/header?q=midnight&limit=many',
    ],
  ])('rejects invalid input: %s', async (_label, url) => {
    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it('caps the database query at five results', async () => {
    await GET(
      new Request('http://localhost/api/search/header?q=midnight&limit=100')
    );

    expect(hoisted.limit).toHaveBeenCalledExactlyOnceWith(5);
  });

  it('scopes results to the active profile and excludes deleted and draft releases', async () => {
    await GET(
      new Request('http://localhost/api/search/header?q=midnight&limit=3')
    );

    expect(hoisted.eq).toHaveBeenCalledWith('creatorProfileId', 'profile-1');
    expect(hoisted.isNull).toHaveBeenCalledWith('deletedAt');
    expect(hoisted.ne).toHaveBeenCalledWith('status', 'draft');
    expect(hoisted.and).toHaveBeenCalledWith(
      expect.objectContaining({
        left: 'creatorProfileId',
        op: 'eq',
        right: 'profile-1',
      }),
      expect.objectContaining({ op: 'isNull', value: 'deletedAt' }),
      expect.objectContaining({ left: 'status', op: 'ne', right: 'draft' })
    );
  });

  it('escapes percent and underscore as literal title-search input', async () => {
    await GET(new Request('http://localhost/api/search/header?q=100%25_real'));

    expect(hoisted.ilike).toHaveBeenCalledExactlyOnceWith(
      'title',
      '%100\\%\\_real%'
    );
  });

  it('returns only the minimal release result shape', async () => {
    hoisted.limit.mockResolvedValue([
      {
        id: 'release-1',
        title: 'Midnight Drive',
        slug: 'midnight-drive',
        metadata: { mustNotLeak: true },
        artworkUrl: 'https://example.com/large.jpg',
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/search/header?q=midnight&limit=3')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(hoisted.select).toHaveBeenCalledWith({
      id: 'id',
      slug: 'slug',
      title: 'title',
    });
    expect(hoisted.limit).toHaveBeenCalledExactlyOnceWith(3);
    await expect(response.json()).resolves.toEqual({
      releases: [
        {
          id: 'release-1',
          title: 'Midnight Drive',
          artistNames: ['Midnight Artist'],
          smartLinkPath: '/midnight-artist/midnight-drive',
        },
      ],
    });
  });

  it('returns a sanitized no-store response on unexpected failure', async () => {
    const failure = new Error(
      'database failed for private-profile-1 and query midnight'
    );
    hoisted.limit.mockRejectedValue(failure);

    const response = await GET(
      new Request('http://localhost/api/search/header?q=midnight')
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Search unavailable',
    });
    expect(hoisted.captureError).toHaveBeenCalledExactlyOnceWith(
      'Header search failed',
      failure,
      { route: '/api/search/header', method: 'GET' }
    );
  });
});
