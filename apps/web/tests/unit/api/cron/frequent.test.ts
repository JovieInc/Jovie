import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbExecute,
  mockDbSelect,
  mockDbInsert,
  mockProcessCampaigns,
  mockCleanupExpiredSuppressions,
  mockProcessPendingEvents,
  mockScheduleReleaseNotifications,
  mockSendPendingNotifications,
  mockRunAutoApprove,
  mockResetBudgetIfNeeded,
  mockWarmAlphabetCache,
  mockClaimPendingJobs,
  mockProcessJob,
  mockSucceedJob,
  mockHandleIngestionJobFailure,
  mockWithSystemIngestionSession,
  mockProcessOutreachBatch,
  mockBackfillProductFunnelHistory,
  mockMaterializeRetentionEvents,
  mockRunSyntheticSignupMonitor,
  mockSafeEvaluateProductFunnelAlerts,
} = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockProcessCampaigns: vi.fn(),
  mockCleanupExpiredSuppressions: vi.fn(),
  mockProcessPendingEvents: vi.fn(),
  mockScheduleReleaseNotifications: vi.fn(),
  mockSendPendingNotifications: vi.fn(),
  mockRunAutoApprove: vi.fn(),
  mockResetBudgetIfNeeded: vi.fn(),
  mockWarmAlphabetCache: vi.fn(),
  mockClaimPendingJobs: vi.fn(),
  mockProcessJob: vi.fn(),
  mockSucceedJob: vi.fn(),
  mockHandleIngestionJobFailure: vi.fn(),
  mockWithSystemIngestionSession: vi.fn(),
  mockProcessOutreachBatch: vi.fn(),
  mockBackfillProductFunnelHistory: vi.fn(),
  mockMaterializeRetentionEvents: vi.fn(),
  mockRunSyntheticSignupMonitor: vi.fn(),
  mockSafeEvaluateProductFunnelAlerts: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/leads', () => ({
  discoveryKeywords: 'discoveryKeywords',
  leadPipelineSettings: {
    id: 'leadPipelineSettings.id',
  },
  leads: {
    status: 'leads.status',
    id: 'leads.id',
  },
}));

vi.mock('@/lib/email/campaigns/processor', () => ({
  processCampaigns: mockProcessCampaigns,
}));

vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/ingestion/processor', () => ({
  claimPendingJobs: mockClaimPendingJobs,
  handleIngestionJobFailure: mockHandleIngestionJobFailure,
  processJob: mockProcessJob,
  succeedJob: mockSucceedJob,
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/leads/auto-approve', () => ({
  runAutoApprove: mockRunAutoApprove,
}));

vi.mock('@/lib/leads/outreach-batch', () => ({
  processOutreachBatch: mockProcessOutreachBatch,
}));

vi.mock('@/lib/leads/discovery', () => ({
  resetBudgetIfNeeded: mockResetBudgetIfNeeded,
  runDiscovery: vi.fn(),
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineWarn: vi.fn(),
}));

vi.mock('@/lib/leads/process-batch', () => ({
  processLeadBatch: vi.fn(),
}));

vi.mock('@/lib/notifications/suppression', () => ({
  cleanupExpiredSuppressions: mockCleanupExpiredSuppressions,
}));

vi.mock('@/lib/product-funnel/events', () => ({
  backfillProductFunnelHistory: mockBackfillProductFunnelHistory,
  materializeRetentionEvents: mockMaterializeRetentionEvents,
}));

vi.mock('@/lib/monitors/synthetic-signup', () => ({
  runSyntheticSignupMonitor: mockRunSyntheticSignupMonitor,
}));

vi.mock('@/lib/admin/product-funnel-alerts', () => ({
  safeEvaluateProductFunnelAlerts: mockSafeEvaluateProductFunnelAlerts,
}));

vi.mock('@/lib/spotify/alphabet-cache', () => ({
  warmAlphabetCache: mockWarmAlphabetCache,
}));

vi.mock('@/lib/tracking/forwarding', () => ({
  processPendingEvents: mockProcessPendingEvents,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/app/api/cron/schedule-release-notifications/route', () => ({
  scheduleReleaseNotifications: mockScheduleReleaseNotifications,
}));

vi.mock('@/app/api/cron/send-release-notifications/route', () => ({
  sendPendingNotifications: mockSendPendingNotifications,
}));

describe('GET /api/cron/frequent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T10:30:00.000Z'));

    mockDbExecute.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              enabled: true,
              discoveryEnabled: false,
            },
          ]),
        }),
      }),
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    mockProcessCampaigns.mockResolvedValue({ processed: 0 });
    mockCleanupExpiredSuppressions.mockResolvedValue(0);
    mockProcessPendingEvents.mockResolvedValue({ retried: 0 });
    mockScheduleReleaseNotifications.mockResolvedValue({
      scheduled: 3,
      releasesFound: 1,
    });
    mockSendPendingNotifications.mockResolvedValue({
      sent: 5,
      failed: 0,
      skipped: 0,
      processed: 5,
    });
    mockRunAutoApprove.mockResolvedValue({ approved: 0 });
    mockProcessOutreachBatch.mockResolvedValue({
      attempted: 0,
      queued: 0,
      failed: 0,
      dismissed: 0,
      remainingPending: 0,
    });
    mockResetBudgetIfNeeded.mockImplementation(async settings => settings);
    mockWarmAlphabetCache.mockResolvedValue({ warmed: false });
    mockBackfillProductFunnelHistory.mockResolvedValue({ inserted: 0 });
    mockMaterializeRetentionEvents.mockResolvedValue({ inserted: 0 });
    mockRunSyntheticSignupMonitor.mockResolvedValue({ status: 'success' });
    mockSafeEvaluateProductFunnelAlerts.mockResolvedValue({
      triggered: [],
      recovered: [],
    });
    mockClaimPendingJobs.mockResolvedValue([]);
    mockProcessJob.mockResolvedValue(undefined);
    mockSucceedJob.mockResolvedValue(undefined);
    mockHandleIngestionJobFailure.mockResolvedValue(undefined);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback({})
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('runs notification scheduling and sending on every 15-minute invocation', async () => {
    const { GET } = await import('@/app/api/cron/frequent/route');

    const response = await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockProcessOutreachBatch).toHaveBeenCalledWith(10);
    expect(mockScheduleReleaseNotifications).toHaveBeenCalledTimes(1);
    expect(mockSendPendingNotifications).toHaveBeenCalledTimes(1);
    expect(data.results.outreach).toEqual({
      success: true,
      data: {
        attempted: 0,
        queued: 0,
        failed: 0,
        dismissed: 0,
        remainingPending: 0,
      },
    });
    expect(data.results.scheduleNotifications.success).toBe(true);
    expect(data.results.sendNotifications.success).toBe(true);
    expect(data.results.productFunnelRetention.success).toBe(true);
    expect(data.results.productFunnelSynthetic).toEqual({
      success: true,
      skipped: true,
    });
    expect(data.results.productFunnelAlerts.success).toBe(true);
  });

  it('returns 207 when notification scheduling fails', async () => {
    mockScheduleReleaseNotifications.mockRejectedValue(
      new Error('entitlements unavailable')
    );

    const { GET } = await import('@/app/api/cron/frequent/route');

    const response = await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(207);
    expect(data.success).toBe(false);
    expect(data.results.scheduleNotifications.success).toBe(false);
    expect(data.results.scheduleNotifications.error).toBe(
      'entitlements unavailable'
    );
  });

  it('returns 207 when sendPendingNotifications fails', async () => {
    mockSendPendingNotifications.mockRejectedValue(
      new Error('send service down')
    );

    const { GET } = await import('@/app/api/cron/frequent/route');

    const response = await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(207);
    expect(data.success).toBe(false);
    expect(data.results.sendNotifications.success).toBe(false);
    expect(data.results.sendNotifications.error).toBe('send service down');
  });
});
