import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCheckDbHealth = vi.hoisted(() => vi.fn());
const mockValidateDatabaseEnvironment = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
  getRateLimitStatus: vi.fn().mockReturnValue({
    limit: 30,
    remaining: 29,
    resetTime: Date.now() + 60000,
  }),
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
  env: {
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  },
}));

vi.mock('@/lib/startup/environment-validator', () => ({
  validateDatabaseEnvironment: mockValidateDatabaseEnvironment,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('@critical GET /api/health/db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckRateLimit.mockReturnValue(false);
    mockValidateDatabaseEnvironment.mockReturnValue({ valid: true });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { GET } = await import('@/app/api/health/db/route');
    const request = new Request('http://localhost/api/health/db');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.ok).toBe(false);
  });

  it('returns healthy status when database is healthy', async () => {
    mockCheckDbHealth.mockResolvedValue({
      healthy: true,
      latency: 5,
      details: {
        connection: true,
        query: true,
        transaction: true,
        schemaAccess: true,
      },
    });

    const { GET } = await import('@/app/api/health/db/route');
    const request = new Request('http://localhost/api/health/db');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe('ok');
    expect(data.details.latency).toBe(5);
  });

  it('returns unhealthy status when database fails', async () => {
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
    const request = new Request('http://localhost/api/health/db');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.ok).toBe(false);
    expect(data.status).toBe('error');
  });

  it('returns error when DATABASE_URL validation fails', async () => {
    mockValidateDatabaseEnvironment.mockReturnValue({
      valid: false,
      error: 'Invalid connection string',
    });

    const { GET } = await import('@/app/api/health/db/route');
    const request = new Request('http://localhost/api/health/db');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.ok).toBe(false);
  });
});
