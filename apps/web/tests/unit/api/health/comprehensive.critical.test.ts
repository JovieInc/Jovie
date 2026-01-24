import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetEnvironmentInfo = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/env-server', () => ({
  validateEnvironment: mockValidateEnvironment,
  getEnvironmentInfo: mockGetEnvironmentInfo,
  env: {
    NODE_ENV: 'test',
    DATABASE_URL: 'mock://db',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [{ ok: true }] }),
  },
  checkDbHealth: vi.fn().mockResolvedValue({ healthy: true, latency: 5 }),
  validateDbConnection: vi
    .fn()
    .mockResolvedValue({ connected: true, latency: 5 }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: null }),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    balance: {
      retrieve: vi.fn().mockResolvedValue({ available: [] }),
    },
  },
}));

describe('@critical GET /api/health/comprehensive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckRateLimit.mockReturnValue(false);
    mockValidateEnvironment.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      critical: [],
    });
    mockGetEnvironmentInfo.mockReturnValue({
      nodeEnv: 'test',
      platform: 'darwin',
      nodeVersion: process.version,
      hasDatabase: false,
      hasClerk: false,
      hasStripe: false,
      hasCloudinary: false,
    });
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { GET } = await import('@/app/api/health/comprehensive/route');
    const request = new Request('http://localhost/api/health/comprehensive');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBeDefined();
  });

  it('returns comprehensive health status', async () => {
    const { GET } = await import('@/app/api/health/comprehensive/route');
    const request = new Request('http://localhost/api/health/comprehensive');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('ok');
    expect(data).toHaveProperty('checks');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('service');
    expect(data).toHaveProperty('summary');
  });
});
