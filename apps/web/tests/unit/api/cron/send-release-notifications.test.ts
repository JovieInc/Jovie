import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbUpdate,
  mockDbUpdateSet,
  mockDbUpdateWhere,
  mockDbUpdateReturning,
  mockGetBatchCreatorEntitlements,
  mockLoggerWarn,
  mockGetReleaseDayNotificationEmail,
  mockSendNotification,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbUpdateSet: vi.fn(),
  mockDbUpdateWhere: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockGetBatchCreatorEntitlements: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockGetReleaseDayNotificationEmail: vi.fn(),
  mockSendNotification: vi.fn(),
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
    campaignId: 'fanReleaseNotifications.campaignId', // JOV-2211
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
  getReleaseDayNotificationEmail: mockGetReleaseDayNotificationEmail,
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
  sendNotification: mockSendNotification,
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

  it('short-circuits and skips batch fetches when no pending notifications are due', async () => {
    // Reset the default `mockReturnValueOnce` chain set up in beforeEach, then wire
    // a single empty-results chain for fetchPendingNotifications. The fix in the
    // route swaps `drizzleSql\`x = ANY(${ids})\`` for `inArray(x, ids)` in the
    // batch-fetch helpers, but the empty short-circuit must continue to skip
    // those queries entirely so node-postgres never sees an empty UUID array.
    mockDbSelect.mockReset();
    mockDbSelect.mockReturnValueOnce(createPendingNotificationsChain([]));

    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    const result = await sendPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, processed: 0 });
    expect(mockGetBatchCreatorEntitlements).not.toHaveBeenCalled();
    // Only the pending-lookup select should have run; no batch fetches issued.
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
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

  it('marks notification as sent when the email dispatch succeeds', async () => {
    // Full happy-path chain: pending notification -> release -> creator ->
    // email subscriber -> streaming link (required for eligibility's
    // hasSmartLink check), then a successful sendNotification dispatch.
    mockDbSelect.mockReset();
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
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'release_1',
            title: 'New Album',
            slug: 'new-album',
            artworkUrl: null,
            releaseDate: null,
            sourceType: 'spotify',
          },
        ])
      )
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
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'sub_1',
            channel: 'email',
            email: 'fan@example.com',
            phone: null,
            name: 'Fan Name',
          },
        ])
      )
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            releaseId: 'release_1',
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/xyz',
          },
        ])
      );

    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
      ])
    );

    // First .returning() call is recoverStuckNotifications (no stuck rows);
    // second is claimNotification (claim succeeds so processing proceeds).
    mockDbUpdateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'notif_1' }]);

    mockGetReleaseDayNotificationEmail.mockReturnValue({
      subject: 'New release from Creator One',
      text: 'plain text body',
      html: '<p>html body</p>',
    });
    mockSendNotification.mockResolvedValue({
      delivered: ['email'],
      skipped: [],
      errors: [],
    });

    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    const result = await sendPendingNotifications();

    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0, processed: 1 });
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif_1',
        channels: ['email'],
        category: 'marketing',
      }),
      { email: 'fan@example.com' }
    );
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        sentAt: expect.any(Date),
        error: null,
      })
    );
  });

  it('marks notification as failed with the delivery error when the email dispatch fails', async () => {
    mockDbSelect.mockReset();
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
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'release_1',
            title: 'New Album',
            slug: 'new-album',
            artworkUrl: null,
            releaseDate: null,
            sourceType: 'spotify',
          },
        ])
      )
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
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'sub_1',
            channel: 'email',
            email: 'fan@example.com',
            phone: null,
            name: 'Fan Name',
          },
        ])
      )
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            releaseId: 'release_1',
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/xyz',
          },
        ])
      );

    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
      ])
    );

    mockDbUpdateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'notif_1' }]);

    mockGetReleaseDayNotificationEmail.mockReturnValue({
      subject: 'New release from Creator One',
      text: 'plain text body',
      html: '<p>html body</p>',
    });
    mockSendNotification.mockResolvedValue({
      delivered: [],
      skipped: [],
      errors: [
        {
          channel: 'email',
          status: 'error',
          error: 'Resend API error: rate limited',
        },
      ],
    });

    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    const result = await sendPendingNotifications();

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0, processed: 1 });
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        sentAt: null,
        error: 'Resend API error: rate limited',
      })
    );
  });

  it('isolates per-notification failures so one bad row does not block a sibling send', async () => {
    // notif_1 -> creator_1/release_1 will send successfully.
    // notif_2 -> creator_2/release_missing has no matching release row, so
    // processing throws "Release not found" and only that row is failed.
    // notif_3 -> creator_1/release_1 (different subscriber) is scheduled AFTER
    // the failing row and must still dispatch — this kills the abort-after-
    // failure mutant (continue -> break in processNotificationBatches), which
    // would be invisible if the failing notification were last in the batch.
    mockDbSelect.mockReset();
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
          {
            id: 'notif_2',
            creatorProfileId: 'creator_2',
            releaseId: 'release_missing',
            notificationSubscriptionId: 'sub_2',
            notificationType: 'release_day',
            metadata: {},
          },
          {
            id: 'notif_3',
            creatorProfileId: 'creator_1',
            releaseId: 'release_1',
            notificationSubscriptionId: 'sub_3',
            notificationType: 'release_day',
            metadata: {},
          },
        ])
      )
      .mockReturnValueOnce(
        // Only release_1 is returned; release_missing is intentionally absent.
        createWhereResolvedChain([
          {
            id: 'release_1',
            title: 'New Album',
            slug: 'new-album',
            artworkUrl: null,
            releaseDate: null,
            sourceType: 'spotify',
          },
        ])
      )
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
          {
            id: 'creator_2',
            displayName: 'Creator Two',
            isClaimed: true,
            ownerUserId: 'user_2',
            settings: { spotifyImportStatus: 'complete' },
            spotifyId: 'spotify_2',
            trialNotificationsSent: 0,
            username: 'creatortwo',
            usernameNormalized: 'creatortwo',
          },
        ])
      )
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            id: 'sub_1',
            channel: 'email',
            email: 'fan@example.com',
            phone: null,
            name: 'Fan Name',
          },
          {
            id: 'sub_3',
            channel: 'email',
            email: 'otherfan@example.com',
            phone: null,
            name: 'Other Fan',
          },
        ])
      )
      .mockReturnValueOnce(
        createWhereResolvedChain([
          {
            releaseId: 'release_1',
            providerId: 'spotify',
            url: 'https://open.spotify.com/track/xyz',
          },
        ])
      );

    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
        [
          'creator_2',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
      ])
    );

    // recoverStuckNotifications, then claimNotification for notif_1 and
    // notif_3 — notif_2 throws on the missing-release check before it ever
    // claims, so it never consumes a .returning() result.
    mockDbUpdateReturning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'notif_1' }])
      .mockResolvedValueOnce([{ id: 'notif_3' }]);

    mockGetReleaseDayNotificationEmail.mockReturnValue({
      subject: 'New release from Creator One',
      text: 'plain text body',
      html: '<p>html body</p>',
    });
    mockSendNotification.mockResolvedValue({
      delivered: ['email'],
      skipped: [],
      errors: [],
    });

    const { sendPendingNotifications } = await import(
      '@/app/api/cron/send-release-notifications/route'
    );

    const result = await sendPendingNotifications();

    expect(result).toEqual({ sent: 2, failed: 1, skipped: 0, processed: 3 });
    // notif_1 and notif_3 reach dispatch; notif_2 fails before send. notif_3
    // dispatching AFTER the failure proves processing continues past a failed
    // row instead of aborting the batch.
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
    expect(mockSendNotification).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'notif_1' }),
      { email: 'fan@example.com' }
    );
    expect(mockSendNotification).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'notif_3' }),
      { email: 'otherfan@example.com' }
    );
    const sentWrites = mockDbUpdateSet.mock.calls.filter(
      ([payload]) =>
        (payload as { status?: string } | undefined)?.status === 'sent'
    );
    expect(sentWrites).toHaveLength(2);
    expect(mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Release not found: release_missing',
      })
    );
  });
});
