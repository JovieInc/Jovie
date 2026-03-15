import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHealthLimiterLimit = vi.hoisted(() => vi.fn());
const mockCheckDbHealth = vi.hoisted(() => vi.fn());
const mockValidateDatabaseEnvironment = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    limit: mockHealthLimiterLimit,
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/db', () => ({
  checkDbHealth: mockCheckDbHealth,
  getDbConfig: vi.fn().mockReturnValue({ maxConnections: 10 }),
}));

vi.mock('@/lib/db/config', () => ({
  HEALTH_CHECK_CONFIG: {
    cacheHeaders: { 'Cache-Control': 'no-store' },
    statusCodes: { healthy: 200, unhealthy: 503 },
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: { DATABASE_URL: 'postgres://test:test@localhost:5432/test' },
}));
vi.mock('@/lib/startup/environment-validator', () => ({
  validateDatabaseEnvironment: mockValidateDatabaseEnvironment,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHealthLimiterLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60000),
    });
    mockValidateDatabaseEnvironment.mockReturnValue({ valid: true });
  });

  it('captures warning when database health is unhealthy', async () => {
    mockCheckDbHealth.mockResolvedValue({
      healthy: false,
      latency: 0,
      error: 'Connection timeout',
      details: {
        connection: false,
        query: false,
        transaction: false,
        schemaAccess: false,
      },
    });

    const { GET } = await import('@/app/api/health/db/route');
    const response = await GET(new Request('http://localhost/api/health/db'));

    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'DB health check unhealthy',
      undefined,
      expect.objectContaining({ service: 'db', route: '/api/health/db' })
    );
  });
});
