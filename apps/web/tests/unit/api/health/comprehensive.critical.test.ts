import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHealthLimiterLimit = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetEnvironmentInfo = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    limit: mockHealthLimiterLimit,
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/env-server', () => ({
  validateEnvironment: mockValidateEnvironment,
  getEnvironmentInfo: mockGetEnvironmentInfo,
  env: { NODE_ENV: 'test', DATABASE_URL: 'mock://db' },
}));

vi.mock('@/lib/db', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [{ ok: true }] }) },
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
    balance: { retrieve: vi.fn().mockResolvedValue({ available: [] }) },
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/comprehensive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHealthLimiterLimit.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: new Date(Date.now() + 60000),
    });
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
      hasVercelBlob: false,
    });
  });

  it('captures warning when comprehensive health crashes', async () => {
    mockValidateEnvironment.mockImplementation(() => {
      throw new Error('Unexpected failure');
    });

    const { GET } = await import('@/app/api/health/comprehensive/route');
    const response = await GET(
      new Request('http://localhost/api/health/comprehensive')
    );

    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Comprehensive health check failed',
      expect.any(Error),
      expect.objectContaining({
        service: 'comprehensive',
        route: '/api/health/comprehensive',
      })
    );
  });
});
