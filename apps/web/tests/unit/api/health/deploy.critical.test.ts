import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  validateEnvironment: vi.fn(() => ({
    critical: ['missing'],
    errors: [],
    warnings: [],
  })),
  getEnvironmentInfo: vi.fn(() => ({
    nodeEnv: 'test',
    hasDatabase: false,
    hasClerk: false,
    hasStripe: false,
    hasVercelBlob: false,
  })),
}));
vi.mock('@/lib/db', () => ({ validateDbConnection: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures warning when deploy health is unhealthy', async () => {
    const { GET } = await import('@/app/api/health/deploy/route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      'Deploy health check unhealthy',
      undefined,
      expect.objectContaining({ route: '/api/health/deploy' })
    );
  });
});
