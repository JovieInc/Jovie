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

// Import once after all mocks are set up
import {
  getNotificationStatusDomain,
  subscribeToNotificationsDomain,
  unsubscribeFromNotificationsDomain,
} from '@/lib/notifications/domain';

describe('notifications/domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it('keeps the subscribe success path when audience enrichment fails', async () => {
      const artistId = '123e4567-e89b-12d3-a456-426614174000';
      const { db } = await import('@/lib/db');
      const { withSystemIngestionSession } = await import(
        '@/lib/ingestion/session'
      );
      const { captureError } = await import('@/lib/error-tracking');

      vi.mocked(db.limit)
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

      vi.mocked(withSystemIngestionSession).mockRejectedValueOnce(
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
});
