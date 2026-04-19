import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunDataRetentionCleanup = vi.hoisted(() => vi.fn());
const mockRunReconciliation = vi.hoisted(() => vi.fn());
const mockCleanupExpiredKeys = vi.hoisted(() => vi.fn());
const mockCleanupOrphanedPhotos = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'check-in-id'),
}));

vi.mock('@/lib/analytics/data-retention', () => ({
  runDataRetentionCleanup: mockRunDataRetentionCleanup,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/app/api/cron/billing-reconciliation/route', () => ({
  runReconciliation: mockRunReconciliation,
}));

vi.mock('@/app/api/cron/cleanup-idempotency-keys/route', () => ({
  cleanupExpiredKeys: mockCleanupExpiredKeys,
}));

vi.mock('@/app/api/cron/cleanup-photos/route', () => ({
  cleanupOrphanedPhotos: mockCleanupOrphanedPhotos,
}));

describe('GET /api/cron/daily-maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));

    mockCleanupOrphanedPhotos.mockResolvedValue({
      deleted: 1,
      blobsDeleted: 1,
    });
    mockCleanupExpiredKeys.mockResolvedValue(2);
    mockRunReconciliation.mockResolvedValue({
      success: true,
      stats: { mismatches: 0 },
      duration: 10,
      errors: [],
    });
    mockRunDataRetentionCleanup.mockResolvedValue({ deleted: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns 401 for invalid cron auth', async () => {
    const { GET } = await import('@/app/api/cron/daily-maintenance/route');
    const response = await GET(
      new Request('http://localhost/api/cron/daily-maintenance', {
        headers: { Authorization: 'Bearer wrong-secret' },
      })
    );

    expect(response.status).toBe(401);
  });

  it('runs all daily maintenance sub-jobs with valid auth', async () => {
    const { GET } = await import('@/app/api/cron/daily-maintenance/route');
    const response = await GET(
      new Request('http://localhost/api/cron/daily-maintenance', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.results.cleanupPhotos.success).toBe(true);
    expect(data.results.cleanupKeys.success).toBe(true);
    expect(data.results.billingReconciliation.success).toBe(true);
    expect(data.results.dataRetention.success).toBe(true);
  });
});
