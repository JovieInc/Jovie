import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbUpdateSet,
  mockDbUpdateWhere,
  mockDbUpdateReturning,
  mockGetBatchCreatorEntitlements,
  mockLoggerWarn,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbUpdateSet: vi.fn(),
  mockDbUpdateWhere: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockGetBatchCreatorEntitlements: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  notificationSubscriptions: {
    id: 'notificationSubscriptions.id',
    channel: 'notificationSubscriptions.channel',
    email: 'notificationSubscriptions.email',
    phone: 'notificationSubscriptions.phone',
    name: 'notificationSubscriptions.name',
    unsubscribedAt: 'notificationSubscriptions.unsubscribedAt',
    confirmedAt: 'notificationSubscriptions.confirmedAt',
    preferences: 'notificationSubscriptions.preferences',
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'discogReleases.id',
    title: 'discogReleases.title',
    slug: 'discogReleases.slug',
    artworkUrl: 'discogReleases.artworkUrl',
    releaseDate: 'discogReleases.releaseDate',
    sourceType: 'discogReleases.sourceType',
  },
  providerLinks: {
    ownerType: 'providerLinks.ownerType',
    releaseId: 'providerLinks.releaseId',
    providerId: 'providerLinks.providerId',
    url: 'providerLinks.url',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    billingVersion: 'users.billingVersion',
    trialNotificationsSent: 'users.trialNotificationsSent',
    updatedAt: 'users.updatedAt',
  },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  fanReleaseNotifications: {
    id: 'fanReleaseNotifications.id',
    creatorProfileId: 'fanReleaseNotifications.creatorProfileId',
    releaseId: 'fanReleaseNotifications.releaseId',
    notificationSubscriptionId:
      'fanReleaseNotifications.notificationSubscriptionId',
    notificationType: 'fanReleaseNotifications.notificationType',
    metadata: 'fanReleaseNotifications.metadata',
    status: 'fanReleaseNotifications.status',
    scheduledFor: 'fanReleaseNotifications.scheduledFor',
    createdAt: 'fanReleaseNotifications.createdAt',
    updatedAt: 'fanReleaseNotifications.updatedAt',
    sentAt: 'fanReleaseNotifications.sentAt',
    error: 'fanReleaseNotifications.error',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'creatorProfiles.id',
    displayName: 'creatorProfiles.displayName',
    isClaimed: 'creatorProfiles.isClaimed',
    settings: 'creatorProfiles.settings',
    spotifyId: 'creatorProfiles.spotifyId',
    userId: 'creatorProfiles.userId',
    username: 'creatorProfiles.username',
    usernameNormalized: 'creatorProfiles.usernameNormalized',
  },
}));

vi.mock('@/lib/email/templates/release-day-notification', () => ({
  getReleaseDayNotificationEmail: vi.fn(),
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

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn(),
}));

vi.mock('@/lib/utils/date', () => ({
  toISOStringSafe: vi.fn(() => '2026-03-24T00:00:00.000Z'),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

function createPendingNotificationsChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createWhereResolvedChain(result: unknown) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

describe('sendPendingNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockDbUpdate.mockReturnValue({
      set: mockDbUpdateSet,
    });
    mockDbUpdateSet.mockReturnValue({
      where: mockDbUpdateWhere,
    });
    mockDbUpdateWhere.mockReturnValue({
      returning: mockDbUpdateReturning,
    });
    mockDbUpdateReturning.mockResolvedValue([]);

    mockDbSelect
      .mockReturnValueOnce(
        createPendingNotificationsChain([
          {
            id: 'notif_1',
            creatorProfileId: 'creator_1',
            releaseId: 'release_1',
            notificationSubscriptionId: 'sub_1',
            notificationType: 'release_day',
            metadata: {},
          },
        ])
      )
      .mockReturnValueOnce(createWhereResolvedChain([]))
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'creator_1',
            displayName: 'Creator One',
            isClaimed: true,
            ownerUserId: 'user_1',
            settings: { spotifyImportStatus: 'complete' },
            spotifyId: 'spotify_1',
            trialNotificationsSent: 0,
            username: 'creatorone',
            usernameNormalized: 'creatorone',
          },
        ])
      )
      .mockReturnValueOnce(createWhereResolvedChain([]))
      .mockReturnValueOnce(createWhereResolvedChain([]));

    mockGetBatchCreatorEntitlements.mockRejectedValue(
      new Error('temporary entitlements outage')
    );
  });

  it('throws so the cron can retry when entitlements lookup fails', async () => {
    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    await expect(sendPendingNotifications()).rejects.toThrow(
      'Creator entitlements lookup failed while sending release notifications'
    );
    expect(mockGetBatchCreatorEntitlements).toHaveBeenCalledWith(['creator_1']);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[send-release-notifications] Batch entitlements lookup failed, preserving pending notifications for retry',
      expect.objectContaining({
        error: 'temporary entitlements outage',
        creatorCount: 1,
      })
    );
  });

  it('skips notifications for creators without send entitlement', async () => {
    // Override the rejected entitlements to return a result with canSendNotifications: false.
    // Shape must match getBatchCreatorEntitlements return: { plan, entitlements: { booleans: {...} } }
    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'free',
            entitlements: {
              booleans: { canSendNotifications: false },
              limits: {},
            },
          },
        ],
      ])
    );

    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    const result = await sendPendingNotifications();
    expect(result).toBeDefined();
    expect(mockGetBatchCreatorEntitlements).toHaveBeenCalledWith(['creator_1']);
    // Ineligible creator's notification should be cancelled, not sent
    expect(result.sent).toBe(0);
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
  });
});
