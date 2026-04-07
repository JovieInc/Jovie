/**
 * Shared OTP Email Service
 *
 * Provides reusable OTP request/verify functions for any email-gated flow
 * (notification subscriptions, promo downloads, etc.).
 *
 * The existing subscribeToNotificationsDomain() in domain.ts has its own
 * inline OTP logic with analytics/CAPI/channel routing. This service is
 * used by new flows (promo downloads) and the existing flow should be
 * refactored to use it in a future PR.
 */

import { and, eq } from 'drizzle-orm';
import { createFingerprint } from '@/app/api/audience/lib/audience-utils';
import { db } from '@/lib/db';
import {
  audienceMembers,
  type FanNotificationPreferences,
  notificationSubscriptions,
} from '@/lib/db/schema/analytics';
import { captureError } from '@/lib/error-tracking';
import { withSystemIngestionSession } from '@/lib/ingestion/session';
import {
  buildEmailOtpExpiry,
  generateEmailOtpCode,
  hashEmailOtp,
  isValidEmailOtpFormat,
} from '@/lib/notifications/email-otp';
import { isEmailSuppressed } from '@/lib/notifications/suppression';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';

// ─── Types ───────────────────────────────────────────────────────────

export interface OtpRequestParams {
  email: string;
  creatorProfileId: string;
  source: string;
  /** Preferences to merge into the subscription (e.g., { promo: true }) */
  preferencesMerge?: Partial<FanNotificationPreferences>;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Geo data (already decoded, not URL-encoded) */
  geo?: { country?: string | null; city?: string | null };
}

export interface OtpRequestResult {
  success: true;
  /** Whether OTP was actually sent (false if honeypot detected) */
  otpSent: boolean;
}

export interface OtpVerifyParams {
  email: string;
  creatorProfileId: string;
  code: string;
}

export interface OtpVerifyResult {
  success: true;
  subscriptionId: string;
}

export interface OtpError {
  success: false;
  error: string;
  status: number;
}

// ─── OTP Request ─────────────────────────────────────────────────────

/**
 * Request an email OTP for a gated flow. Normalizes email, checks
 * suppression, upserts the notification subscription, generates OTP,
 * and returns success. The caller is responsible for sending the OTP
 * email (to allow flow-specific templates).
 */
export async function requestEmailOtp(
  params: OtpRequestParams
): Promise<
  (OtpRequestResult & { otpCode: string; normalizedEmail: string }) | OtpError
> {
  const normalizedEmail = normalizeSubscriptionEmail(params.email);
  if (!normalizedEmail) {
    return { success: false, error: 'Invalid email address', status: 400 };
  }

  // Check suppression
  const suppression = await isEmailSuppressed(normalizedEmail);
  if (suppression.suppressed) {
    return {
      success: false,
      error:
        'This email cannot receive messages. Please try a different email address.',
      status: 400,
    };
  }

  // Generate OTP
  const otpCode = generateEmailOtpCode();
  const otpHash = hashEmailOtp(otpCode);
  const otpExpiresAt = buildEmailOtpExpiry();
  const now = new Date();

  // Build preferences: merge caller's preferences with defaults
  const defaultPreferences: FanNotificationPreferences = {
    releasePreview: true,
    releaseDay: true,
    newMusic: true,
    tourDates: true,
    merch: true,
    general: true,
  };

  // Check if subscription already exists to merge preferences
  const [existing] = await db
    .select({
      id: notificationSubscriptions.id,
      preferences: notificationSubscriptions.preferences,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.creatorProfileId, params.creatorProfileId),
        eq(notificationSubscriptions.channel, 'email'),
        eq(notificationSubscriptions.email, normalizedEmail)
      )
    )
    .limit(1);

  const mergedPreferences: FanNotificationPreferences = {
    ...(existing?.preferences ?? defaultPreferences),
    ...params.preferencesMerge,
  };

  // Upsert subscription
  await db
    .insert(notificationSubscriptions)
    .values({
      creatorProfileId: params.creatorProfileId,
      channel: 'email',
      email: normalizedEmail,
      countryCode: params.geo?.country?.slice(0, 2).toUpperCase() ?? null,
      city: params.geo?.city ?? null,
      ipAddress: params.ipAddress ?? null,
      source: params.source,
      preferences: mergedPreferences,
      confirmedAt: null,
      emailOtpHash: otpHash,
      emailOtpExpiresAt: otpExpiresAt,
      emailOtpLastSentAt: now,
      emailOtpAttempts: 0,
    })
    .onConflictDoUpdate({
      target: [
        notificationSubscriptions.creatorProfileId,
        notificationSubscriptions.email,
      ],
      set: {
        preferences: mergedPreferences,
        ipAddress: params.ipAddress ?? null,
        source: params.source,
        emailOtpHash: otpHash,
        emailOtpExpiresAt: otpExpiresAt,
        emailOtpLastSentAt: now,
        emailOtpAttempts: 0,
      },
    });

  return { success: true, otpSent: true, otpCode, normalizedEmail };
}

// ─── OTP Verify ──────────────────────────────────────────────────────

/**
 * Verify an email OTP code. Checks the hash, expiry, and attempt count.
 * On success, confirms the subscription and returns the subscription ID.
 */
export async function verifyEmailOtp(
  params: OtpVerifyParams
): Promise<OtpVerifyResult | OtpError> {
  const normalizedEmail = normalizeSubscriptionEmail(params.email);
  if (!normalizedEmail || !isValidEmailOtpFormat(params.code)) {
    return { success: false, error: 'Invalid verification code', status: 400 };
  }

  const [subscription] = await db
    .select({
      id: notificationSubscriptions.id,
      emailOtpHash: notificationSubscriptions.emailOtpHash,
      emailOtpExpiresAt: notificationSubscriptions.emailOtpExpiresAt,
      emailOtpAttempts: notificationSubscriptions.emailOtpAttempts,
      confirmedAt: notificationSubscriptions.confirmedAt,
    })
    .from(notificationSubscriptions)
    .where(
      and(
        eq(notificationSubscriptions.creatorProfileId, params.creatorProfileId),
        eq(notificationSubscriptions.channel, 'email'),
        eq(notificationSubscriptions.email, normalizedEmail)
      )
    )
    .limit(1);

  if (!subscription) {
    return { success: false, error: 'Invalid verification code', status: 400 };
  }

  // Already confirmed — idempotent success
  if (subscription.confirmedAt) {
    return { success: true, subscriptionId: subscription.id };
  }

  const now = new Date();

  // Check expiry
  if (
    !subscription.emailOtpHash ||
    !subscription.emailOtpExpiresAt ||
    now > subscription.emailOtpExpiresAt
  ) {
    return {
      success: false,
      error: 'Code expired. Request a new code.',
      status: 400,
    };
  }

  // Check attempt limit
  if ((subscription.emailOtpAttempts ?? 0) >= 5) {
    return {
      success: false,
      error: 'Too many attempts. Request a new code.',
      status: 429,
    };
  }

  // Verify hash
  if (hashEmailOtp(params.code) !== subscription.emailOtpHash) {
    await db
      .update(notificationSubscriptions)
      .set({ emailOtpAttempts: (subscription.emailOtpAttempts ?? 0) + 1 })
      .where(eq(notificationSubscriptions.id, subscription.id));
    return { success: false, error: 'Invalid verification code', status: 400 };
  }

  // Confirm subscription
  await db
    .update(notificationSubscriptions)
    .set({
      confirmedAt: now,
      confirmationToken: null,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    })
    .where(eq(notificationSubscriptions.id, subscription.id));

  return { success: true, subscriptionId: subscription.id };
}

// ─── Audience Upsert ─────────────────────────────────────────────────

/**
 * Best-effort audience member upsert for engagement tracking.
 * Logs errors but never throws — analytics should not block the user flow.
 */
export async function upsertPromoAudienceMember(
  creatorProfileId: string,
  email: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  try {
    const fingerprint = createFingerprint(ipAddress, userAgent);
    const now = new Date();

    await withSystemIngestionSession(async tx => {
      await tx
        .insert(audienceMembers)
        .values({
          creatorProfileId,
          fingerprint,
          type: 'email',
          displayName: 'Promo Subscriber',
          email,
          attributionSource: 'promo_download',
          firstSeenAt: now,
          lastSeenAt: now,
          visits: 0,
          engagementScore: 0,
          intentLevel: 'high',
          deviceType: 'unknown',
          referrerHistory: [],
          latestActions: [],
          tags: ['promo'],
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
            email,
            lastSeenAt: now,
            updatedAt: now,
          },
        });
    });
  } catch (error) {
    captureError('Promo audience member upsert failed (best-effort)', error);
  }
}
