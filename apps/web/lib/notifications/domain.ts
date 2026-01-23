import { and, eq, or } from 'drizzle-orm';
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

/** Matches C0 control characters (U+0000-U+001F) and DEL (U+007F) using Unicode property escapes */
const CONTROL_CHAR_REGEX = /\p{Cc}/gu;

const getHeader = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? null;

const getForwardedIp = (headers?: Headers) =>
  getHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || null;

const sanitizeCity = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replaceAll(CONTROL_CHAR_REGEX, '')
    .replaceAll(/\s+/g, ' ');
  return cleaned || null;
};

const sanitizeCountryCode = (raw: string | null | undefined) => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 2).toUpperCase();
  const normalized = trimmed.replaceAll(/[^A-Z]/g, '');
  return normalized.length === 2 ? normalized : null;
};

export { buildInvalidRequestResponse };

/**
 * Validates and normalizes the contact value based on channel type.
 * Returns error response if validation fails.
 */
async function validateContactForChannel(
  channel: NotificationChannel,
  normalizedEmail: string | null,
  normalizedPhone: string | null,
  artist_id: string,
  source: string | undefined
): Promise<NotificationSubscribeDomainResponse | null> {
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
    return buildSubscribeValidationError('Please provide a valid phone number');
  }

  return null;
}

/**
 * Creates or updates an audience member for dynamic engagement tracking.
 */
async function upsertAudienceMember(
  artist_id: string,
  normalizedEmail: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  const fingerprint = createFingerprint(ipAddress, userAgent);
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
        target: [audienceMembers.creatorProfileId, audienceMembers.fingerprint],
        set: {
          type: 'email',
          email: normalizedEmail,
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  });
}

/**
 * Sends subscription confirmation email.
 */
async function sendSubscriptionConfirmationEmail(
  artist_id: string,
  normalizedEmail: string,
  artistProfile: { displayName: string | null; username: string | null }
): Promise<Awaited<ReturnType<typeof sendNotification>>> {
  const profileUrl = `${APP_URL.replace(/\/$/, '')}/${artistProfile.username}`;
  const artistName =
    artistProfile.displayName || artistProfile.username || 'this artist';
  const dedupKey = `notification_subscribe:${artist_id}:${normalizedEmail}`;

  return sendNotification(
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

    const validationError = await validateContactForChannel(
      channel,
      normalizedEmail,
      normalizedPhone,
      artist_id,
      source
    );
    if (validationError) {
      return validationError;
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
      await upsertAudienceMember(artist_id, normalizedEmail, ipAddress, ua);
    }

    let dispatchResult: Awaited<ReturnType<typeof sendNotification>> | null =
      null;

    if (channel === 'email' && normalizedEmail && insertedSubscription?.id) {
      dispatchResult = await sendSubscriptionConfirmationEmail(
        artist_id,
        normalizedEmail,
        artistProfile
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

async function validateUnsubscribeIdentifiers(
  email: string | undefined,
  phone: string | undefined,
  token: string | undefined,
  artist_id: string,
  method: string | undefined,
  channel: NotificationChannel | undefined
): Promise<
  | {
      normalizedEmail: string | null;
      normalizedPhone: string | null;
      targetChannel: NotificationChannel;
    }
  | NotificationDomainResponse<NotificationUnsubscribeResponse>
> {
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
    return buildValidationErrorResponse('Please provide a valid phone number');
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

  return { normalizedEmail, normalizedPhone, targetChannel };
}

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

    const validation = await validateUnsubscribeIdentifiers(
      email,
      phone,
      token,
      artist_id,
      method,
      channel
    );

    if ('status' in validation) {
      return validation;
    }

    const { normalizedEmail, normalizedPhone, targetChannel } = validation;

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

    const valueClauses: Array<ReturnType<typeof and>> = [];

    if (normalizedEmail) {
      valueClauses.push(
        and(
          eq(notificationSubscriptions.channel, 'email'),
          eq(notificationSubscriptions.email, normalizedEmail)
        )
      );
    }

    if (normalizedPhone) {
      valueClauses.push(
        and(
          eq(notificationSubscriptions.channel, 'sms'),
          eq(notificationSubscriptions.phone, normalizedPhone)
        )
      );
    }

    if (valueClauses.length === 0) {
      return buildValidationErrorResponse('Contact required to check status');
    }

    const rows = await db
      .select({
        channel: notificationSubscriptions.channel,
        email: notificationSubscriptions.email,
        phone: notificationSubscriptions.phone,
      })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, artist_id),
          or(...valueClauses)
        )
      )
      .limit(2);

    for (const row of rows) {
      if (row.channel === 'email' && row.email) {
        channels.email = true;
        details.email = row.email;
      }

      if (row.channel === 'sms' && row.phone) {
        channels.sms = true;
        details.sms = row.phone;
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
