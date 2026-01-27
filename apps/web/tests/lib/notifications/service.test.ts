/**
 * Notification Service Tests
 * Tests for the notification dispatch service
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/notifications/preferences', () => ({
  getNotificationPreferences: vi.fn(),
  markNotificationDismissed: vi.fn(),
}));

vi.mock('@/lib/notifications/providers/resend', () => ({
  ResendEmailProvider: vi.fn().mockImplementation(function (this: any) {
    this.provider = 'resend';
    this.sendEmail = vi.fn().mockResolvedValue({
      channel: 'email',
      status: 'sent',
      provider: 'resend',
      detail: 'msg-123',
    });
  }),
}));

vi.mock('@/lib/notifications/config', () => ({
  NOTIFICATIONS_BRAND_NAME: 'Jovie',
  EMAIL_FROM_ADDRESS: 'notifications@notify.jov.ie',
  EMAIL_REPLY_TO: 'reply@example.com',
}));

vi.mock('@/lib/notifications/suppression', () => ({
  isEmailSuppressed: vi.fn(),
  logDelivery: vi.fn(),
}));

import {
  getNotificationPreferences,
  markNotificationDismissed,
} from '@/lib/notifications/preferences';
import {
  dismissNotification,
  sendNotification,
  setEmailProvider,
} from '@/lib/notifications/service';
import {
  isEmailSuppressed,
  logDelivery,
} from '@/lib/notifications/suppression';
import type {
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

describe('Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock for preferences
    vi.mocked(getNotificationPreferences).mockResolvedValue({
      channels: { email: true, push: false, in_app: true },
      marketingEmails: true,
      dismissedNotificationIds: [],
      email: 'user@example.com',
    });

    // Default mock for suppression check (not suppressed)
    vi.mocked(isEmailSuppressed).mockResolvedValue({
      suppressed: false,
    });

    // Default mock for delivery logging
    vi.mocked(logDelivery).mockResolvedValue(undefined);
  });

  describe('sendNotification', () => {
    const baseMessage: NotificationMessage = {
      id: 'test-notification-1',
      subject: 'Test Subject',
      text: 'Test content',
      html: '<p>Test content</p>',
      category: 'transactional',
    };

    const baseTarget: NotificationTarget = {
      email: 'user@example.com',
      creatorProfileId: 'creator-123',
    };

    it('should send email notification when channel is enabled', async () => {
      const result = await sendNotification(baseMessage, baseTarget);

      expect(result.delivered).toContain('email');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('sent');
    });

    it('should skip notification when channel is disabled', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: false, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
        email: 'user@example.com',
      });

      const result = await sendNotification(baseMessage, baseTarget);

      expect(result.delivered).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('disabled');
    });

    it('should skip dismissed notifications', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: ['test-notification-1'],
        email: 'user@example.com',
      });

      const result = await sendNotification(baseMessage, baseTarget);

      expect(result.delivered).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('dismissed');
    });

    it('should respect dismissible flag', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: ['test-notification-1'],
        email: 'user@example.com',
      });

      const nonDismissibleMessage: NotificationMessage = {
        ...baseMessage,
        dismissible: false,
      };

      const result = await sendNotification(nonDismissibleMessage, baseTarget);

      // Should still send even though ID is in dismissed list
      expect(result.delivered).toContain('email');
    });

    it('should use dedupKey when provided', async () => {
      const messageWithDedupKey: NotificationMessage = {
        ...baseMessage,
        dedupKey: 'custom-dedup-key',
      };

      const result = await sendNotification(messageWithDedupKey, baseTarget);

      expect(result.dedupKey).toBe('custom-dedup-key');
    });

    it('should skip email when no email address available', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
        email: null,
      });

      const targetWithoutEmail: NotificationTarget = {
        creatorProfileId: 'creator-123',
      };

      const result = await sendNotification(baseMessage, targetWithoutEmail);

      expect(result.delivered).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('No email');
    });

    it('should skip marketing emails when preference is disabled', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: false,
        dismissedNotificationIds: [],
        email: 'user@example.com',
      });

      const marketingMessage: NotificationMessage = {
        ...baseMessage,
        category: 'marketing',
      };

      const result = await sendNotification(marketingMessage, baseTarget);

      expect(result.delivered).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('Marketing emails');
    });

    it('should send transactional emails regardless of marketing preference', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: false,
        dismissedNotificationIds: [],
        email: 'user@example.com',
      });

      const result = await sendNotification(baseMessage, baseTarget);

      expect(result.delivered).toContain('email');
    });

    it('should use default email channel when none specified', async () => {
      const messageWithoutChannels: NotificationMessage = {
        id: 'test-2',
        subject: 'Test',
        text: 'Content',
        category: 'transactional',
      };

      const result = await sendNotification(messageWithoutChannels, baseTarget);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].channel).toBe('email');
    });

    it('should deduplicate channels', async () => {
      const messageWithDuplicateChannels: NotificationMessage = {
        ...baseMessage,
        channels: ['email', 'email', 'email'],
      };

      const result = await sendNotification(
        messageWithDuplicateChannels,
        baseTarget
      );

      // Should only process email once
      expect(result.results).toHaveLength(1);
    });

    it('should skip unimplemented channels', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: true, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
        email: 'user@example.com',
      });

      const messageWithPush: NotificationMessage = {
        ...baseMessage,
        channels: ['push'],
      };

      const result = await sendNotification(messageWithPush, baseTarget);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('not implemented');
    });

    it('should respect respectUserPreferences flag', async () => {
      vi.mocked(getNotificationPreferences).mockResolvedValue({
        channels: { email: true, push: false, in_app: true },
        marketingEmails: false,
        dismissedNotificationIds: [],
        email: 'user@example.com',
      });

      const forceMarketingMessage: NotificationMessage = {
        ...baseMessage,
        category: 'marketing',
        respectUserPreferences: false,
      };

      const result = await sendNotification(forceMarketingMessage, baseTarget);

      // Should send despite marketing emails being disabled
      expect(result.delivered).toContain('email');
    });

    it('should skip suppressed emails', async () => {
      vi.mocked(isEmailSuppressed).mockResolvedValue({
        suppressed: true,
        reason: 'hard_bounce',
        source: 'webhook',
      });

      const result = await sendNotification(baseMessage, baseTarget);

      expect(result.delivered).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].detail).toContain('suppressed');
      expect(result.skipped[0].detail).toContain('hard_bounce');
    });

    it('should log suppressed deliveries', async () => {
      vi.mocked(isEmailSuppressed).mockResolvedValue({
        suppressed: true,
        reason: 'spam_complaint',
        source: 'webhook',
      });

      await sendNotification(baseMessage, baseTarget);

      expect(logDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          status: 'suppressed',
          recipientEmail: 'user@example.com',
          metadata: expect.objectContaining({
            suppressionReason: 'spam_complaint',
          }),
        })
      );
    });

    it('should log successful deliveries', async () => {
      await sendNotification(baseMessage, baseTarget);

      expect(logDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          status: 'sent',
          recipientEmail: 'user@example.com',
          providerMessageId: 'msg-123',
        })
      );
    });

    it('should check suppression with target email', async () => {
      await sendNotification(baseMessage, baseTarget);

      expect(isEmailSuppressed).toHaveBeenCalledWith('user@example.com');
    });
  });

  describe('dismissNotification', () => {
    it('should call markNotificationDismissed with correct params', async () => {
      const target: NotificationTarget = {
        creatorProfileId: 'creator-123',
      };

      await dismissNotification('notification-id', target);

      expect(markNotificationDismissed).toHaveBeenCalledWith(
        'notification-id',
        target
      );
    });
  });

  describe('setEmailProvider', () => {
    it('should allow setting a custom email provider', async () => {
      const customProvider = {
        provider: 'debug' as const,
        sendEmail: vi.fn().mockResolvedValue({
          channel: 'email',
          status: 'sent',
          provider: 'debug',
          detail: 'debug-id',
        }),
      };

      setEmailProvider(customProvider);

      const message: NotificationMessage = {
        id: 'test',
        subject: 'Test',
        text: 'Content',
        category: 'transactional',
      };

      const target: NotificationTarget = {
        email: 'user@example.com',
      };

      await sendNotification(message, target);

      expect(customProvider.sendEmail).toHaveBeenCalled();
    });
  });
});
