import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { APP_URL, AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import {
  audienceMembers,
  creatorProfiles,
  notificationSubscriptions,
  users,
} from '@/lib/db/schema';
import { STATSIG_FLAGS } from '@/lib/flags';
import { checkGateForUser } from '@/lib/flags/server';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import { updateNotificationPreferences } from '@/lib/notifications/preferences';
import { sendNotification } from '@/lib/notifications/service';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import { createScopedLogger } from '@/lib/utils/logger';
import type {
  NotificationApiResponse,
  NotificationChannel,
  NotificationContactValues,
  NotificationErrorCode,
  NotificationPreferences,
  NotificationStatusResponse,
  NotificationSubscribeResponse,
  NotificationSubscriptionState,
  NotificationTarget,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

const log = createScopedLogger('NotificationsDomain');

type NotificationDomainResponse<T> = {
  status: number;
  body: NotificationApiResponse<T>;
};

type NotificationDomainContext = {
  headers?: Headers;
};

type NotificationSubscribeDomainResponse =
  NotificationDomainResponse<NotificationSubscribeResponse> & {
    audienceIdentified: boolean;
  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;

const buildErrorResponse = (
  status: number,
  error: string,
  code: NotificationErrorCode,
  details?: Record<string, unknown>
): NotificationDomainResponse<never> => ({
  status,
  body: {
    success: false,
    error,
    code,
    details,
  },
});

const buildSubscribeErrorResponse = (
  status: number,
  error: string,
  code: NotificationErrorCode,
  details?: Record<string, unknown>
): NotificationSubscribeDomainResponse => ({
  ...buildErrorResponse(status, error, code, details),
  audienceIdentified: false,
});

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(CONTROL_CHAR_REGEX, '').replace(/\s+/g, ' ');
  return cleaned || null;
};

const sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replace(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

const subscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'sms']).default('email'),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
    country_code: z
      .string()
      .length(2)
      .regex(/^[a-zA-Z]{2}$/)
      .optional(),
    city: z.string().max(120).optional(),
    source: z.string().min(1).max(80).default('profile_bell'),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'email' && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required for email notifications.',
        path: ['email'],
      });
    }

    if (data.channel === 'sms' && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone number is required for SMS notifications.',
        path: ['phone'],
      });
    }
  });

const unsubscribeSchema = z
  .object({
    artist_id: z.string().uuid(),
    channel: z.enum(['email', 'sms']).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
    token: z.string().optional(),
    method: z
      .enum(['email_link', 'dashboard', 'api', 'dropdown'])
      .default('api'),
  })
  .superRefine((data, ctx) => {
    const hasToken = Boolean(data.token);
    const hasEmail = Boolean(data.email);
    const hasPhone = Boolean(data.phone);

    if (hasToken || hasEmail || hasPhone) return;

    const path =
      data.channel === 'sms'
        ? ['phone']
        : data.channel === 'email'
          ? ['email']
          : ['channel'];

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either email, phone, or token must be provided.',
      path,
    });
  });

const statusSchema = z
  .object({
    artist_id: z.string().uuid(),
    email: z.string().email().optional(),
    phone: z.string().min(1).max(64).optional(),
  })
  .refine(
    data => Boolean(data.email) || Boolean(data.phone),
    'Email or phone is required'
  );

export const buildInvalidRequestResponse = () =>
  buildErrorResponse(400, 'Invalid request data', 'invalid_request');

export const subscribeToNotificationsDomain = async (
  payload: unknown,
  context: NotificationDomainContext = {}
): Promise<NotificationSubscribeDomainResponse> => {
  const runtimeStart = Date.now();
  const bodyObject = isRecord(payload) ? payload : {};

  try {
    await trackServerEvent('notifications_subscribe_attempt', {
      artist_id:
        typeof bodyObject.artist_id === 'string' ? bodyObject.artist_id : null,
      channel:
        typeof bodyObject.channel === 'string' ? bodyObject.channel : 'email',
      email_length:
        typeof bodyObject.email === 'string' ? bodyObject.email.length : 0,
      phone_length:
        typeof bodyObject.phone === 'string' ? bodyObject.phone.length : 0,
      source:
        typeof bodyObject.source === 'string' ? bodyObject.source : 'unknown',
    });

    const result = subscribeSchema.safeParse(payload);

    if (!result.success) {
      await trackServerEvent('notifications_subscribe_error', {
        artist_id:
          typeof bodyObject.artist_id === 'string'
            ? bodyObject.artist_id
            : null,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        source:
          typeof bodyObject.source === 'string' ? bodyObject.source : 'unknown',
      });

      return buildSubscribeErrorResponse(
        400,
        'Invalid request data',
        'validation_error'
      );
    }

    const { artist_id, email, phone, channel, source, country_code, city } =
      result.data;

    const [artistProfile] = await db
      .select({
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        creatorIsPro: users.isPro,
        creatorClerkId: users.clerkId,
      })
      .from(creatorProfiles)
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, artist_id))
      .limit(1);

    if (!artistProfile) {
      await trackServerEvent('notifications_subscribe_error', {
        artist_id,
        error_type: 'artist_not_found',
        source,
      });

      return buildSubscribeErrorResponse(404, 'Artist not found', 'not_found');
    }

    const creatorIsPro = !!artistProfile.creatorIsPro;
    const creatorClerkId =
      typeof artistProfile.creatorClerkId === 'string'
        ? artistProfile.creatorClerkId
        : null;

    const dynamicOverrideEnabled = creatorClerkId
      ? await checkGateForUser(STATSIG_FLAGS.DYNAMIC_ENGAGEMENT, {
          userID: creatorClerkId,
        })
      : false;

    const dynamicEnabled = creatorIsPro || dynamicOverrideEnabled;

    const ipAddress = getForwardedIp(context.headers);
    const geoCountry =
      getHeader(context.headers, 'x-vercel-ip-country') ||
      getHeader(context.headers, 'cf-ipcountry') ||
      null;
    const geoCity = getHeader(context.headers, 'x-vercel-ip-city');
    const countryCode = sanitizeCountryCode(geoCountry ?? country_code);
    const cityValue = sanitizeCity(city ?? geoCity);

    const normalizedEmail =
      channel === 'email' ? (normalizeSubscriptionEmail(email) ?? null) : null;
    const normalizedPhone =
      channel === 'sms' ? (normalizeSubscriptionPhone(phone) ?? null) : null;

    if (channel === 'email' && !normalizedEmail) {
      await trackServerEvent('notifications_subscribe_error', {
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid email address'],
        source,
      });

      return buildSubscribeErrorResponse(
        400,
        'Please provide a valid email address',
        'validation_error'
      );
    }

    if (channel === 'sms' && !normalizedPhone) {
      await trackServerEvent('notifications_subscribe_error', {
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid phone number'],
        source,
      });

      return buildSubscribeErrorResponse(
        400,
        'Please provide a valid phone number',
        'validation_error'
      );
    }

    const conflictTarget =
      channel === 'email'
        ? [
            notificationSubscriptions.creatorProfileId,
            notificationSubscriptions.email,
          ]
        : [
            notificationSubscriptions.creatorProfileId,
            notificationSubscriptions.phone,
          ];

    const [insertedSubscription] = await db
      .insert(notificationSubscriptions)
      .values({
        creatorProfileId: artist_id,
        channel,
        email: normalizedEmail,
        phone: channel === 'sms' ? normalizedPhone : null,
        countryCode,
        city: cityValue,
        ipAddress,
        source,
      })
      .onConflictDoNothing({ target: conflictTarget })
      .returning({
        id: notificationSubscriptions.id,
      });

    await trackServerEvent('notifications_subscribe_success', {
      artist_id,
      channel,
      email_domain: normalizedEmail ? normalizedEmail.split('@')[1] : undefined,
      phone_present: Boolean(normalizedPhone),
      country_code: countryCode ?? undefined,
      source,
      creator_is_pro: creatorIsPro,
      dynamic_enabled: dynamicEnabled,
    });

    if (dynamicEnabled && normalizedEmail) {
      const ua = getHeader(context.headers, 'user-agent') || null;
      const fingerprint = createFingerprint(ipAddress, ua);
      const now = new Date();

      await withSystemIngestionSession(async tx => {
        await tx
          .insert(audienceMembers)
          .values({
            creatorProfileId: artist_id,
            fingerprint,
            type: 'email',
            displayName: 'Subscriber',
            email: normalizedEmail,
            firstSeenAt: now,
            lastSeenAt: now,
            visits: 0,
            engagementScore: 0,
            intentLevel: 'low',
            deviceType: 'unknown',
            referrerHistory: [],
            latestActions: [],
            tags: [],
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              audienceMembers.creatorProfileId,
              audienceMembers.fingerprint,
            ],
            set: {
              type: 'email',
              email: normalizedEmail,
              lastSeenAt: now,
              updatedAt: now,
            },
          });
      });
    }

    let dispatchResult: Awaited<ReturnType<typeof sendNotification>> | null =
      null;

    if (channel === 'email' && normalizedEmail && insertedSubscription?.id) {
      const profileUrl = `${APP_URL.replace(/\/$/, '')}/${artistProfile.username}`;
      const artistName =
        artistProfile.displayName || artistProfile.username || 'this artist';
      const dedupKey = `notification_subscribe:${artist_id}:${normalizedEmail}`;

      dispatchResult = await sendNotification(
        {
          id: dedupKey,
          dedupKey,
          category: 'transactional',
          subject: `You're subscribed to ${artistName} on Jovie`,
          text: `Thanks for turning on notifications. We'll email you when ${artistName} drops new music.\n\nManage your notification settings anytime: ${profileUrl}/notifications`,
          html: `
            <p>Thanks for turning on notifications for <strong>${artistName}</strong>.</p>
            <p>We'll email you when ${artistName} drops new music or updates their profile.</p>
            <p style="margin:16px 0;">
              <a href="${profileUrl}/notifications" style="padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Manage notifications</a>
            </p>
            <p style="font-size:14px;color:#555;">If you didn't request this, you can ignore this email or unsubscribe from the artist page.</p>
          `,
          channels: ['email'],
          respectUserPreferences: false,
          dismissible: true,
        },
        {
          email: normalizedEmail,
          creatorProfileId: artist_id,
        }
      );
    }

    return {
      status: 200,
      audienceIdentified: dynamicEnabled,
      body: {
        success: true,
        message: 'Subscription successful',
        emailDispatched: dispatchResult?.delivered.includes('email') ?? false,
        durationMs: Math.round(Date.now() - runtimeStart),
      },
    };
  } catch (error) {
    await trackServerEvent('notifications_subscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    log.error('Subscribe domain error', { error });
    return buildSubscribeErrorResponse(500, 'Server error', 'server_error');
  }
};

export const unsubscribeFromNotificationsDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<NotificationUnsubscribeResponse>> => {
  const bodyObject = isRecord(payload) ? payload : {};

  try {
    const result = unsubscribeSchema.safeParse(payload);

    await trackServerEvent('notifications_unsubscribe_attempt', {
      artist_id:
        typeof bodyObject.artist_id === 'string' ? bodyObject.artist_id : null,
      method: typeof bodyObject.method === 'string' ? bodyObject.method : 'api',
      channel:
        typeof bodyObject.channel === 'string'
          ? bodyObject.channel
          : typeof bodyObject.phone === 'string'
            ? 'phone'
            : 'email',
    });

    if (!result.success) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id:
          typeof bodyObject.artist_id === 'string'
            ? bodyObject.artist_id
            : null,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        channel:
          typeof bodyObject.channel === 'string'
            ? bodyObject.channel
            : typeof bodyObject.phone === 'string'
              ? 'phone'
              : 'email',
      });

      return buildErrorResponse(
        400,
        'Invalid request data',
        'validation_error'
      );
    }

    const { artist_id, email, phone, token, method, channel } = result.data;

    if (!email && !phone && !token) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: channel || (phone ? 'sms' : 'email'),
      });

      return buildErrorResponse(
        400,
        'Either email, phone, or token must be provided',
        'missing_identifier'
      );
    }

    const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
    const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

    if (phone && !normalizedPhone) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid phone number'],
        channel: channel || 'sms',
      });

      return buildErrorResponse(
        400,
        'Please provide a valid phone number',
        'validation_error'
      );
    }

    const targetChannel: NotificationChannel =
      channel || (normalizedPhone ? 'sms' : 'email');

    if (!normalizedEmail && !normalizedPhone) {
      await trackServerEvent('notifications_unsubscribe_error', {
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: targetChannel,
      });

      return buildErrorResponse(
        400,
        'Contact required to unsubscribe',
        'missing_identifier'
      );
    }

    const whereClauses = [
      eq(notificationSubscriptions.creatorProfileId, artist_id),
    ];

    if (targetChannel === 'email' && normalizedEmail) {
      whereClauses.push(eq(notificationSubscriptions.email, normalizedEmail));
      whereClauses.push(eq(notificationSubscriptions.channel, 'email'));
    } else if (targetChannel === 'sms' && normalizedPhone) {
      whereClauses.push(eq(notificationSubscriptions.phone, normalizedPhone));
      whereClauses.push(eq(notificationSubscriptions.channel, 'sms'));
    }

    const deleted = await db
      .delete(notificationSubscriptions)
      .where(and(...whereClauses))
      .returning({ id: notificationSubscriptions.id });

    await trackServerEvent('notifications_unsubscribe_success', {
      artist_id,
      method,
      channel: targetChannel,
    });

    return {
      status: 200,
      body: {
        success: true,
        removed: deleted.length,
        message:
          deleted.length > 0
            ? 'Unsubscription successful'
            : 'No matching subscription found',
      },
    };
  } catch (error) {
    await trackServerEvent('notifications_unsubscribe_error', {
      error_type: 'server_error',
      error_message: error instanceof Error ? error.message : String(error),
    });

    log.error('Unsubscribe domain error', { error });
    return buildErrorResponse(500, 'Server error', 'server_error');
  }
};

export const getNotificationStatusDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<NotificationStatusResponse>> => {
  try {
    const result = statusSchema.safeParse(payload);

    if (!result.success) {
      return buildErrorResponse(
        400,
        'Invalid request data',
        'validation_error'
      );
    }

    const { artist_id, email, phone } = result.data;
    const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
    const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

    if (phone && !normalizedPhone) {
      return buildErrorResponse(
        400,
        'Please provide a valid phone number',
        'validation_error'
      );
    }

    const channels: NotificationSubscriptionState = {
      email: false,
      sms: false,
    };
    const details: NotificationContactValues = {};

    const lookups: Array<{
      channel: NotificationChannel;
      value: string | null;
    }> = [
      { channel: 'email', value: normalizedEmail },
      { channel: 'sms', value: normalizedPhone },
    ];

    for (const lookup of lookups) {
      if (!lookup.value) continue;

      const rows = await db
        .select({
          id: notificationSubscriptions.id,
          value:
            lookup.channel === 'email'
              ? notificationSubscriptions.email
              : notificationSubscriptions.phone,
        })
        .from(notificationSubscriptions)
        .where(
          and(
            eq(notificationSubscriptions.creatorProfileId, artist_id),
            eq(notificationSubscriptions.channel, lookup.channel),
            eq(
              lookup.channel === 'email'
                ? notificationSubscriptions.email
                : notificationSubscriptions.phone,
              lookup.value
            )
          )
        )
        .limit(1);

      if (rows.length > 0) {
        channels[lookup.channel] = true;
        details[lookup.channel] = lookup.value;
      }
    }

    return {
      status: 200,
      body: {
        success: true,
        channels,
        details,
      },
    };
  } catch (error) {
    log.error('Status domain error', { error });
    return buildErrorResponse(500, 'Server error', 'server_error');
  }
};

export const updateNotificationPreferencesDomain = async (
  target: NotificationTarget,
  updates: Partial<NotificationPreferences>
) => {
  await updateNotificationPreferences(target, updates);
};

export const AUDIENCE_COOKIE_NAME = AUDIENCE_IDENTIFIED_COOKIE;
