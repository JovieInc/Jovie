import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbInsert,
  mockDbInsertOnConflictDoUpdate,
  mockGetBatchCreatorEntitlements,
  mockLoggerInfo,
  mockLoggerWarn,
  mockGte,
  mockLte,
  mockInArray,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbInsertOnConflictDoUpdate: vi.fn(),
  mockGetBatchCreatorEntitlements: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  // Simplified passthrough mocks so assertions can inspect exact args instead
  // of walking drizzle-orm's internal SQL queryChunks structure. `and`/`eq`/
  // `asc`/`sql`/`gt` stay real (via importActual below) — they just need to
  // not throw when combining these plain objects, which they don't.
  mockGte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  mockLte: vi.fn((col: unknown, val: unknown) => ({ op: 'lte', col, val })),
  mockInArray: vi.fn((col: unknown, vals: unknown) => ({
    op: 'inArray',
    col,
    vals,
  })),
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    gte: mockGte,
    lte: mockLte,
    inArray: mockInArray,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  notificationSubscriptions: {
    id: 'notificationSubscriptions.id',
    creatorProfileId: 'notificationSubscriptions.creatorProfileId',
    unsubscribedAt: 'notificationSubscriptions.unsubscribedAt',
    confirmedAt: 'notificationSubscriptions.confirmedAt',
    preferences: 'notificationSubscriptions.preferences',
    email: 'notificationSubscriptions.email',
    phone: 'notificationSubscriptions.phone',
    channel: 'notificationSubscriptions.channel',
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'discogReleases.id',
    creatorProfileId: 'discogReleases.creatorProfileId',
    title: 'discogReleases.title',
    releaseDate: 'discogReleases.releaseDate',
    sourceType: 'discogReleases.sourceType',
  },
  providerLinks: {
    ownerType: 'providerLinks.ownerType',
    releaseId: 'providerLinks.releaseId',
  },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  fanReleaseNotifications: {
    dedupKey: 'fanReleaseNotifications.dedupKey',
    status: 'fanReleaseNotifications.status',
    id: 'fanReleaseNotifications.id',
    campaignId: 'fanReleaseNotifications.campaignId', // JOV-2211
  },
}));

vi.mock('@/lib/entitlements/creator-plan', () => ({
  getBatchCreatorEntitlements: mockGetBatchCreatorEntitlements,
}));

vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

const { GET, scheduleReleaseNotifications } = await import(
  '@/app/api/cron/schedule-release-notifications/route'
);

describe('fan release audience queue admission denial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelect.mockImplementation(() => {
      throw new Error('must not read fan audiences');
    });
    mockDbInsert.mockImplementation(() => {
      throw new Error('must not enqueue or revive jobs');
    });
  });

  it('blocks the scheduling window before fan/release reads, entitlements or inserts', async () => {
    expect(await scheduleReleaseNotifications()).toMatchObject({
      scheduled: 0,
      releasesFound: 0,
      policyBlocked: {
        reason: 'audience_delivery_disabled',
        dispatchAllowed: false,
        retryable: false,
        queueDisposition: 'do_not_enqueue_or_retry',
      },
    });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockGetBatchCreatorEntitlements).not.toHaveBeenCalled();
  });

  it('does not enqueue duplicates or revive cancelled jobs on repeated cron triggers', async () => {
    await scheduleReleaseNotifications();
    await scheduleReleaseNotifications();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbInsertOnConflictDoUpdate).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns a policy receipt rather than claiming the scheduling window is empty', async () => {
    const response = await GET(
      new Request('https://jov.ie/api/cron/schedule-release-notifications', {
        headers: { authorization: 'Bearer test-secret' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data).toMatchObject({
      scheduled: 0,
      policyBlocked: { reason: 'audience_delivery_disabled' },
    });
    expect(data.message).not.toBe(
      'No release notifications to schedule in the current window'
    );
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer incorrect'])(
    'retains cron authentication with %s',
    async authorization => {
      const response = await GET(
        new Request('https://jov.ie/api/cron/schedule-release-notifications', {
          headers: authorization ? { authorization } : {},
        })
      );
      expect(response.status).toBe(401);
      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(mockDbInsert).not.toHaveBeenCalled();
    }
  );
});
