import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET,
  sendPendingNotifications,
} from '@/app/api/cron/send-release-notifications/route';

const {
  mockDbSelect,
  mockDbUpdate,
  mockGetBatchCreatorEntitlements,
  mockLoggerWarn,
  mockGetReleaseDayNotificationEmail,
  mockSendNotification,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
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

describe('fan release audience dispatch denial', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect.mockImplementation(() => {
      throw new Error('must not read audiences');
    });
    mockDbUpdate.mockImplementation(() => {
      throw new Error('must not recover or claim jobs');
    });
    mockSendNotification.mockResolvedValue({
      delivered: ['email', 'sms'],
      errors: [],
    });
  });

  it('blocks queued, due, trial and retry work before all database/provider effects', async () => {
    const result = await sendPendingNotifications();
    expect(result).toMatchObject({
      sent: 0,
      failed: 0,
      skipped: 0,
      processed: 0,
      policyBlocked: {
        reason: 'audience_delivery_disabled',
        dispatchAllowed: false,
        retryable: false,
        queueDisposition: 'do_not_enqueue_or_retry',
      },
    });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockGetBatchCreatorEntitlements).not.toHaveBeenCalled();
    expect(mockGetReleaseDayNotificationEmail).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('repeated triggers never recover or retry stored delivery work', async () => {
    await sendPendingNotifications();
    await sendPendingNotifications();
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it('reports policy refusal through the authenticated cron endpoint', async () => {
    const response = await GET(
      new Request('https://jov.ie/api/cron/send-release-notifications', {
        headers: { authorization: 'Bearer test-secret' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data).toMatchObject({
      sent: 0,
      processed: 0,
      policyBlocked: { reason: 'audience_delivery_disabled', retryable: false },
    });
    expect(data.message).not.toBe('No pending notifications to send');
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer incorrect'])(
    'retains cron authentication with %s',
    async authorization => {
      const response = await GET(
        new Request('https://jov.ie/api/cron/send-release-notifications', {
          headers: authorization ? { authorization } : {},
        })
      );
      expect(response.status).toBe(401);
      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
    }
  );
});
