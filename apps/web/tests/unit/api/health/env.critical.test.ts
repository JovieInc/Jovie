import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetEnvironmentInfo = vi.hoisted(() => vi.fn());
const mockIsValidationCompleted = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/startup/environment-validator', () => ({
  isValidationCompleted: mockIsValidationCompleted,
}));

describe('@critical GET /api/health/env', () => {
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
    mockIsValidationCompleted.mockReturnValue(true);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue(true);

    const { GET } = await import('@/app/api/health/env/route');
    const request = new Request('http://localhost/api/health/env');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.details?.currentValidation?.errors).toContain(
      'Rate limit exceeded'
    );
  });

  it('returns environment status', async () => {
    const { GET } = await import('@/app/api/health/env/route');
    const request = new Request('http://localhost/api/health/env');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('details');
  });
});
