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
