import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  checkAdminRole: vi.fn(),
  env: {
    HUD_GITHUB_TOKEN: undefined as string | undefined,
    HUD_GITHUB_OWNER: undefined as string | undefined,
    HUD_GITHUB_REPO: undefined as string | undefined,
    VERCEL_ENV: 'development' as string | undefined,
    NODE_ENV: 'test' as string | undefined,
  },
  getRedis: vi.fn(() => null),
  captureError: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: hoisted.getCurrentUserEntitlements,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: hoisted.checkAdminRole,
}));

vi.mock('@/lib/env-server', () => ({
  env: hoisted.env,
}));

vi.mock('@/lib/redis', () => ({
  getRedis: hoisted.getRedis,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: hoisted.logger,
}));

describe('GET /api/admin/hud/shipping-velocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.env.HUD_GITHUB_TOKEN = undefined;
    hoisted.env.HUD_GITHUB_OWNER = undefined;
    hoisted.env.HUD_GITHUB_REPO = undefined;
    hoisted.getRedis.mockReturnValue(null);
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      userId: 'admin-test',
      isAdmin: false,
    });
    hoisted.checkAdminRole.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('includes older PRs merged in range and stops at the updated-time boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    hoisted.env.HUD_GITHUB_TOKEN = 'test-token';
    hoisted.env.HUD_GITHUB_OWNER = 'JovieInc';
    hoisted.env.HUD_GITHUB_REPO = 'jovie';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              repository: {
                pullRequests: {
                  nodes: [
                    {
                      state: 'MERGED',
                      merged: true,
                      createdAt: '2026-08-01T12:00:00.000Z',
                      updatedAt: '2026-08-29T09:00:00.000Z',
                      mergedAt: '2026-08-29T08:00:00.000Z',
                      closedAt: '2026-08-29T08:00:00.000Z',
                    },
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'cursor-1',
                  },
                },
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              repository: {
                pullRequests: {
                  nodes: [
                    {
                      state: 'CLOSED',
                      merged: false,
                      createdAt: '2026-08-01T12:00:00.000Z',
                      updatedAt: '2026-08-20T09:00:00.000Z',
                      mergedAt: null,
                      closedAt: '2026-08-20T09:00:00.000Z',
                    },
                  ],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'cursor-2',
                  },
                },
              },
            },
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      range: '7d',
      observation: 'fresh',
    });
    expect(result.data).toHaveLength(7);
    expect(result.data).toContainEqual({
      date: '2026-08-29',
      merged: 1,
      opened: 0,
      closed: 0,
      mergeP50Hours: 668,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondRequest = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body)
    );
    expect(firstRequest.query).toContain(
      'orderBy: { field: UPDATED_AT, direction: DESC }'
    );
    expect(firstRequest.query).toContain('createdAt updatedAt mergedAt');
    expect(firstRequest.variables).toEqual({
      owner: 'JovieInc',
      name: 'jovie',
      cursor: null,
    });
    expect(secondRequest.variables.cursor).toBe('cursor-1');
  });

  it('returns not_configured instead of zero buckets when GitHub is missing', async () => {
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      range: '7d',
      cachedAt: expect.any(String),
      observation: 'not_configured',
      errorMessage: 'GitHub is not configured for shipping velocity.',
    });
  });

  it('does not serve cached velocity when GitHub is no longer configured', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          date: '2026-08-20',
          merged: 3,
          opened: 1,
          closed: 0,
          mergeP50Hours: 2,
        },
      ],
      range: '7d',
      cachedAt: new Date().toISOString(),
      observation: 'fresh',
    });
    hoisted.getRedis.mockReturnValue({ get, set: vi.fn() });

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      range: '7d',
      cachedAt: expect.any(String),
      observation: 'not_configured',
      errorMessage: 'GitHub is not configured for shipping velocity.',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('fails unavailable instead of projecting malformed GitHub data as zero', async () => {
    hoisted.env.HUD_GITHUB_TOKEN = 'test-token';
    hoisted.env.HUD_GITHUB_OWNER = 'JovieInc';
    hoisted.env.HUD_GITHUB_REPO = 'jovie';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { repository: null } }), {
          status: 200,
        })
      )
    );

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch shipping velocity data',
    });
  });

  it.each([
    [
      'malformed PR node',
      [
        {
          state: 'MERGED',
          merged: true,
          createdAt: '2026-08-29T00:00:00.000Z',
        },
      ],
      { hasNextPage: false, endCursor: null },
      1,
    ],
    [
      'non-advancing cursor',
      [],
      { hasNextPage: true, endCursor: 'same-cursor' },
      2,
    ],
  ])('fails closed on %s', async (_label, nodes, pageInfo, expectedFetches) => {
    hoisted.env.HUD_GITHUB_TOKEN = 'test-token';
    hoisted.env.HUD_GITHUB_OWNER = 'JovieInc';
    hoisted.env.HUD_GITHUB_REPO = 'jovie';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            repository: { pullRequests: { nodes, pageInfo } },
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(expectedFetches);
  });

  it('fails closed when GitHub pagination exceeds the bounded page budget', async () => {
    hoisted.env.HUD_GITHUB_TOKEN = 'test-token';
    hoisted.env.HUD_GITHUB_OWNER = 'JovieInc';
    hoisted.env.HUD_GITHUB_REPO = 'jovie';
    let page = 0;
    const fetchMock = vi.fn(async () => {
      page += 1;
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                nodes: [],
                pageInfo: {
                  hasNextPage: true,
                  endCursor: `cursor-${page}`,
                },
              },
            },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=7d')
    );

    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(30);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch shipping velocity data',
    });
  });

  it('allows a one-year range to traverse more than 100 bounded pages', async () => {
    hoisted.env.HUD_GITHUB_TOKEN = 'test-token';
    hoisted.env.HUD_GITHUB_OWNER = 'JovieInc';
    hoisted.env.HUD_GITHUB_REPO = 'jovie';
    let page = 0;
    const fetchMock = vi.fn(async () => {
      page += 1;
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequests: {
                nodes: [],
                pageInfo: {
                  hasNextPage: page < 101,
                  endCursor: page < 101 ? `cursor-${page}` : null,
                },
              },
            },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity?range=1y')
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(101);
    expect((await response.json()).data).toHaveLength(365);
  });

  it('returns 401 for signed-out users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      userId: null,
      isAdmin: false,
    });
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when authentication has no stable user id', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      userId: null,
      isAdmin: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity')
    );

    expect(response.status).toBe(401);
    expect(hoisted.checkAdminRole).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated non-admin users', async () => {
    hoisted.getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      userId: 'creator-test',
      isAdmin: false,
    });
    hoisted.checkAdminRole.mockResolvedValue(false);
    const { GET } = await import('@/app/api/admin/hud/shipping-velocity/route');
    const response = await GET(
      new Request('http://localhost/api/admin/hud/shipping-velocity')
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });
});
