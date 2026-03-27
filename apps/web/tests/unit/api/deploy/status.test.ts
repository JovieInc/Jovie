import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/server-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/http/server-fetch')
  >('@/lib/http/server-fetch');

  return {
    ...actual,
    serverFetch: mockServerFetch,
  };
});

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('GET /api/deploy/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('VERCEL_API_TOKEN', 'token');
    vi.stubEnv('VERCEL_PROJECT_ID', 'project');
    vi.stubEnv('VERCEL_TEAM_ID', 'team');
    vi.stubEnv('NEXT_PUBLIC_BUILD_SHA', 'abcdef123456');

    mockRequireAdmin.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 429 when Vercel remains rate limited', async () => {
    mockServerFetch.mockResolvedValue(
      new Response('rate limited', { status: 429 })
    );

    const { GET } = await import('@/app/api/deploy/status/route');
    const response = await GET();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: 'Vercel API rate limited',
    });
  });

  it('returns 504 when deployment status lookup times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError(
        'timed out',
        10_000,
        'Vercel production deployment status'
      )
    );

    const { GET } = await import('@/app/api/deploy/status/route');
    const response = await GET();

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: 'Deploy status request timed out',
    });
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Deploy status request timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/deploy/status',
        timeoutMs: 10_000,
      })
    );
  });

  it('returns deployment comparison data when Vercel responds', async () => {
    mockServerFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          deployments: [
            {
              created: '2026-03-26T00:00:00.000Z',
              url: 'prod.jovie.test',
              meta: {
                githubCommitSha: '1234567deadbeef',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { GET } = await import('@/app/api/deploy/status/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      needsPromote: true,
      stagingSha: 'abcdef1',
      prodSha: '1234567',
      prodDeployedAt: '2026-03-26T00:00:00.000Z',
      prodUrl: 'prod.jovie.test',
    });
  });
});
