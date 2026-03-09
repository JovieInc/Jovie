import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHealthLimiterGetStatus = vi.hoisted(() => vi.fn());
const mockHealthLimiterLimit = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetEnvironmentInfo = vi.hoisted(() => vi.fn());
const mockIsValidationCompleted = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  healthLimiter: {
    getStatus: mockHealthLimiterGetStatus,
    limit: mockHealthLimiterLimit,
  },
  createRateLimitHeadersFromStatus: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/env-server', () => ({
  validateEnvironment: mockValidateEnvironment,
  getEnvironmentInfo: mockGetEnvironmentInfo,
  env: { NODE_ENV: 'test', DATABASE_URL: 'mock://db' },
}));

vi.mock('@/lib/startup/environment-validator', () => ({
  isValidationCompleted: mockIsValidationCompleted,
}));

vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/env', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockHealthLimiterGetStatus.mockReturnValue({
      blocked: false,
      limit: 30,
      remaining: 29,
      resetTime: Date.now() + 60000,
      retryAfterSeconds: 0,
    });
    mockHealthLimiterLimit.mockResolvedValue({ success: true });
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
    mockIsValidationCompleted.mockReturnValue(true);
  });

  it('captures warning when env health crashes', async () => {
    mockValidateEnvironment.mockImplementation(() => {
      throw new Error('Env validation failed');
    });

    const { GET } = await import('@/app/api/health/env/route');
    const response = await GET(new Request('http://localhost/api/health/env'));

    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Environment health check crashed',
      expect.any(Error),
      expect.objectContaining({ service: 'env', route: '/api/health/env' })
    );
  });
});
