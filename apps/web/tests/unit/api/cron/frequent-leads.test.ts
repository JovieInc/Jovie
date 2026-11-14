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
  mockReconcileOrphanedAcceptedActions,
  mockProbeRedisOperability,
  mockCaptureError,
  mockRunBillingSyncRemediation,
  mockGetAcquisitionEligibility,
  mockGetAuthSignupOnboardingCanaryStatus,
  mockGetPublicProfileCanaryStatus,
  mockRefreshCompanyStateCache,
  mockApplySummerCardDefaults,
  mockRefreshProofStats,
  mockRunReleaseEmailCanary,
  mockGetReleaseEmailCanaryStatus,
  mockProcessLeadBatch,
  mockRunDiscovery,
  mockLeadSettingsRows,
  mockUnqualifiedLeadRows,
  mockLeadsOrderBy,
} = vi.hoisted(() => ({
  mockLeadsOrderBy: vi.fn(),
  mockProcessLeadBatch: vi.fn(),
  mockRunDiscovery: vi.fn(),
  mockLeadSettingsRows: { current: [] as Record<string, unknown>[] },
  mockUnqualifiedLeadRows: { current: [] as { id: string }[] },
  mockRunReleaseEmailCanary: vi.fn(),
  mockGetReleaseEmailCanaryStatus: vi.fn(),
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
  mockReconcileOrphanedAcceptedActions: vi.fn(),
  mockProbeRedisOperability: vi.fn(),
  mockCaptureError: vi.fn(),
  mockRunBillingSyncRemediation: vi.fn(),
  mockGetAcquisitionEligibility: vi.fn(),
  mockGetAuthSignupOnboardingCanaryStatus: vi.fn(),
  mockGetPublicProfileCanaryStatus: vi.fn(),
  mockRefreshCompanyStateCache: vi.fn(),
  mockApplySummerCardDefaults: vi.fn(),
  mockRefreshProofStats: vi.fn(),
}));

vi.mock('@/lib/admin/ops-queries', () => ({
  getAuthSignupOnboardingCanaryStatus: mockGetAuthSignupOnboardingCanaryStatus,
  getPublicProfileCanaryStatus: mockGetPublicProfileCanaryStatus,
}));

vi.mock('@/lib/canaries/release-email.server', () => ({
  runReleaseEmailCanary: mockRunReleaseEmailCanary,
  getReleaseEmailCanaryStatus: mockGetReleaseEmailCanaryStatus,
}));

vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: mockGetAcquisitionEligibility,
}));

vi.mock('@/lib/ovie/company-state.server', () => ({
  refreshCompanyStateCache: mockRefreshCompanyStateCache,
}));

vi.mock('@/lib/proof-stats/publish.server', () => ({
  refreshProofStats: mockRefreshProofStats,
}));

vi.mock('@/lib/ovie/summer-cards.server', () => ({
  applySummerCardDefaults: mockApplySummerCardDefaults,
}));

vi.mock('@/lib/founder-welcome/server', () => ({
  founderWelcomeJob: vi.fn(async () => ({ filed: 0 })),
}));

vi.mock(
  '@/lib/connectors/workflows/reconcile-orphaned-approved-actions',
  () => ({
    reconcileOrphanedAcceptedActions: mockReconcileOrphanedAcceptedActions,
  })
);

vi.mock('@/lib/billing/sync-remediation', () => ({
  runBillingSyncRemediation: mockRunBillingSyncRemediation,
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  withRetry: vi.fn((operation: () => Promise<unknown>) => operation()),
}));

vi.mock('@/lib/db/schema/leads', () => ({
  discoveryKeywords: 'discoveryKeywords',
  leadPipelineSettings: {
    id: 'leadPipelineSettings.id',
  },
  leads: {
    status: 'leads.status',
    id: 'leads.id',
    updatedAt: 'leads.updatedAt',
  },
}));

vi.mock('@/lib/email/campaigns/processor', () => ({
  processCampaigns: mockProcessCampaigns,
}));

vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/ingestion/processor', () => ({
  SELF_MANAGED_JOB_TYPES: new Set([
    'import_beacons',
    'import_laylo',
    'import_tiktok',
    'import_twitter',
    'import_youtube',
  ]),
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
  runDiscovery: mockRunDiscovery,
}));

vi.mock('@/lib/leads/pipeline-logger', () => ({
  pipelineWarn: vi.fn(),
}));

vi.mock('@/lib/leads/process-batch', () => ({
  processLeadBatch: mockProcessLeadBatch,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  cleanupExpiredSuppressions: mockCleanupExpiredSuppressions,
}));

vi.mock('@/lib/redis-operability', () => ({
  probeRedisOperability: mockProbeRedisOperability,
  RedisOperabilityError: class RedisOperabilityError extends Error {
    constructor(readonly kind: string) {
      super(kind);
    }
  },
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

describe('GET /api/cron/frequent lead qualification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T10:15:00.000Z'));

    mockDbExecute.mockResolvedValue(undefined);
    mockLeadSettingsRows.current = [
      {
        enabled: true,
        discoveryEnabled: false,
      },
    ];
    mockUnqualifiedLeadRows.current = [];
    // The `leads` table mock is the only one with a `status` column; every
    // other select in the route reads the pipeline settings row.
    mockDbSelect.mockImplementation(() => ({
      from: vi.fn((table: unknown) => {
        const limit = vi
          .fn()
          .mockImplementation(async () =>
            typeof table === 'object' && table !== null && 'status' in table
              ? mockUnqualifiedLeadRows.current
              : mockLeadSettingsRows.current
          );
        return {
          where: vi.fn().mockReturnValue({
            limit,
            orderBy: mockLeadsOrderBy.mockReturnValue({ limit }),
          }),
        };
      }),
    }));
    mockProcessLeadBatch.mockResolvedValue({
      total: 0,
      qualified: 0,
      disqualified: 0,
      error: 0,
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
    mockClaimPendingJobs.mockResolvedValue([]);
    mockProcessJob.mockResolvedValue(undefined);
    mockSucceedJob.mockResolvedValue(undefined);
    mockHandleIngestionJobFailure.mockResolvedValue(undefined);
    mockWithSystemIngestionSession.mockImplementation(async callback =>
      callback({})
    );
    mockReconcileOrphanedAcceptedActions.mockResolvedValue({
      scanned: 0,
      enqueued: 0,
    });
    mockProbeRedisOperability.mockResolvedValue({
      status: 'healthy',
      latencyMs: 5,
    });
    mockRunBillingSyncRemediation.mockResolvedValue({
      findings: 0,
      filed: [],
      skipped: false,
    });
    mockGetAuthSignupOnboardingCanaryStatus.mockImplementation(async () => ({
      runAt: new Date().toISOString(),
    }));
    mockGetPublicProfileCanaryStatus.mockImplementation(async () => ({
      runAt: new Date().toISOString(),
    }));
    mockRunReleaseEmailCanary.mockImplementation(async () => ({
      runAt: new Date().toISOString(),
      status: 'failed',
      failureReason: 'not_configured',
    }));
    mockGetReleaseEmailCanaryStatus.mockImplementation(async () => ({
      runAt: new Date().toISOString(),
    }));
    mockApplySummerCardDefaults.mockResolvedValue({
      checked: 2,
      defaulted: 1,
      approvedByDefault: 1,
      rejectedByDefault: 0,
      raced: 0,
      cardIds: ['sc_0123456789abcdef0123456789abcdef'],
    });
    mockRefreshCompanyStateCache.mockResolvedValue({
      revision: 'company-state-revision',
      activeConstraint: 'certification:public_profile',
      investigations: [{ id: 'certification:public_profile' }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('qualifies admin-added leads while discovery is off', async () => {
    mockUnqualifiedLeadRows.current = [{ id: 'lead-manual-1' }];
    mockProcessLeadBatch.mockResolvedValue({
      total: 1,
      qualified: 1,
      disqualified: 0,
      error: 0,
    });
    const { GET } = await import('@/app/api/cron/frequent/route');

    const response = await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // Discovery (SerpAPI spend) stays behind its own flag.
    expect(mockRunDiscovery).not.toHaveBeenCalled();
    expect(mockResetBudgetIfNeeded).not.toHaveBeenCalled();
    expect(mockProcessLeadBatch).toHaveBeenCalledWith(['lead-manual-1']);
    // Auto-approve still applies its own caps (daily limit, fit threshold).
    expect(mockRunAutoApprove).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, discoveryEnabled: false })
    );
    expect(data.results.leadDiscovery).toMatchObject({
      success: true,
      data: {
        discovery: { skipped: true, reason: 'discovery_disabled' },
        qualification: { total: 1, qualified: 1 },
      },
    });
  });

  it('qualifies leftover leads even when discovery finds nothing new', async () => {
    mockLeadSettingsRows.current = [{ enabled: true, discoveryEnabled: true }];
    mockRunDiscovery.mockResolvedValue({
      queriesUsed: 1,
      newLeadsFound: 0,
      candidatesProcessed: 3,
      budgetRemaining: 9,
    });
    mockUnqualifiedLeadRows.current = [{ id: 'lead-retry-1' }];
    const { GET } = await import('@/app/api/cron/frequent/route');

    await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    expect(mockRunDiscovery).toHaveBeenCalledOnce();
    expect(mockProcessLeadBatch).toHaveBeenCalledWith(['lead-retry-1']);
  });

  it('picks the least recently touched leads first so deferred ones rotate', async () => {
    mockUnqualifiedLeadRows.current = [{ id: 'lead-old-1' }];
    const { GET } = await import('@/app/api/cron/frequent/route');

    await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );

    // Without an order, the same 30 leads that HTML access can't read would
    // be picked on every tick and starve the rest of the queue.
    expect(mockLeadsOrderBy).toHaveBeenCalled();
    expect(mockProcessLeadBatch).toHaveBeenCalledWith(['lead-old-1']);
  });

  it('does not qualify or auto-approve while the lead pipeline is disabled', async () => {
    mockLeadSettingsRows.current = [{ enabled: false, discoveryEnabled: true }];
    mockUnqualifiedLeadRows.current = [{ id: 'lead-manual-1' }];
    const { GET } = await import('@/app/api/cron/frequent/route');

    const response = await GET(
      new Request('http://localhost/api/cron/frequent', {
        headers: { Authorization: 'Bearer test-secret' },
      })
    );
    const data = await response.json();

    expect(mockRunDiscovery).not.toHaveBeenCalled();
    expect(mockProcessLeadBatch).not.toHaveBeenCalled();
    expect(mockRunAutoApprove).not.toHaveBeenCalled();
    expect(data.results.leadDiscovery).toEqual({
      success: true,
      data: { skipped: true, reason: 'pipeline_disabled' },
    });
  });
});
