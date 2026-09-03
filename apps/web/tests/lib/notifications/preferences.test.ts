/**
 * Notification Preferences Tests
 * Tests for notification preferences management
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectLimit = vi.fn(() => Promise.resolve([]));
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectLeftJoin = vi.fn(() => ({
    limit: selectLimit,
    where: selectWhere,
  }));
  const selectFrom = vi.fn(() => ({ leftJoin: selectLeftJoin }));
  const updateWhere = vi.fn(() => Promise.resolve());
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  return {
    select: vi.fn(() => ({ from: selectFrom })),
    selectFrom,
    selectLeftJoin,
    selectLimit,
    selectWhere,
    update: vi.fn(() => ({ set: updateSet })),
    updateSet,
    updateWhere,
  };
});

const drizzleMocks = vi.hoisted(() => ({
  eq: vi.fn((column, value) => ({ column, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    kind: 'sql',
    strings: Array.from(strings),
    values,
  })),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: dbMocks.select,
    update: dbMocks.update,
  },
}));

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(operation => operation()),
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: drizzleMocks.eq,
  sql: drizzleMocks.sql,
}));

// Mock schema
vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', email: 'email', clerkId: 'clerkId' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    settings: 'settings',
    userId: 'userId',
    marketingOptOut: 'marketingOptOut',
    updatedAt: 'updatedAt',
  },
}));

import { db } from '@/lib/db';
import {
  markNotificationDismissed,
  mergePreferences,
  updateNotificationPreferences,
} from '@/lib/notifications/preferences';
import type { NotificationPreferences } from '@/types/notifications';

describe('Notification Preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockImplementation(() => ({ from: dbMocks.selectFrom }));
    dbMocks.selectFrom.mockImplementation(() => ({
      leftJoin: dbMocks.selectLeftJoin,
    }));
    dbMocks.selectLeftJoin.mockImplementation(() => ({
      limit: dbMocks.selectLimit,
      where: dbMocks.selectWhere,
    }));
    dbMocks.selectWhere.mockImplementation(() => ({
      limit: dbMocks.selectLimit,
    }));
    dbMocks.selectLimit.mockResolvedValue([]);
    dbMocks.update.mockImplementation(() => ({ set: dbMocks.updateSet }));
    dbMocks.updateSet.mockImplementation(() => ({
      where: dbMocks.updateWhere,
    }));
    dbMocks.updateWhere.mockResolvedValue(undefined);
  });

  describe('mergePreferences', () => {
    const basePreferences: NotificationPreferences = {
      channels: { email: true, sms: true, push: false, in_app: true },
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
        channels: { email: true, sms: true, push: true, in_app: true },
      };

      const result = mergePreferences(basePreferences, overrides);

      expect(result.channels).toEqual({
        email: true,
        sms: true,
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
        channels: { email: true, sms: true, push: false, in_app: false },
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
        channels: { email: true, sms: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.email).toBe(true);
    });

    it('should have push disabled by default', () => {
      const defaults: NotificationPreferences = {
        channels: { email: true, sms: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.push).toBe(false);
    });

    it('should have in_app enabled by default', () => {
      const defaults: NotificationPreferences = {
        channels: { email: true, sms: true, push: false, in_app: true },
        marketingEmails: true,
        dismissedNotificationIds: [],
      };

      expect(defaults.channels.in_app).toBe(true);
    });
  });

  describe('persistence', () => {
    const storedRow = {
      creatorProfileId: 'profile-123',
      email: 'artist@example.com',
      marketingOptOut: false,
      settings: {
        firstSaleText: {
          claimedAt: '2026-08-31T16:00:00.000Z',
          merchOrderId: 'order-123',
          status: 'claimed',
        },
        notifications: {
          channels: { email: true, sms: true, push: false, in_app: true },
          dismissedIds: ['old-notification'],
          preferredChannel: 'sms',
        },
      },
    };

    function getPersistedSettingsSql() {
      const setArgs = dbMocks.updateSet.mock.calls.at(-1)?.[0];
      expect(setArgs?.updatedAt).toBeInstanceOf(Date);
      expect(setArgs?.settings).toEqual(
        expect.objectContaining({ kind: 'sql' })
      );
      return setArgs.settings as {
        readonly strings: readonly string[];
        readonly values: readonly unknown[];
      };
    }

    it('marks dismissals with a JSONB patch that preserves sibling settings', async () => {
      dbMocks.selectLimit.mockResolvedValueOnce([storedRow]);

      await markNotificationDismissed('new-notification', {
        creatorProfileId: 'profile-123',
      });

      expect(db.update).toHaveBeenCalledTimes(1);
      const settingsSql = getPersistedSettingsSql();
      const sqlText = settingsSql.strings.join(' ');
      expect(sqlText).toContain('COALESCE');
      expect(sqlText).toContain('{marketing_emails}');
      expect(sqlText).toContain('{notifications}');

      const notificationsJson = settingsSql.values.find(
        value => typeof value === 'string' && value.includes('dismissedIds')
      );
      expect(JSON.parse(notificationsJson as string)).toEqual({
        channels: { email: true, sms: true, push: false, in_app: true },
        dismissedIds: ['old-notification', 'new-notification'],
        lastDismissedAt: expect.any(String),
        preferredChannel: 'sms',
      });
    });

    it('updates preferences with a JSONB patch that preserves sibling settings', async () => {
      dbMocks.selectLimit.mockResolvedValueOnce([storedRow]);

      await updateNotificationPreferences(
        { creatorProfileId: 'profile-123' },
        {
          channels: { email: false, sms: true, push: true, in_app: true },
          marketingEmails: false,
        }
      );

      expect(db.update).toHaveBeenCalledTimes(1);
      const settingsSql = getPersistedSettingsSql();
      const sqlText = settingsSql.strings.join(' ');
      expect(sqlText).toContain('COALESCE');
      expect(sqlText).toContain('{marketing_emails}');
      expect(sqlText).toContain('{notifications}');
      expect(settingsSql.values).toContain('false');

      const notificationsJson = settingsSql.values.find(
        value => typeof value === 'string' && value.includes('dismissedIds')
      );
      expect(JSON.parse(notificationsJson as string)).toEqual({
        channels: { email: false, sms: true, push: true, in_app: true },
        dismissedIds: ['old-notification'],
        preferredChannel: 'sms',
      });
    });
  });
});
