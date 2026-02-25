import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckDbPerformance = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  checkDbPerformance: mockCheckDbPerformance,
  getDbConfig: vi.fn(() => ({ maxConnections: 10 })),
}));
vi.mock('@/lib/db/config', () => ({
  HEALTH_CHECK_CONFIG: {
    cacheHeaders: {},
    statusCodes: { healthy: 200, unhealthy: 503 },
  },
  PERFORMANCE_THRESHOLDS: {
    simpleQueryMax: 100,
    transactionTimeMax: 200,
    warningMultiplier: 0.8,
  },
}));
vi.mock('@/lib/env-server', () => ({ env: { DATABASE_URL: 'postgres://x' } }));
vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    getStatus: vi.fn(() => ({ blocked: false })),
    limit: vi.fn(),
  },
  createRateLimitHeadersFromStatus: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/startup/environment-validator', () => ({
  validateDatabaseEnvironment: vi.fn(() => ({ valid: true })),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/db/performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('captures warning when db performance check fails', async () => {
    mockCheckDbPerformance.mockResolvedValue({
      healthy: false,
      error: 'Slow queries',
      metrics: {},
    });
    const { GET } = await import('@/app/api/health/db/performance/route');
    const response = await GET(
      new Request('http://localhost/api/health/db/performance')
    );
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'DB performance health check failed',
      undefined,
      expect.objectContaining({ route: '/api/health/db/performance' })
    );
  });
});
