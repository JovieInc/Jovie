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

/**
 * Generate a unique referral code for a user.
 * If the user already has a code, returns the existing one.
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

  // Generate or validate custom code
  const code = customCode ?? generateRandomCode();

  if (customCode) {
    const validationError = validateReferralCode(customCode);
    if (validationError) {
      throw new Error(validationError);
    }

    // Check uniqueness
    const taken = await db
      .select({ id: referralCodes.id })
      .from(referralCodes)
      .where(eq(referralCodes.code, customCode.toLowerCase()))
      .limit(1);

    if (taken.length > 0) {
      throw new Error('This referral code is already taken');
    }
  }

  const normalizedCode = code.toLowerCase();

  await db.insert(referralCodes).values({
    userId,
    code: normalizedCode,
  });

  logger.info('Referral code created', { userId, code: normalizedCode });

  return { code: normalizedCode, isNew: true };
}

/**
 * Look up a referral code and return the referrer's user ID.
 * Returns null if the code is invalid or inactive.
 */
export async function lookupReferralCode(
  code: string
): Promise<{ referrerUserId: string; referralCodeId: string } | null> {
  const result = await db
    .select({
      userId: referralCodes.userId,
      id: referralCodes.id,
    })
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.code, code.toLowerCase()),
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
 */
export async function createReferral(
  referredUserId: string,
  referralCode: string
): Promise<{ success: boolean; error?: string }> {
  const codeInfo = await lookupReferralCode(referralCode);
  if (!codeInfo) {
    return { success: false, error: 'Invalid referral code' };
  }

  // Don't allow self-referrals
  if (codeInfo.referrerUserId === referredUserId) {
    return { success: false, error: 'Cannot use your own referral code' };
  }

  // Check if this user was already referred
  const existingReferral = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(eq(referrals.referredUserId, referredUserId))
    .limit(1);

  if (existingReferral.length > 0) {
    return { success: false, error: 'User already has a referral' };
  }

  // Create the referral (pending until they subscribe)
  await db.insert(referrals).values({
    referrerUserId: codeInfo.referrerUserId,
    referredUserId,
    referralCodeId: codeInfo.referralCodeId,
    status: 'pending',
    commissionRateBps: DEFAULT_COMMISSION_RATE_BPS,
    commissionDurationMonths: DEFAULT_COMMISSION_DURATION_MONTHS,
  });

  // Record the referral code on the user record
  await db
    .update(users)
    .set({ referredByCode: referralCode.toLowerCase() })
    .where(eq(users.id, referredUserId));

  logger.info('Referral created', {
    referrerUserId: codeInfo.referrerUserId,
    referredUserId,
    code: referralCode,
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
 */
export async function recordCommission(params: {
  referredUserId: string;
  stripeInvoiceId: string;
  paymentAmountCents: number;
  currency: string;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<{ commissionCents: number } | null> {
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

  // Record the commission
  await db.insert(referralCommissions).values({
    referralId: ref.id,
    referrerUserId: ref.referrerUserId,
    stripeInvoiceId: params.stripeInvoiceId,
    amountCents: commissionCents,
    currency: params.currency,
    status: 'pending',
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  logger.info('Referral commission recorded', {
    referralId: ref.id,
    referrerUserId: ref.referrerUserId,
    commissionCents,
    stripeInvoiceId: params.stripeInvoiceId,
  });

  return { commissionCents };
}

/**
 * Mark a referral as churned when the referred user cancels.
 * Called from the customer.subscription.deleted webhook handler.
 */
export async function churnReferral(referredUserId: string): Promise<void> {
  const referral = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(
      and(
        eq(referrals.referredUserId, referredUserId),
        eq(referrals.status, 'active')
      )
    )
    .limit(1);

  if (referral.length === 0) return;

  await db
    .update(referrals)
    .set({
      status: 'churned',
      churnedAt: new Date(),
    })
    .where(eq(referrals.id, referral[0].id));

  logger.info('Referral churned', {
    referralId: referral[0].id,
    referredUserId,
  });
}

/**
 * Reactivate a churned referral when the referred user re-subscribes.
 * Only reactivates if the commission period hasn't expired.
 */
export async function reactivateReferral(
  referredUserId: string
): Promise<void> {
  const referral = await db
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.referredUserId, referredUserId),
        eq(referrals.status, 'churned')
      )
    )
    .limit(1);

  if (referral.length === 0) return;

  const ref = referral[0];

  // Don't reactivate if commission period has expired
  if (ref.expiresAt && new Date() > ref.expiresAt) {
    await db
      .update(referrals)
      .set({ status: 'expired' })
      .where(eq(referrals.id, ref.id));
    return;
  }

  await db
    .update(referrals)
    .set({
      status: 'active',
      churnedAt: null,
    })
    .where(eq(referrals.id, ref.id));

  logger.info('Referral reactivated', {
    referralId: ref.id,
    referredUserId,
  });
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
  if (code.length < MIN_REFERRAL_CODE_LENGTH) {
    return `Code must be at least ${MIN_REFERRAL_CODE_LENGTH} characters`;
  }
  if (code.length > MAX_REFERRAL_CODE_LENGTH) {
    return `Code must be at most ${MAX_REFERRAL_CODE_LENGTH} characters`;
  }
  if (!REFERRAL_CODE_PATTERN.test(code)) {
    return 'Code must contain only letters, numbers, and hyphens';
  }
  return null;
}
