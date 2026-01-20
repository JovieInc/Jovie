import { and, eq } from 'drizzle-orm';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { APP_URL, AUDIENCE_IDENTIFIED_COOKIE } from '@/constants/app';
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
import {
  extractPayloadProps,
  inferChannel,
  trackServerError,
  trackSubscribeAttempt,
  trackSubscribeError,
  trackSubscribeSuccess,
  trackUnsubscribeAttempt,
  trackUnsubscribeError,
  trackUnsubscribeSuccess,
} from '@/lib/notifications/analytics';
import { updateNotificationPreferences } from '@/lib/notifications/preferences';
import {
  buildInvalidRequestResponse,
  buildMissingIdentifierResponse,
  buildServerErrorResponse,
  buildStatusSuccessResponse,
  buildSubscribeNotFoundError,
  buildSubscribeServerError,
  buildSubscribeSuccessResponse,
  buildSubscribeValidationError,
  buildUnsubscribeSuccessResponse,
  buildValidationErrorResponse,
  type NotificationDomainContext,
  type NotificationDomainResponse,
  type NotificationSubscribeDomainResponse,
} from '@/lib/notifications/response';
import { sendNotification } from '@/lib/notifications/service';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import {
  statusSchema,
  subscribeSchema,
  unsubscribeSchema,
} from '@/lib/validation/schemas';
import type {
  NotificationChannel,
  NotificationContactValues,
  NotificationPreferences,
  NotificationStatusResponse,
  NotificationSubscriptionState,
  NotificationTarget,
  NotificationUnsubscribeResponse,
} from '@/types/notifications';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(CONTROL_CHAR_REGEX, '').replaceAll(/\s+/g, ' ');
  return cleaned || null;
};

const sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replaceAll(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

export { buildInvalidRequestResponse };

export const subscribeToNotificationsDomain = async (
  payload: unknown,
  context: NotificationDomainContext = {}
): Promise<NotificationSubscribeDomainResponse> => {
  const runtimeStart = Date.now();
  const bodyObject = isRecord(payload) ? payload : {};

  try {
    await trackSubscribeAttempt(bodyObject);

    const result = subscribeSchema.safeParse(payload);

    if (!result.success) {
      const props = extractPayloadProps(bodyObject);
      await trackSubscribeError({
        artist_id: props.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        source: props.source,
      });
      return buildSubscribeValidationError();
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
      await trackSubscribeError({
        artist_id,
        error_type: 'artist_not_found',
        source,
      });
      return buildSubscribeNotFoundError();
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
      await trackSubscribeError({
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid email address'],
        source,
      });
      return buildSubscribeValidationError(
        'Please provide a valid email address'
      );
    }

    if (channel === 'sms' && !normalizedPhone) {
      await trackSubscribeError({
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid phone number'],
        source,
      });
      return buildSubscribeValidationError(
        'Please provide a valid phone number'
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

    await trackSubscribeSuccess({
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

    return buildSubscribeSuccessResponse(
      dynamicEnabled,
      dispatchResult?.delivered.includes('email') ?? false,
      Math.round(Date.now() - runtimeStart)
    );
  } catch (error) {
    await trackServerError('subscribe', error);
    console.error('[Notifications Subscribe Domain] Error:', error);
    return buildSubscribeServerError();
  }
};

export const unsubscribeFromNotificationsDomain = async (
  payload: unknown
): Promise<NotificationDomainResponse<NotificationUnsubscribeResponse>> => {
  const bodyObject = isRecord(payload) ? payload : {};

  try {
    const result = unsubscribeSchema.safeParse(payload);

    await trackUnsubscribeAttempt(bodyObject);

    if (!result.success) {
      const props = extractPayloadProps(bodyObject);
      await trackUnsubscribeError({
        artist_id: props.artist_id,
        error_type: 'validation_error',
        validation_errors: result.error.format()._errors,
        channel: inferChannel(bodyObject),
      });
      return buildValidationErrorResponse('Invalid request data');
    }

    const { artist_id, email, phone, token, method, channel } = result.data;

    if (!email && !phone && !token) {
      const targetChannel = channel || (phone ? 'sms' : 'email');
      await trackUnsubscribeError({
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: targetChannel,
      });
      return buildMissingIdentifierResponse(
        'Either email, phone, or token must be provided'
      );
    }

    const normalizedEmail = normalizeSubscriptionEmail(email) ?? null;
    const normalizedPhone = normalizeSubscriptionPhone(phone) ?? null;

    if (phone && !normalizedPhone) {
      const targetChannel = channel || 'sms';
      await trackUnsubscribeError({
        artist_id,
        error_type: 'validation_error',
        validation_errors: ['Invalid phone number'],
        channel: targetChannel,
      });
      return buildValidationErrorResponse(
        'Please provide a valid phone number'
      );
    }

    const targetChannel: NotificationChannel =
      channel || (normalizedPhone ? 'sms' : 'email');

    if (!normalizedEmail && !normalizedPhone) {
      await trackUnsubscribeError({
        artist_id,
        error_type: 'missing_identifier',
        method,
        channel: targetChannel,
      });
      return buildMissingIdentifierResponse('Contact required to unsubscribe');
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

    await trackUnsubscribeSuccess({
      artist_id,
      method,
      channel: targetChannel,
    });

    return buildUnsubscribeSuccessResponse(deleted.length);
  } catch (error) {
    await trackServerError('unsubscribe', error);
    console.error('[Notifications Unsubscribe Domain] Error:', error);
    return buildServerErrorResponse();
  }
};

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

    return buildStatusSuccessResponse(channels, details);
  } catch (error) {
    console.error('[Notifications Status Domain] Error:', error);
    return buildServerErrorResponse();
  }
};

export const updateNotificationPreferencesDomain = async (
  target: NotificationTarget,
  updates: Partial<NotificationPreferences>
) => {
  await updateNotificationPreferences(target, updates);
};

export const AUDIENCE_COOKIE_NAME = AUDIENCE_IDENTIFIED_COOKIE;
