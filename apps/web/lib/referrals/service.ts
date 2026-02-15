import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  referralCodes,
  referralCommissions,
  referrals,
} from '@/lib/db/schema/referrals';
import { logger } from '@/lib/utils/logger';
import {
  calculateCommission,
  calculateExpiryDate,
  DEFAULT_COMMISSION_DURATION_MONTHS,
  DEFAULT_COMMISSION_RATE_BPS,
  MAX_REFERRAL_CODE_LENGTH,
  MIN_REFERRAL_CODE_LENGTH,
  REFERRAL_CODE_PATTERN,
} from './config';

/** Max retries for unique constraint violations on insert */
const MAX_UNIQUE_RETRIES = 3;

/**
 * Generate a unique referral code for a user.
 * If the user already has a code, returns the existing one.
 *
 * Uses INSERT ... ON CONFLICT to handle concurrent calls safely.
 * The DB has a UNIQUE constraint on user_id, so duplicate inserts
 * for the same user are resolved by returning the existing code.
 */
export async function getOrCreateReferralCode(
  userId: string,
  customCode?: string
): Promise<{ code: string; isNew: boolean }> {
  // Check for existing code
  const existing = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(
      and(eq(referralCodes.userId, userId), eq(referralCodes.isActive, true))
    )
    .limit(1);

  if (existing.length > 0) {
    return { code: existing[0].code, isNew: false };
  }

  // Normalize customCode: treat empty/whitespace-only as no custom code
  const trimmedCustomCode = customCode?.trim() || undefined;
  const code = trimmedCustomCode ?? generateRandomCode();

  if (trimmedCustomCode) {
    const validationError = validateReferralCode(trimmedCustomCode);
    if (validationError) {
      throw new Error(validationError);
    }

    // Check uniqueness
    const taken = await db
      .select({ id: referralCodes.id })
      .from(referralCodes)
      .where(eq(referralCodes.code, trimmedCustomCode.toLowerCase()))
      .limit(1);

    if (taken.length > 0) {
      throw new Error('This referral code is already taken');
    }
  }

  let normalizedCode = code.toLowerCase();

  // Retry loop: handles race conditions where a concurrent request inserts
  // between our check and insert. The UNIQUE constraints on user_id and code
  // in the DB will reject the duplicate, and we retry or return existing.
  for (let attempt = 0; attempt < MAX_UNIQUE_RETRIES; attempt++) {
    try {
      await db.insert(referralCodes).values({
        userId,
        code: normalizedCode,
      });

      logger.info('Referral code created', { userId, code: normalizedCode });
      return { code: normalizedCode, isNew: true };
    } catch (error) {
      // Check for unique constraint violation (Postgres error code 23505)
      const isUniqueViolation =
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === '23505';

      if (!isUniqueViolation) {
        throw error;
      }

      // Another request won the race — re-check for the existing active code
      const raceWinner = await db
        .select({ code: referralCodes.code })
        .from(referralCodes)
        .where(
          and(
            eq(referralCodes.userId, userId),
            eq(referralCodes.isActive, true)
          )
        )
        .limit(1);

      if (raceWinner.length > 0) {
        return { code: raceWinner[0].code, isNew: false };
      }

      // If no existing code found (e.g. code collision on a different user),
      // retry with a new random code if no custom code was provided
      if (trimmedCustomCode) {
        throw new Error('This referral code is already taken');
      }

      // Generate a fresh random code for the next attempt
      normalizedCode = generateRandomCode().toLowerCase();

      logger.warn('Referral code collision, retrying', {
        userId,
        attempt,
        code: normalizedCode,
      });
    }
  }

  throw new Error(
    'Failed to create referral code after multiple attempts. Please try again.'
  );
}

/**
 * Look up a referral code and return the referrer's user ID.
 * Returns null if the code is invalid or inactive.
 */
export async function lookupReferralCode(
  code: string
): Promise<{ referrerUserId: string; referralCodeId: string } | null> {
  const normalizedCode = code.trim().toLowerCase();
  const result = await db
    .select({
      userId: referralCodes.userId,
      id: referralCodes.id,
    })
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.code, normalizedCode),
        eq(referralCodes.isActive, true)
      )
    )
    .limit(1);

  if (result.length === 0) return null;

  return {
    referrerUserId: result[0].userId,
    referralCodeId: result[0].id,
  };
}

/**
 * Create a referral relationship when a referred user signs up.
 * Called during the signup/onboarding flow when a referral code is present.
 *
 * Note: db.transaction() is not available with the Neon HTTP driver.
 * The insert + update are executed sequentially. If the insert succeeds but
 * the update fails, the referral record exists without the user.referred_by_code
 * being set — a minor inconsistency that doesn't affect commission tracking
 * (which relies on the referrals table, not the user field). The user field
 * is informational only.
 */
export async function createReferral(
  referredUserId: string,
  referralCode: string
): Promise<{ success: boolean; error?: string }> {
  const trimmedCode = referralCode.trim();
  const codeInfo = await lookupReferralCode(trimmedCode);
  if (!codeInfo) {
    return { success: false, error: 'Invalid referral code' };
  }

  // Don't allow self-referrals
  if (codeInfo.referrerUserId === referredUserId) {
    return { success: false, error: 'Cannot use your own referral code' };
  }

  // Check if this user already has an active or pending referral
  const existingReferrals = await db
    .select({ id: referrals.id, status: referrals.status })
    .from(referrals)
    .where(eq(referrals.referredUserId, referredUserId));

  const hasActiveReferral = existingReferrals.some(
    r => r.status === 'active' || r.status === 'pending'
  );

  if (hasActiveReferral) {
    return { success: false, error: 'User already has an active referral' };
  }

  // Create the referral (pending until they subscribe).
  // If a concurrent request wins the race, the duplicate insert will either:
  // - Create a second pending referral (harmless — activateReferral picks one via LIMIT 1)
  // - Be caught by the caller and logged
  try {
    await db.insert(referrals).values({
      referrerUserId: codeInfo.referrerUserId,
      referredUserId,
      referralCodeId: codeInfo.referralCodeId,
      status: 'pending',
      commissionRateBps: DEFAULT_COMMISSION_RATE_BPS,
      commissionDurationMonths: DEFAULT_COMMISSION_DURATION_MONTHS,
    });
  } catch (error) {
    // Check for unique constraint violation in case a DB-level constraint
    // is later added on (referred_user_id, status)
    const isUniqueViolation =
      error instanceof Error &&
      'code' in error &&
      (error as { code: string }).code === '23505';

    if (isUniqueViolation) {
      return { success: false, error: 'User already has an active referral' };
    }
    throw error;
  }

  // Record the referral code on the user record (informational field)
  await db
    .update(users)
    .set({ referredByCode: trimmedCode.toLowerCase() })
    .where(eq(users.id, referredUserId));

  logger.info('Referral created', {
    referrerUserId: codeInfo.referrerUserId,
    referredUserId,
    code: trimmedCode,
  });

  return { success: true };
}

/**
 * Activate a referral when the referred user subscribes to a paid plan.
 * Called from the Stripe webhook handler on checkout.session.completed.
 */
export async function activateReferral(referredUserId: string): Promise<void> {
  const referral = await db
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.referredUserId, referredUserId),
        eq(referrals.status, 'pending')
      )
    )
    .limit(1);

  if (referral.length === 0) return; // No pending referral for this user

  const ref = referral[0];
  const now = new Date();
  const expiresAt = calculateExpiryDate(now, ref.commissionDurationMonths);

  await db
    .update(referrals)
    .set({
      status: 'active',
      subscribedAt: now,
      expiresAt,
    })
    .where(eq(referrals.id, ref.id));

  logger.info('Referral activated', {
    referralId: ref.id,
    referrerUserId: ref.referrerUserId,
    referredUserId,
    expiresAt: expiresAt.toISOString(),
  });
}

/**
 * Record a commission for a successful payment from a referred user.
 * Called from the invoice.payment_succeeded webhook handler.
 * Idempotent: duplicate calls for the same invoice are safely ignored.
 */
export async function recordCommission(params: {
  referredUserId: string;
  stripeInvoiceId: string;
  paymentAmountCents: number;
  currency: string;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<{ commissionCents: number } | null> {
  // Idempotency check: Stripe webhooks can be retried
  const existingCommission = await db
    .select({ amountCents: referralCommissions.amountCents })
    .from(referralCommissions)
    .where(eq(referralCommissions.stripeInvoiceId, params.stripeInvoiceId))
    .limit(1);

  if (existingCommission.length > 0) {
    logger.info('Commission already recorded for invoice', {
      stripeInvoiceId: params.stripeInvoiceId,
    });
    return { commissionCents: existingCommission[0].amountCents };
  }

  // Find the active referral for this user
  const referral = await db
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.referredUserId, params.referredUserId),
        eq(referrals.status, 'active')
      )
    )
    .limit(1);

  if (referral.length === 0) return null; // No active referral

  const ref = referral[0];

  // Check if commission period has expired
  if (ref.expiresAt && new Date() > ref.expiresAt) {
    await db
      .update(referrals)
      .set({ status: 'expired' })
      .where(eq(referrals.id, ref.id));

    logger.info('Referral commission period expired', {
      referralId: ref.id,
    });
    return null;
  }

  // Calculate commission
  const commissionCents = calculateCommission(
    params.paymentAmountCents,
    ref.commissionRateBps
  );

  if (commissionCents <= 0) return null;

  // Record the commission.
  // Uses ON CONFLICT on stripe_invoice_id (UNIQUE constraint) as a safety net
  // in case of race conditions between the existence check above and this insert.
  // Stripe webhooks can be retried, so this must be fully idempotent.
  const inserted = await db
    .insert(referralCommissions)
    .values({
      referralId: ref.id,
      referrerUserId: ref.referrerUserId,
      stripeInvoiceId: params.stripeInvoiceId,
      amountCents: commissionCents,
      currency: params.currency,
      status: 'pending',
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    })
    .onConflictDoNothing({ target: referralCommissions.stripeInvoiceId })
    .returning({ amountCents: referralCommissions.amountCents });

  if (inserted.length === 0) {
    // Conflict — commission was already recorded by a concurrent request
    logger.info('Commission already recorded for invoice (conflict)', {
      stripeInvoiceId: params.stripeInvoiceId,
    });
    return { commissionCents };
  }

  logger.info('Referral commission recorded', {
    referralId: ref.id,
    referrerUserId: ref.referrerUserId,
    commissionCents,
    stripeInvoiceId: params.stripeInvoiceId,
  });

  return { commissionCents };
}

/**
 * Mark referral as churned when the referred user cancels their subscription.
 * Cancellation is terminal — the referral relationship ends.
 * If the user re-subscribes later via a new referral link, a fresh referral is created.
 * Called from the customer.subscription.deleted webhook handler.
 *
 * Status semantics:
 * - 'churned': User cancelled their subscription (terminal)
 * - 'expired': Commission period ended naturally after the configured duration (terminal)
 */
export async function expireReferralOnChurn(
  referredUserId: string
): Promise<void> {
  // Mark any active or pending referrals as churned
  const result = await db
    .update(referrals)
    .set({
      status: 'churned',
      churnedAt: new Date(),
    })
    .where(
      and(
        eq(referrals.referredUserId, referredUserId),
        drizzleSql`${referrals.status} IN ('active', 'pending')`
      )
    )
    .returning({ id: referrals.id });

  if (result.length > 0) {
    logger.info('Referral(s) marked as churned on cancellation', {
      referredUserId,
      referralIds: result.map(r => r.id),
    });
  }
}

/**
 * Get referral statistics for a user (the referrer).
 */
export async function getReferralStats(userId: string) {
  // Get the user's referral code
  const codeResult = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(
      and(eq(referralCodes.userId, userId), eq(referralCodes.isActive, true))
    )
    .limit(1);

  // Get referral counts by status
  const referralCounts = await db
    .select({
      status: referrals.status,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(referrals)
    .where(eq(referrals.referrerUserId, userId))
    .groupBy(referrals.status);

  // Get total earnings and pending earnings
  const earnings = await db
    .select({
      status: referralCommissions.status,
      total: drizzleSql<number>`coalesce(sum(${referralCommissions.amountCents}), 0)::int`,
    })
    .from(referralCommissions)
    .where(eq(referralCommissions.referrerUserId, userId))
    .groupBy(referralCommissions.status);

  const statusCounts = referralCounts.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = row.count;
      return acc;
    },
    {}
  );

  const earningsByStatus = earnings.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = row.total;
      return acc;
    },
    {}
  );

  return {
    referralCode: codeResult[0]?.code ?? null,
    totalReferrals:
      (statusCounts.pending ?? 0) +
      (statusCounts.active ?? 0) +
      (statusCounts.churned ?? 0) +
      (statusCounts.expired ?? 0),
    activeReferrals: statusCounts.active ?? 0,
    pendingReferrals: statusCounts.pending ?? 0,
    churnedReferrals: statusCounts.churned ?? 0,
    totalEarningsCents:
      (earningsByStatus.pending ?? 0) +
      (earningsByStatus.approved ?? 0) +
      (earningsByStatus.paid ?? 0),
    pendingEarningsCents: earningsByStatus.pending ?? 0,
    paidEarningsCents: earningsByStatus.paid ?? 0,
  };
}

/**
 * Look up the internal user ID from a Clerk user ID.
 */
export async function getInternalUserId(
  clerkUserId: string
): Promise<string | null> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return result[0]?.id ?? null;
}

// --- Helpers ---

function generateRandomCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // No ambiguous chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function validateReferralCode(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < MIN_REFERRAL_CODE_LENGTH) {
    return `Code must be at least ${MIN_REFERRAL_CODE_LENGTH} characters`;
  }
  if (trimmed.length > MAX_REFERRAL_CODE_LENGTH) {
    return `Code must be at most ${MAX_REFERRAL_CODE_LENGTH} characters`;
  }
  if (!REFERRAL_CODE_PATTERN.test(trimmed)) {
    return 'Code must contain only letters, numbers, and hyphens';
  }
  return null;
}
