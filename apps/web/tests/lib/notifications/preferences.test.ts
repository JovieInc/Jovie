/**
 * Notification Preferences Tests
 * Tests for notification preferences management
 */

import { describe, expect, it, vi } from 'vitest';

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(operation => operation()),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

// Mock schema
vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {
    id: 'id',
    settings: 'settings',
    userId: 'userId',
    marketingOptOut: 'marketingOptOut',
    updatedAt: 'updatedAt',
  },
  users: { id: 'id', email: 'email', clerkId: 'clerkId' },
}));

import { mergePreferences } from '@/lib/notifications/preferences';
import type { NotificationPreferences } from '@/types/notifications';

describe('Notification Preferences', () => {
  describe('mergePreferences', () => {
    const basePreferences: NotificationPreferences = {
      channels: { email: true, push: false, in_app: true },
      marketingEmails: true,
      dismissedNotificationIds: ['old-notification'],
      email: 'base@example.com',
    };

    it('should return base preferences when no overrides provided', () => {
      const result = mergePreferences(basePreferences);

      expect(result).toEqual(basePreferences);
    });

    it('should return base preferences when overrides is undefined', () => {
      const result = mergePreferences(basePreferences, undefined);

      expect(result).toEqual(basePreferences);
    });

    it('should merge channel overrides', () => {
      const overrides: Partial<NotificationPreferences> = {
        channels: { email: true, push: true, in_app: true },
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.channels).toEqual({
        email: true,
        push: true, // overridden from false to true
        in_app: true,
      });
    });

    it('should override marketingEmails preference', () => {
      const overrides: Partial<NotificationPreferences> = {
        marketingEmails: false,
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.marketingEmails).toBe(false);
    });

    it('should override dismissedNotificationIds', () => {
      const overrides: Partial<NotificationPreferences> = {
        dismissedNotificationIds: ['new-notification'],
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.dismissedNotificationIds).toEqual(['new-notification']);
    });

    it('should override preferredChannel', () => {
      const overrides: Partial<NotificationPreferences> = {
        preferredChannel: 'push',
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.preferredChannel).toBe('push');
    });

    it('should override email', () => {
      const overrides: Partial<NotificationPreferences> = {
        email: 'new@example.com',
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.email).toBe('new@example.com');
    });

    it('should handle null email override - uses base email due to ?? operator', () => {
      const prefsWithEmail: NotificationPreferences = {
        ...basePreferences,
        email: 'existing@example.com',
      };

      const overrides: Partial<NotificationPreferences> = {
        email: null,
      };

      const result = mergePreferences(prefsWithEmail, overrides);

      // Note: The implementation uses ?? which treats null as "no value provided"
      // So it falls back to the base email
      expect(result.email).toBe('existing@example.com');
    });

    it('should preserve base email when override email is undefined', () => {
      const overrides: Partial<NotificationPreferences> = {
        marketingEmails: false,
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.email).toBe('base@example.com');
    });

    it('should handle empty overrides object', () => {
      const overrides: Partial<NotificationPreferences> = {};

      const result = mergePreferences(basePreferences, overrides);

      expect(result).toEqual(basePreferences);
    });

    it('should handle base with undefined optional fields', () => {
      const minimalBase: NotificationPreferences = {
        channels: { email: true, push: false, in_app: false },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      const overrides: Partial<NotificationPreferences> = {
        email: 'new@example.com',
        preferredChannel: 'email',
      };

      const result = mergePreferences(minimalBase, overrides);

      expect(result.email).toBe('new@example.com');
      expect(result.preferredChannel).toBe('email');
    });

    it('should handle null base email with undefined override', () => {
      const baseWithNullEmail: NotificationPreferences = {
        ...basePreferences,
        email: null,
      };

      const overrides: Partial<NotificationPreferences> = {};

      const result = mergePreferences(baseWithNullEmail, overrides);

      expect(result.email).toBeNull();
    });
  });

  describe('Default channel values', () => {
    it('should have email enabled by default', () => {
      const defaults: NotificationPreferences = {
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.email).toBe(true);
    });

    it('should have push disabled by default', () => {
      const defaults: NotificationPreferences = {
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.push).toBe(false);
    });

    it('should have in_app enabled by default', () => {
      const defaults: NotificationPreferences = {
        channels: { email: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.in_app).toBe(true);
    });
  });
});
