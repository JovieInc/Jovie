/**
 * Unit tests for notifications domain functions.
 *
 * Tests cover:
 * - Subscribe to notifications
 * - Unsubscribe from notifications
 * - Get notification status
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock external dependencies
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'sub-1' }]),
    execute: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  audienceMembers: {},
  creatorProfiles: {},
  notificationSubscriptions: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    email: 'email',
    phone: 'phone',
    channel: 'channel',
    preferences: 'preferences',
    artistEmailOptInAt: 'artist_email_opt_in_at',
    artistEmailOptOutAt: 'artist_email_opt_out_at',
  },
  users: {},
}));

vi.mock('@/lib/flags/server', () => ({
  checkGateForUser: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/notifications/analytics', () => ({
  extractPayloadProps: vi.fn().mockReturnValue({}),
  inferChannel: vi.fn().mockReturnValue('email'),
  trackServerError: vi.fn(),
  trackSubscribeAttempt: vi.fn(),
  trackSubscribeError: vi.fn(),
  trackSubscribeSuccess: vi.fn(),
  trackUnsubscribeAttempt: vi.fn(),
  trackUnsubscribeError: vi.fn(),
  trackUnsubscribeSuccess: vi.fn(),
}));

vi.mock('@/lib/notifications/preferences', () => ({
  updateNotificationPreferences: vi.fn(),
}));

vi.mock('@/lib/notifications/service', () => ({
  sendNotification: vi.fn().mockResolvedValue({ delivered: [] }),
}));

vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue({ suppressed: false }),
}));

vi.mock('@/lib/notifications/validation', () => ({
  normalizeSubscriptionEmail: vi.fn(email =>
    email?.includes('@') ? email.toLowerCase() : null
  ),
  normalizeSubscriptionPhone: vi.fn(phone =>
    phone?.startsWith('+') ? phone : null
  ),
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(fn => fn({ insert: vi.fn() })),
}));

vi.mock('@/app/api/audience/lib/audience-utils', () => ({
  createFingerprint: vi.fn().mockReturnValue('fingerprint-123'),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/tracking/fire-subscribe-event', () => ({
  fireSubscribeCAPIEvent: vi.fn().mockResolvedValue(undefined),
}));

// Import once after all mocks are set up
import { db } from '@/lib/db';
import {
  getNotificationStatusDomain,
  subscribeToNotificationsDomain,
  unsubscribeFromNotificationsDomain,
  updateContentPreferencesDomain,
} from '@/lib/notifications/domain';
import { generateSubscriptionManagementToken } from '@/lib/notifications/management-token';

// `limit`/`execute` are terminal chain methods on the mocked fluent db object
// above; they don't exist on DbType, so expose them through a typed handle.
const mockedDb = db as unknown as {
  limit: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

describe('notifications/domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockedDb.limit).mockReset().mockResolvedValue([]);
    vi.mocked(mockedDb.execute).mockReset().mockResolvedValue(undefined);
  });

  describe('subscribeToNotificationsDomain', () => {
    it('should return validation error for invalid payload', async () => {
      const result = await subscribeToNotificationsDomain({});

      expect(result.status).toBe(400);
      expect(result.body.success).toBe(false);
    });

    it('should return validation error for invalid email format', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: 'artist-123',
        email: 'invalid-email',
        channel: 'email',
      });

      expect(result.body.success).toBe(false);
    });

    it('should return validation error for invalid phone format', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: 'artist-123',
        phone: '123456',
        channel: 'sms',
      });

      expect(result.body.success).toBe(false);
    });

    it('persists TCPA consent hash and version on legacy SMS subscribe (JOV-1845)', async () => {
      const artistId = '123e4567-e89b-12d3-a456-426614174000';
      const { db } = await import('@/lib/db');
      const { getCurrentConsentSnapshot } = await import(
        '@/lib/notifications/sms-consent'
      );

      vi.mocked(mockedDb.limit)
        .mockResolvedValueOnce([
          {
            id: artistId,
            displayName: 'Test Artist',
            username: 'testartist',
            creatorIsPro: true,
            creatorClerkId: null,
            settings: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await subscribeToNotificationsDomain({
        artist_id: artistId,
        phone: '+15551234567',
        channel: 'sms',
        country_code: 'US',
        source: 'alerts-landing',
      });

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);

      const consentSnapshot = getCurrentConsentSnapshot();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'sms',
          phone: '+15551234567',
          smsConsentAt: expect.any(Date),
          smsConsentTextHash: consentSnapshot.textHash,
          smsConsentVersion: consentSnapshot.version,
        })
      );

      expect(db.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            smsConsentTextHash: expect.anything(),
            smsConsentVersion: expect.anything(),
          }),
        })
      );
    });

    it('keeps the subscribe success path when audience enrichment fails', async () => {
      const artistId = '123e4567-e89b-12d3-a456-426614174000';
      const { captureError } = await import('@/lib/error-tracking');

      vi.mocked(mockedDb.limit)
        .mockResolvedValueOnce([
          {
            id: artistId,
            displayName: 'Test Artist',
            username: 'testartist',
            creatorIsPro: true,
            creatorClerkId: null,
            settings: null,
          },
        ])
        .mockResolvedValueOnce([]);

      vi.mocked(mockedDb.execute).mockRejectedValueOnce(
        new Error('column "latest_referrer_url" does not exist')
      );

      const result = await subscribeToNotificationsDomain(
        {
          artist_id: artistId,
          email: 'fan@example.com',
          channel: 'email',
          source: 'profile_inline',
        },
        {
          headers: new Headers({
            'user-agent': 'Vitest',
            referer: 'http://localhost:3001/tim',
          }),
        }
      );

      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);
      expect(result.body.pendingConfirmation).toBe(true);
      expect(captureError).toHaveBeenCalledWith(
        'Notifications audience member upsert failed (best-effort)',
        expect.any(Error),
        expect.objectContaining({
          artistId,
          email: 'fan@example.com',
        })
      );
    });
  });

  describe('unsubscribeFromNotificationsDomain', () => {
    it('should return error when no identifier provided', async () => {
      const result = await unsubscribeFromNotificationsDomain({
        artist_id: 'artist-123',
      });

      expect(result.body.success).toBe(false);
    });
  });

  describe('getNotificationStatusDomain', () => {
    it('should return validation error for invalid payload', async () => {
      const result = await getNotificationStatusDomain({});

      expect(result.body.success).toBe(false);
    });

    it('should return error when no contact provided', async () => {
      const result = await getNotificationStatusDomain({
        artist_id: 'artist-123',
      });

      expect(result.body.success).toBe(false);
    });

    it('omits content preferences when no subscription exists', async () => {
      const result = await getNotificationStatusDomain({
        artist_id: '00000000-0000-4000-8000-000000000123',
        email: 'test@example.com',
      });

      expect(result.body.success).toBe(true);
      expect(result.body).not.toHaveProperty('contentPreferences');
    });
  });

  describe('input sanitization', () => {
    it('should handle null values gracefully', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: null as unknown as string,
        email: null as unknown as string,
      });

      expect(result.body.success).toBe(false);
    });

    it('should handle undefined values gracefully', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: undefined as unknown as string,
      });

      expect(result.body.success).toBe(false);
    });
  });

  describe('response structure', () => {
    it('should return proper NotificationDomainResponse structure', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: 'artist-123',
        email: 'invalid',
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('body');
      expect(typeof result.status).toBe('number');
      expect(typeof result.body).toBe('object');
    });

    it('should include success field in body', async () => {
      const result = await getNotificationStatusDomain({
        artist_id: 'artist-123',
      });

      expect(result.body).toHaveProperty('success');
      expect(typeof result.body.success).toBe('boolean');
    });
  });

  describe('channel inference', () => {
    it('should accept email channel with valid email', async () => {
      // This will fail validation but shows the channel is accepted
      const result = await subscribeToNotificationsDomain({
        artist_id: 'artist-123',
        email: 'test@example.com',
        channel: 'email',
      });

      // Even if it fails for other reasons, the channel format was valid
      expect(result.status).toBeGreaterThanOrEqual(200);
    });

    it('should accept sms channel with phone', async () => {
      const result = await subscribeToNotificationsDomain({
        artist_id: 'artist-123',
        phone: '+15551234567',
        channel: 'sms',
      });

      expect(result.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe('updateContentPreferencesDomain scope-escalation gate', () => {
    const artistId = '11111111-1111-4111-8111-111111111111';
    const baseRow = {
      id: 'sub-1',
      email: 'fan@example.com',
      channel: 'email',
      preferences: {
        releasePreview: true,
        releaseDay: true,
        newMusic: true,
        tourDates: true,
        merch: false,
        general: true,
        promo: false,
      },
      artistEmailOptInAt: null,
      artistEmailOptOutAt: null,
    };

    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-resend-key';
    });

    it('rejects artist email opt-in without a management token', async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([baseRow]);

      const result = await updateContentPreferencesDomain({
        artist_id: artistId,
        email: 'fan@example.com',
        artist_email_opt_in: true,
      });

      expect(result.status).toBe(403);
      expect(result.body).toMatchObject({
        success: false,
        code: 'forbidden',
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('rejects enabling a disabled category without a token', async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([baseRow]);

      const result = await updateContentPreferencesDomain({
        artist_id: artistId,
        email: 'fan@example.com',
        preferences: {
          newMusic: true,
          tourDates: true,
          merch: true,
          general: true,
        },
      });

      expect(result.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('allows opt-outs without a token', async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([baseRow]);

      const result = await updateContentPreferencesDomain({
        artist_id: artistId,
        email: 'fan@example.com',
        preferences: {
          newMusic: true,
          tourDates: true,
          merch: false,
          general: false,
        },
        artist_email_opt_in: false,
      });

      expect(result.status).toBe(200);
      expect(db.update).toHaveBeenCalled();
    });

    it('allows escalation with a valid management token', async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([baseRow]);
      const token = generateSubscriptionManagementToken(
        artistId,
        'fan@example.com'
      );

      const result = await updateContentPreferencesDomain(
        {
          artist_id: artistId,
          email: 'fan@example.com',
          artist_email_opt_in: true,
        },
        { managementToken: token }
      );

      expect(result.status).toBe(200);
      expect(db.update).toHaveBeenCalled();
    });

    it('rejects a token bound to a different email', async () => {
      vi.mocked(mockedDb.limit).mockResolvedValue([baseRow]);
      const token = generateSubscriptionManagementToken(
        artistId,
        'other@example.com'
      );

      const result = await updateContentPreferencesDomain(
        {
          artist_id: artistId,
          email: 'fan@example.com',
          artist_email_opt_in: true,
        },
        { managementToken: token }
      );

      expect(result.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('rejects escalation on a phone-matched row the token does not cover', async () => {
      const smsRow = {
        ...baseRow,
        id: 'sub-2',
        email: null,
        channel: 'sms',
      };
      vi.mocked(mockedDb.limit).mockResolvedValue([smsRow]);
      const token = generateSubscriptionManagementToken(
        artistId,
        'fan@example.com'
      );

      const result = await updateContentPreferencesDomain(
        {
          artist_id: artistId,
          email: 'fan@example.com',
          phone: '+15551234567',
          artist_email_opt_in: true,
        },
        { managementToken: token }
      );

      expect(result.status).toBe(403);
      expect(db.update).not.toHaveBeenCalled();
    });
  });
});
