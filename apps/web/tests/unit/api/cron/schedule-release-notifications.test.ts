import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockGetBatchCreatorEntitlements, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockGetBatchCreatorEntitlements: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
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
  },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  fanReleaseNotifications: {
    dedupKey: 'fanReleaseNotifications.dedupKey',
    status: 'fanReleaseNotifications.status',
    id: 'fanReleaseNotifications.id',
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
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

describe('scheduleReleaseNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T18:00:00.000Z'));

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'release_1',
            creatorProfileId: 'creator_1',
            title: 'Launch Day',
            releaseDate: new Date('2026-03-24T18:00:00.000Z'),
          },
        ]),
      }),
    });

    mockGetBatchCreatorEntitlements.mockRejectedValue(
      new Error('temporary entitlements outage')
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws so the cron can retry when entitlements lookup fails', async () => {
    const { scheduleReleaseNotifications } = await import(
      '@/app/api/cron/schedule-release-notifications/route'
    );

    await expect(scheduleReleaseNotifications()).rejects.toThrow(
      'Creator entitlements lookup failed while scheduling release notifications'
    );
    expect(mockGetBatchCreatorEntitlements).toHaveBeenCalledWith(['creator_1']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[schedule-release-notifications] Batch entitlements lookup failed, preserving releases for retry',
      expect.objectContaining({
        error: 'temporary entitlements outage',
        creatorCount: 1,
      })
    );
  });
});
