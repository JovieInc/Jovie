import { eq } from 'drizzle-orm';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { APP_URL } from '@/constants/app';
import { db } from '@/lib/db';
import {
  audienceMembers,
  type FanNotificationPreferences,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  buildSubscribeConfirmUrl,
  generateSubscribeConfirmToken,
} from '@/lib/email/subscribe-confirm-token';
import { captureError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  extractPayloadProps,
  trackServerError,
  trackSubscribeAttempt,
  trackSubscribeError,
  trackSubscribeSuccess,
} from '@/lib/notifications/analytics';
import {
  buildSubscribeNotFoundError,
  buildSubscribeServerError,
  buildSubscribeSuccessResponse,
  buildSubscribeValidationError,
  type NotificationDomainContext,
  type NotificationSubscribeDomainResponse,
} from '@/lib/notifications/response';
import { sendNotification } from '@/lib/notifications/service';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import { subscribeSchema } from '@/lib/validation/schemas';
import type { NotificationChannel } from '@/types/notifications';

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
 * Checks if an email is suppressed (hard bounce, spam complaint, etc.)
 * Returns an error response if suppressed, null otherwise.
 */
async function checkEmailSuppression(
  channel: NotificationChannel,
  normalizedEmail: string | null,
  artist_id: string,
  source: string | undefined
): Promise<NotificationSubscribeDomainResponse | null> {
  if (channel !== 'email' || !normalizedEmail) {
    return null;
  }

  const suppressionCheck = await isEmailSuppressed(normalizedEmail);
  if (!suppressionCheck.suppressed) {
    return null;
  }

  await trackSubscribeError({
    artist_id,
    error_type: 'suppressed',
    validation_errors: [
      `Email suppressed: ${suppressionCheck.reason ?? 'unknown'}`,
    ],
    source,
  });
  return buildSubscribeValidationError(
    'This email cannot receive notifications. Please try a different email address.'
  );
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

interface ArtistProfileResult {
  profile: {
    id: string;
    displayName: string | null;
    username: string | null;
    creatorIsPro: boolean;
    creatorClerkId: string | null;
    settings: Record<string, unknown> | null;
  };
  dynamicEnabled: boolean;
}

/**
 * Fetches artist profile and computes dynamic engagement status.
 */
async function fetchArtistProfile(
  artist_id: string,
  source: string | undefined
): Promise<ArtistProfileResult | NotificationSubscribeDomainResponse> {
  const [artistProfile] = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      settings: creatorProfiles.settings,
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

  const dynamicEnabled = creatorIsPro;

  return {
    profile: {
      id: artistProfile.id,
      displayName: artistProfile.displayName,
      username: artistProfile.username,
      creatorIsPro,
      creatorClerkId,
      settings: artistProfile.settings,
    },
    dynamicEnabled,
  };
}

function isArtistProfileResult(
  result: ArtistProfileResult | NotificationSubscribeDomainResponse
): result is ArtistProfileResult {
  return 'profile' in result && 'dynamicEnabled' in result;
}

/**
 * Sends subscription confirmation email (for single opt-in / post-confirmation).
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

/**
 * Sends double opt-in verification email with confirmation link.
 */
async function sendSubscriptionVerificationEmail(
  subscriptionId: string,
  artist_id: string,
  normalizedEmail: string,
  artistProfile: { displayName: string | null; username: string | null }
): Promise<Awaited<ReturnType<typeof sendNotification>>> {
  const artistName =
    artistProfile.displayName || artistProfile.username || 'this artist';
  const confirmUrl = buildSubscribeConfirmUrl(subscriptionId, normalizedEmail);
  const dedupKey = `notification_verify:${artist_id}:${normalizedEmail}`;

  const confirmLink = confirmUrl ?? '#';

  return sendNotification(
    {
      id: dedupKey,
      dedupKey,
      category: 'transactional',
      subject: `Confirm your subscription to ${artistName} on Jovie`,
      text: `Please confirm your subscription to ${artistName} on Jovie.\n\nClick here to confirm: ${confirmLink}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `
        <p>Please confirm your subscription to <strong>${artistName}</strong> on Jovie.</p>
        <p>Click the button below to start receiving updates when ${artistName} drops new music.</p>
        <p style="margin:24px 0;">
          <a href="${confirmLink}" style="padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">Confirm subscription</a>
        </p>
        <p style="font-size:14px;color:#555;">If you didn't request this, you can safely ignore this email. You won't receive any notifications unless you confirm.</p>
      `,
      channels: ['email'],
      respectUserPreferences: false,
      dismissible: false,
    },
    {
      email: normalizedEmail,
      creatorProfileId: artist_id,
    }
  );
}

/**
 * Check if creator has double opt-in enabled.
 * Defaults to true when the setting is not explicitly set.
 */
function isDoubleOptInEnabled(
  settings: Record<string, unknown> | null
): boolean {
  if (!settings) return true;
  const value = settings.require_double_opt_in;
  if (typeof value === 'boolean') return value;
  return true; // default: on
}

/**
 * Generates and stores a double opt-in confirmation token for a subscription.
 */
async function handleDoubleOptInToken(
  doubleOptIn: boolean,
  subscriptionId: string | undefined,
  normalizedEmail: string | null
): Promise<void> {
  if (!doubleOptIn || !subscriptionId || !normalizedEmail) return;
  const token = generateSubscribeConfirmToken(subscriptionId, normalizedEmail);
  if (!token) return;
  await db
    .update(notificationSubscriptions)
    .set({
      confirmationToken: token,
      confirmationSentAt: new Date(),
    })
    .where(eq(notificationSubscriptions.id, subscriptionId));
}

/**
 * Dispatches the appropriate subscription email based on opt-in type.
 */
async function dispatchSubscriptionEmail(
  channel: NotificationChannel,
  normalizedEmail: string | null,
  subscriptionId: string | undefined,
  doubleOptIn: boolean,
  artist_id: string,
  artistProfile: { displayName: string | null; username: string | null }
): Promise<Awaited<ReturnType<typeof sendNotification>> | null> {
  if (channel !== 'email' || !normalizedEmail || !subscriptionId) return null;
  if (doubleOptIn) {
    return sendSubscriptionVerificationEmail(
      subscriptionId,
      artist_id,
      normalizedEmail,
      artistProfile
    );
  }
  return sendSubscriptionConfirmationEmail(
    artist_id,
    normalizedEmail,
    artistProfile
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

    const artistResult = await fetchArtistProfile(artist_id, source);
    if (!isArtistProfileResult(artistResult)) {
      return artistResult;
    }
    const { profile: artistProfile, dynamicEnabled } = artistResult;
    const creatorIsPro = artistProfile.creatorIsPro;

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

    // Check if email is suppressed (hard bounce, spam complaint, etc.)
    const suppressionError = await checkEmailSuppression(
      channel,
      normalizedEmail,
      artist_id,
      source
    );
    if (suppressionError) {
      return suppressionError;
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

    // Determine double opt-in requirement
    const doubleOptIn =
      channel === 'email' &&
      normalizedEmail &&
      isDoubleOptInEnabled(artistProfile.settings);

    // Default preferences: all content categories enabled
    const defaultPreferences: FanNotificationPreferences = {
      releasePreview: true,
      releaseDay: true,
      newMusic: true,
      tourDates: true,
      merch: true,
      general: true,
    };

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
        preferences: defaultPreferences,
        // If double opt-in: leave confirmedAt null (pending). Otherwise: confirm immediately.
        confirmedAt: doubleOptIn ? null : new Date(),
      })
      .onConflictDoNothing({ target: conflictTarget })
      .returning({
        id: notificationSubscriptions.id,
      });

    // Generate and store confirmation token for double opt-in
    await handleDoubleOptInToken(
      !!doubleOptIn,
      insertedSubscription?.id,
      normalizedEmail
    );

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

    const dispatchResult = await dispatchSubscriptionEmail(
      channel,
      normalizedEmail,
      insertedSubscription?.id,
      !!doubleOptIn,
      artist_id,
      artistProfile
    );

    return buildSubscribeSuccessResponse(
      dynamicEnabled,
      dispatchResult?.delivered.includes('email') ?? false,
      Math.round(Date.now() - runtimeStart),
      !!doubleOptIn
    );
  } catch (error) {
    await trackServerError('subscribe', error);
    captureError('Notifications Subscribe Domain Error', error);
    return buildSubscribeServerError();
  }
};
