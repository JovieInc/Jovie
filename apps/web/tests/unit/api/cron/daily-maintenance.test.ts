import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunDataRetentionCleanup = vi.hoisted(() => vi.fn());
const mockRunReconciliation = vi.hoisted(() => vi.fn());
const mockCleanupExpiredKeys = vi.hoisted(() => vi.fn());
const mockCleanupOrphanedPhotos = vi.hoisted(() => vi.fn());
const mockCleanupSmsIntents = vi.hoisted(() => vi.fn());
const mockRunWaitlistAutoAccept = vi.hoisted(() => vi.fn());
const mockSweepUnderEnrichedProfilesForCron = vi.hoisted(() => vi.fn());
const mockRunOnboardingScriptAggregation = vi.hoisted(() => vi.fn());
const mockRunProfileSearchMonitoring = vi.hoisted(() => vi.fn());
const mockSyncAiCrawlerAnalyticsCron = vi.hoisted(() => vi.fn());

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

vi.mock('@/app/api/cron/cleanup-sms-intents/route', () => ({
  cleanupSmsIntents: mockCleanupSmsIntents,
}));

vi.mock('@/lib/waitlist/auto-accept', () => ({
  runWaitlistAutoAccept: mockRunWaitlistAutoAccept,
}));

vi.mock('@/lib/discography/re-enrich', () => ({
  sweepUnderEnrichedProfilesForCron: mockSweepUnderEnrichedProfilesForCron,
}));

vi.mock('@/lib/onboarding/script-aggregation', () => ({
  runOnboardingScriptAggregation: mockRunOnboardingScriptAggregation,
}));

vi.mock('@/lib/profile-search/runner', () => ({
  runProfileSearchMonitoring: mockRunProfileSearchMonitoring,
}));

vi.mock('@/app/api/cron/sync-ai-crawler-analytics/route', () => ({
  syncAiCrawlerAnalyticsCron: mockSyncAiCrawlerAnalyticsCron,
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
    mockCleanupSmsIntents.mockResolvedValue({ expired: 4, deleted: 5 });
    mockRunWaitlistAutoAccept.mockResolvedValue({
      enabled: false,
      scanned: 0,
      approved: 0,
      skipped: 0,
      failed: 0,
      capacityRemaining: 0,
    });
    mockSweepUnderEnrichedProfilesForCron.mockResolvedValue({
      profilesProcessed: 1,
      totalLinksDiscovered: 4,
      errors: [],
      hasMoreProfiles: true,
    });
    mockRunOnboardingScriptAggregation.mockResolvedValue({
      syncedSeeds: 2,
      updatedStats: 3,
      candidatesInserted: 0,
      promoted: 0,
      retired: 0,
    });
    mockRunProfileSearchMonitoring.mockResolvedValue({
      enabled: false,
      claimed: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      skippedBudget: 0,
      stoppedForDeadline: false,
    });
    mockSyncAiCrawlerAnalyticsCron.mockResolvedValue({
      success: true,
      zonesProcessed: 1,
      samplesInserted: 2,
    });
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
    expect(data.results.cleanupSmsIntents.success).toBe(true);
    expect(data.results.waitlistAutoAccept.success).toBe(true);
    expect(data.results.profileSearchMonitoring.success).toBe(true);
    expect(mockRunProfileSearchMonitoring).toHaveBeenCalledWith(
      new Date('2026-03-29T00:00:00.000Z').getTime() + 90_000
    );
    expect(data.results.discographyReEnrich.success).toBe(true);
    expect(data.results.discographyReEnrich.data).toEqual({
      profilesProcessed: 1,
      totalLinksDiscovered: 4,
      errors: [],
      hasMoreProfiles: true,
    });
    expect(mockSweepUnderEnrichedProfilesForCron).toHaveBeenCalledTimes(1);
    expect(data.results.onboardingScriptAggregation.success).toBe(true);
    expect(data.results.onboardingScriptAggregation.data).toEqual({
      syncedSeeds: 2,
      updatedStats: 3,
      candidatesInserted: 0,
      promoted: 0,
      retired: 0,
    });
    expect(mockRunOnboardingScriptAggregation).toHaveBeenCalledTimes(1);
    expect(data.results.aiCrawlerAnalytics.success).toBe(true);
    expect(data.results.aiCrawlerAnalytics.data).toEqual({
      success: true,
      zonesProcessed: 1,
      samplesInserted: 2,
    });
    expect(mockSyncAiCrawlerAnalyticsCron).toHaveBeenCalledTimes(1);
    expect(data.results.dataRetention.success).toBe(true);
  });
});
