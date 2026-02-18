import { and, eq, or } from 'drizzle-orm';
import { AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { db } from '@/lib/db';
import {
  type FanNotificationPreferences,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { updateNotificationPreferences } from '@/lib/notifications/preferences';
import {
  buildMissingIdentifierResponse,
  buildServerErrorResponse,
  buildStatusSuccessResponse,
  buildValidationErrorResponse,
  type NotificationDomainResponse,
} from '@/lib/notifications/response';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import {
  statusSchema,
  updateContentPreferencesSchema,
} from '@/lib/validation/schemas';
import type {
  NotificationContactValues,
  NotificationPreferences,
  NotificationStatusResponse,
  NotificationSubscriptionState,
  NotificationTarget,
} from '@/types/notifications';

const _isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Matches C0 control characters (U+0000-U+001F) and DEL (U+007F) using Unicode property escapes */
const CONTROL_CHAR_REGEX = /\p{Cc}/gu;

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const _getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const _sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replaceAll(CONTROL_CHAR_REGEX, '')
    .replaceAll(/\s+/g, ' ');
  return cleaned || null;
};

const _sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replaceAll(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

function buildSubscriptionClauses(
  normalizedEmail: string | null,
  normalizedPhone: string | null
): Array<ReturnType<typeof and>> {
  const clauses: Array<ReturnType<typeof and>> = [];

  if (normalizedEmail) {
    clauses.push(
      and(
        eq(notificationSubscriptions.channel, 'email'),
        eq(notificationSubscriptions.email, normalizedEmail)
      )
    );
  }

  if (normalizedPhone) {
    clauses.push(
      and(
        eq(notificationSubscriptions.channel, 'sms'),
        eq(notificationSubscriptions.phone, normalizedPhone)
      )
    );
  }

  return clauses;
}

/**
 * Merge subscription rows into channel states, contact details, and preferences.
 */
function mergeSubscriptionRows(
  rows: Array<{
    channel: string;
    email: string | null;
    phone: string | null;
    preferences: FanNotificationPreferences | null;
  }>
) {
  const channels: NotificationSubscriptionState = { email: false, sms: false };
  const details: NotificationContactValues = {};
  let mergedPrefs: FanNotificationPreferences | undefined;

  for (const row of rows) {
    if (row.channel === 'email' && row.email) {
      channels.email = true;
      details.email = row.email;
    }

    if (row.channel === 'sms' && row.phone) {
      channels.sms = true;
      details.sms = row.phone;
    }

    if (!mergedPrefs && row.preferences) {
      mergedPrefs = row.preferences;
    }
  }

  return { channels, details, mergedPrefs };
}

export const getNotificationStatusDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<NotificationStatusResponse>> => {
  try {
    const result = statusSchema.safeParse(payload);

    if (!result.success) {
      return buildValidationErrorResponse('Invalid request data');
    }

    const { artist_id, email, phone } = result.data;
    const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
    const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

    if (phone && !normalizedPhone) {
      return buildValidationErrorResponse(
        'Please provide a valid phone number'
      );
    }

    const valueClauses = buildSubscriptionClauses(
      normalizedEmail,
      normalizedPhone
    );

    if (valueClauses.length === 0) {
      return buildValidationErrorResponse('Contact required to check status');
    }

    const rows = await db
      .select({
        channel: notificationSubscriptions.channel,
        email: notificationSubscriptions.email,
        phone: notificationSubscriptions.phone,
        preferences: notificationSubscriptions.preferences,
      })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, artist_id),
          or(...valueClauses)
        )
      )
      .limit(2);

    const { channels, details, mergedPrefs } = mergeSubscriptionRows(rows);

    return buildStatusSuccessResponse(channels, details, mergedPrefs);
  } catch (error) {
    captureError('Notifications Status Domain Error', error);
    return buildServerErrorResponse();
  }
};

export const updateNotificationPreferencesDomain = async (
  target: NotificationTarget,
  updates: Partial<NotificationPreferences>
) => {
  await updateNotificationPreferences(target, updates);
};

/**
 * Update content notification preferences for a subscription.
 * Merges new preferences into the existing JSONB preferences column.
 */
export const updateContentPreferencesDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<{ success: true; updated: number }>> => {
  try {
    const result = updateContentPreferencesSchema.safeParse(payload);

    if (!result.success) {
      return buildValidationErrorResponse('Invalid request data');
    }

    const { artist_id, email, phone, preferences } = result.data;
    const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
    const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

    if (!normalizedEmail && !normalizedPhone) {
      return buildMissingIdentifierResponse(
        'Contact required to update preferences'
      );
    }

    // Build WHERE clause to find all matching subscriptions for this artist
    const contactClauses: Array<ReturnType<typeof eq>> = [];
    if (normalizedEmail) {
      contactClauses.push(eq(notificationSubscriptions.email, normalizedEmail));
    }
    if (normalizedPhone) {
      contactClauses.push(eq(notificationSubscriptions.phone, normalizedPhone));
    }

    // First read existing preferences so we can merge
    const existing = await db
      .select({
        id: notificationSubscriptions.id,
        preferences: notificationSubscriptions.preferences,
      })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, artist_id),
          or(...contactClauses)
        )
      )
      .limit(2);

    if (existing.length === 0) {
      return buildValidationErrorResponse('No subscription found');
    }

    // Merge new preferences into each subscription row
    let totalUpdated = 0;
    for (const row of existing) {
      const merged: FanNotificationPreferences = {
        ...row.preferences,
        ...preferences,
      };

      const [updated] = await db
        .update(notificationSubscriptions)
        .set({ preferences: merged })
        .where(eq(notificationSubscriptions.id, row.id))
        .returning({ id: notificationSubscriptions.id });

      if (updated) totalUpdated++;
    }

    return {
      status: 200,
      body: { success: true, updated: totalUpdated },
    };
  } catch (error) {
    captureError('Content preferences update error', error);
    return buildServerErrorResponse();
  }
};

export const AUDIENCE_COOKIE_NAME = AUDIENCE_IDENTIFIED_COOKIE;
