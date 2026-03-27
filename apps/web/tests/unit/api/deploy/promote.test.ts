import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());
const mockLimit = vi.hoisted(() => vi.fn());
const mockCreateRateLimitHeaders = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
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

vi.mock('@/lib/rate-limit', () => ({
  deployPromoteLimiter: {
    limit: mockLimit,
  },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('POST /api/deploy/promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('VERCEL_PRODUCTION_DEPLOY_HOOK', 'https://example.com/hook');

    mockAuth.mockResolvedValue({ userId: 'admin_123' });
    mockRequireAdmin.mockResolvedValue(null);
    mockCreateRateLimitHeaders.mockReturnValue({
      'X-RateLimit-Limit': '1',
    });
    mockLimit.mockResolvedValue({
      success: true,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when the durable deploy limiter is unavailable', async () => {
    mockLimit.mockResolvedValue({
      success: false,
      reason: 'Rate limiter temporarily unavailable',
      limit: 1,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const { POST } = await import('@/app/api/deploy/promote/route');
    const response = await POST();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Deploy promotion is temporarily unavailable.',
    });
    expect(mockServerFetch).not.toHaveBeenCalled();
  });

  it('returns 504 when the deploy hook times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');

    mockServerFetch.mockRejectedValue(
      new ServerFetchTimeoutError(
        'timed out',
        30_000,
        'Vercel production deploy hook'
      )
    );

    const { POST } = await import('@/app/api/deploy/promote/route');
    const response = await POST();

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: 'Production deploy trigger timed out',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Production deploy trigger timed out',
      expect.any(ServerFetchTimeoutError),
      expect.objectContaining({
        route: '/api/deploy/promote',
        timeoutMs: 30_000,
      })
    );
  });

  it('returns deployment data when the hook succeeds without retrying the deploy hook POST', async () => {
    mockServerFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'job_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { POST } = await import('@/app/api/deploy/promote/route');
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Production deploy triggered',
      job: { id: 'job_123' },
    });
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        timeoutMs: 30_000,
      })
    );
    expect(mockServerFetch.mock.calls[0]?.[1]).not.toHaveProperty('retry');
  });
});
