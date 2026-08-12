import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockValidateDbConnection = vi.hoisted(() => vi.fn());
const mockValidateEnvironment = vi.hoisted(() => vi.fn());
const mockGetEnvironmentInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  validateEnvironment: mockValidateEnvironment,
  getEnvironmentInfo: mockGetEnvironmentInfo,
}));
vi.mock('@/lib/db', () => ({ validateDbConnection: mockValidateDbConnection }));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: mockCaptureWarning }));

describe('@critical GET /api/health/deploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateEnvironment.mockReturnValue({
      critical: ['missing'],
      errors: [],
      warnings: [],
    });
    mockGetEnvironmentInfo.mockReturnValue({
      nodeEnv: 'test',
      hasDatabase: false,
      hasClerk: false,
      hasStripe: false,
      hasVercelBlob: false,
    });
    mockValidateDbConnection.mockResolvedValue({ connected: false });
  });

  it('returns the healthy deployment contract consumed by the fleet gate', async () => {
    mockValidateEnvironment.mockReturnValue({
      critical: [],
      errors: [],
      warnings: [],
    });
    mockGetEnvironmentInfo.mockReturnValue({
      nodeEnv: 'production',
      hasDatabase: true,
      hasClerk: true,
      hasStripe: true,
      hasVercelBlob: true,
    });
    mockValidateDbConnection.mockResolvedValue({ connected: true });

    const { GET } = await import('@/app/api/health/deploy/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'healthy',
      checks: {
        environment: { ok: true },
        database: { ok: true, configured: true, error: null },
      },
    });
    expect(mockCaptureWarning).not.toHaveBeenCalled();
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
