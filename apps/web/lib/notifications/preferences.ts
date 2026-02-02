import { eq } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
// eslint-disable-next-line no-restricted-imports -- Direct schema imports, not barrel
import { users } from '@/lib/db/schema/auth';
// eslint-disable-next-line no-restricted-imports -- Direct schema imports, not barrel
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type {
  NotificationDeliveryChannel,
  NotificationPreferences,
  NotificationTarget,
} from '@/types/notifications';

type NotificationSettings = {
  notifications?: {
    channels?: Partial<Record<NotificationDeliveryChannel, boolean>>;
    dismissedIds?: string[];
    dismissed_ids?: string[];
    lastDismissedAt?: string;
    preferredChannel?: NotificationDeliveryChannel;
  };
  marketing_emails?: boolean;
};

const DEFAULT_CHANNELS: Record<NotificationDeliveryChannel, boolean> = {
  email: true,
  push: false,
  in_app: true,
};

const EMPTY_PREFERENCES: NotificationPreferences = {
  channels: { ...DEFAULT_CHANNELS },
  marketingEmails: true,
  dismissedNotificationIds: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeChannels = (
  channels?: Partial<Record<NotificationDeliveryChannel, boolean>>
) => {
  return {
    ...DEFAULT_CHANNELS,
    ...channels,
  };
};

const normalizeDismissed = (settings?: {
  dismissedIds?: string[];
  dismissed_ids?: string[];
}) => {
  if (!settings) return [];
  if (Array.isArray(settings.dismissedIds)) return settings.dismissedIds;
  if (Array.isArray(settings.dismissed_ids)) return settings.dismissed_ids;
  return [];
};

const normalizePreferences = (
  settings: NotificationSettings,
  marketingOptOut?: boolean,
  fallbackEmail?: string | null
): NotificationPreferences => {
  const notifications = isRecord(settings.notifications)
    ? settings.notifications
    : {};

  return {
    channels: normalizeChannels(
      notifications.channels as Partial<
        Record<NotificationDeliveryChannel, boolean>
      >
    ),
    marketingEmails:
      typeof settings.marketing_emails === 'boolean'
        ? settings.marketing_emails
        : !marketingOptOut,
    dismissedNotificationIds: normalizeDismissed(notifications),
    preferredChannel:
      notifications.preferredChannel &&
      Object.hasOwn(DEFAULT_CHANNELS, notifications.preferredChannel)
        ? notifications.preferredChannel
        : undefined,
    email: fallbackEmail ?? null,
  };
};

export const mergePreferences = (
  base: NotificationPreferences,
  overrides?: Partial<NotificationPreferences>
): NotificationPreferences => {
  if (!overrides) return base;

  return {
    channels: {
      ...base.channels,
      ...overrides.channels,
    },
    marketingEmails:
      overrides.marketingEmails ??
      base.marketingEmails ??
      EMPTY_PREFERENCES.marketingEmails,
    dismissedNotificationIds:
      overrides.dismissedNotificationIds ?? base.dismissedNotificationIds,
    preferredChannel: overrides.preferredChannel ?? base.preferredChannel,
    email: overrides.email ?? base.email ?? null,
  };
};

const withNotificationSession = async <T>(
  target: NotificationTarget,
  operation: () => Promise<T>
): Promise<T> => {
  if (target.clerkUserId) {
    return await withDbSession(async () => operation(), {
      clerkUserId: target.clerkUserId,
    });
  }

  return await operation();
};

const fetchStoredPreferences = async (target: NotificationTarget) => {
  if (!target.creatorProfileId && !target.userId && !target.clerkUserId) {
    return {
      preferences: null as NotificationPreferences | null,
      creatorProfileId: null as string | null,
      settings: null,
    };
  }

  return await withNotificationSession(target, async () => {
    const baseQuery = db
      .select({
        settings: creatorProfiles.settings,
        marketingOptOut: creatorProfiles.marketingOptOut,
        email: users.email,
        creatorProfileId: creatorProfiles.id,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId));

    const whereCondition = (() => {
      if (target.creatorProfileId) {
        return eq(creatorProfiles.id, target.creatorProfileId);
      }
      if (target.userId) {
        return eq(creatorProfiles.userId, target.userId);
      }
      if (target.clerkUserId) {
        return eq(users.clerkId, target.clerkUserId);
      }
      return undefined;
    })();

    const query = whereCondition ? baseQuery.where(whereCondition) : baseQuery;

    const [row] = await query.limit(1);

    if (!row) {
      return { preferences: null, creatorProfileId: null, settings: null };
    }

    const rawSettings = isRecord(row.settings) ? row.settings : {};
    const typedSettings = rawSettings as NotificationSettings;

    return {
      preferences: normalizePreferences(
        typedSettings,
        row.marketingOptOut ?? false,
        target.email ?? row.email
      ),
      creatorProfileId: row.creatorProfileId,
      settings: rawSettings,
    };
  });
};

export const getNotificationPreferences = async (
  target: NotificationTarget
): Promise<NotificationPreferences> => {
  const { preferences: storedPreferences } =
    await fetchStoredPreferences(target);

  const base = storedPreferences ?? {
    ...EMPTY_PREFERENCES,
    email: target.email ?? null,
  };

  return mergePreferences(base, target.preferences);
};

export const markNotificationDismissed = async (
  notificationId: string,
  target: NotificationTarget
) => {
  if (!notificationId || !target.creatorProfileId) return;

  const {
    preferences: storedPreferences,
    creatorProfileId,
    settings,
  } = await fetchStoredPreferences(target);

  if (!storedPreferences || !creatorProfileId) return;

  const baseSettings = isRecord(settings) ? settings : {};
  const existingNotifications =
    (baseSettings as NotificationSettings).notifications ?? {};

  const dismissed = new Set([
    ...normalizeDismissed(existingNotifications),
    ...(storedPreferences.dismissedNotificationIds ?? []),
  ]);
  dismissed.add(notificationId);

  const nextSettings: NotificationSettings = {
    marketing_emails: storedPreferences.marketingEmails,
    notifications: {
      channels:
        existingNotifications.channels ??
        (storedPreferences.channels as Partial<
          Record<NotificationDeliveryChannel, boolean>
        >),
      dismissedIds: Array.from(dismissed),
      preferredChannel: storedPreferences.preferredChannel,
      lastDismissedAt: new Date().toISOString(),
    },
  };

  await withNotificationSession(target, async () => {
    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...baseSettings,
          ...nextSettings,
          notifications: {
            ...existingNotifications,
            ...nextSettings.notifications,
          },
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));
  });
};

export const updateNotificationPreferences = async (
  target: NotificationTarget,
  updates: Partial<NotificationPreferences>
) => {
  if (!updates) return;
  if (!target.creatorProfileId && !target.userId && !target.clerkUserId) return;

  const {
    preferences: storedPreferences,
    creatorProfileId,
    settings,
  } = await fetchStoredPreferences(target);

  if (!creatorProfileId) return;

  const basePreferences = storedPreferences ?? {
    ...EMPTY_PREFERENCES,
    email: target.email ?? null,
  };
  const mergedPreferences = mergePreferences(basePreferences, updates);
  const baseSettings = isRecord(settings) ? settings : {};
  const existingNotifications =
    (baseSettings as NotificationSettings).notifications ?? {};

  const nextSettings: NotificationSettings = {
    marketing_emails: mergedPreferences.marketingEmails,
    notifications: {
      channels: mergedPreferences.channels,
      dismissedIds: mergedPreferences.dismissedNotificationIds,
      preferredChannel: mergedPreferences.preferredChannel,
      lastDismissedAt: existingNotifications.lastDismissedAt,
    },
  };

  await withNotificationSession(target, async () => {
    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...baseSettings,
          ...nextSettings,
          notifications: {
            ...existingNotifications,
            ...nextSettings.notifications,
          },
        } as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, creatorProfileId));
  });
};
