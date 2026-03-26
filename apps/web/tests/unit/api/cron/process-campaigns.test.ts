import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProcessCampaigns = vi.hoisted(() => vi.fn());
const mockCleanupExpiredSuppressions = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/campaigns/processor', () => ({
  processCampaigns: mockProcessCampaigns,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/notifications/suppression', () => ({
  cleanupExpiredSuppressions: mockCleanupExpiredSuppressions,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GET /api/cron/process-campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');

    mockProcessCampaigns.mockResolvedValue({ processed: 5 });
    mockCleanupExpiredSuppressions.mockResolvedValue(2);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/process-campaigns/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-campaigns', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('processes campaigns with valid auth', async () => {
    const { GET } = await import('@/app/api/cron/process-campaigns/route');
    const response = await GET(
      new Request('http://localhost/api/cron/process-campaigns', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.campaigns).toEqual({ processed: 5 });
    expect(data.suppressionsCleared).toBe(2);
  });
});
