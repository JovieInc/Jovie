import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProbeRedisOperability = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockVerifyCronRequest = vi.hoisted(() => vi.fn());

vi.mock('@/lib/redis-operability', () => ({
  probeRedisOperability: mockProbeRedisOperability,
  RedisOperabilityError: class RedisOperabilityError extends Error {
    constructor(readonly kind: string) {
      super(kind);
    }
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));

const request = () => new Request('https://jov.ie/api/health/redis');

describe('@critical GET /api/health/redis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockVerifyCronRequest.mockReturnValue(new Response(null, { status: 401 }));
  });

  it('does not spend Redis commands for unauthenticated requests', async () => {
    const denied = new Response(null, { status: 401 });
    mockRequireAdmin.mockResolvedValue(denied);

    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET(request());

    expect(response).toBe(denied);
    expect(mockProbeRedisOperability).not.toHaveBeenCalled();
  });

  it('allows trusted automation without requiring a browser session', async () => {
    mockVerifyCronRequest.mockReturnValue(null);
    mockProbeRedisOperability.mockResolvedValue({
      status: 'healthy',
      latencyMs: 7,
    });

    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it('returns healthy only after a write/read operability probe succeeds', async () => {
    mockProbeRedisOperability.mockResolvedValue({
      status: 'healthy',
      latencyMs: 12,
    });
    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: 'healthy',
        latency: 12,
        latencyMs: 12,
      })
    );
  });

  it('captures warning when redis operability fails', async () => {
    mockProbeRedisOperability.mockRejectedValue(new Error('Redis down'));
    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Redis health check failed',
      expect.any(Error),
      expect.objectContaining({ service: 'redis', route: '/api/health/redis' })
    );
  });

  it('returns a stable quota error class without exposing provider details', async () => {
    const { RedisOperabilityError } = await import('@/lib/redis-operability');
    mockProbeRedisOperability.mockRejectedValue(
      new RedisOperabilityError('quota_exceeded')
    );

    const { GET } = await import('@/app/api/health/redis/route');
    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: 'unhealthy',
        error: 'quota_exceeded',
        failureKind: 'quota_exceeded',
      })
    );
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Redis health check failed',
      expect.any(RedisOperabilityError),
      expect.objectContaining({
        error_class: 'redis_operability_quota_exceeded',
      })
    );
  });
});
