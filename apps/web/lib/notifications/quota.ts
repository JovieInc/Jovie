/**
 * Email Quota Service
 *
 * Manages per-creator email sending quotas to prevent spam and ensure
 * fair usage across the platform. Implements the Laylo pattern of
 * tier-based rate limiting.
 *
 * Default limits:
 * - Free: 100 daily / 1,000 monthly
 * - Pro: 5,000 daily / 50,000 monthly
 * - Enterprise: 25,000 daily / 250,000 monthly
 */

import { eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { type CreatorEmailQuota, creatorEmailQuotas } from '@/lib/db/schema';
import { logger } from '@/lib/utils/logger';

/** Quota limits by plan tier */
export const QUOTA_LIMITS = {
  free: { daily: 100, monthly: 1_000 },
  pro: { daily: 5_000, monthly: 50_000 },
  enterprise: { daily: 25_000, monthly: 250_000 },
} as const;

export type QuotaPlanTier = keyof typeof QUOTA_LIMITS;

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'daily_limit' | 'monthly_limit';
  remaining: {
    daily: number;
    monthly: number;
  };
  limits: {
    daily: number;
    monthly: number;
  };
}

export interface QuotaUpdateResult {
  success: boolean;
  newCounts: {
    daily: number;
    monthly: number;
  };
}

/**
 * Get the start of the next day in UTC
 */
function getStartOfNextDay(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

/**
 * Get the start of the next month in UTC
 */
function getStartOfNextMonth(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

/**
 * Get or create quota record for a creator
 */
export async function getOrCreateQuota(
  creatorProfileId: string,
  planTier: QuotaPlanTier = 'free'
): Promise<CreatorEmailQuota> {
  const now = new Date();

  // Try to get existing quota
  const [existing] = await db
    .select()
    .from(creatorEmailQuotas)
    .where(eq(creatorEmailQuotas.creatorProfileId, creatorProfileId))
    .limit(1);

  if (existing) {
    // Reset counters if periods have elapsed
    const needsDailyReset = existing.dailyResetAt < now;
    const needsMonthlyReset = existing.monthlyResetAt < now;

    if (needsDailyReset || needsMonthlyReset) {
      const [updated] = await db
        .update(creatorEmailQuotas)
        .set({
          dailySent: needsDailyReset ? 0 : existing.dailySent,
          dailyResetAt: needsDailyReset
            ? getStartOfNextDay(now)
            : existing.dailyResetAt,
          monthlySent: needsMonthlyReset ? 0 : existing.monthlySent,
          monthlyResetAt: needsMonthlyReset
            ? getStartOfNextMonth(now)
            : existing.monthlyResetAt,
          updatedAt: now,
        })
        .where(eq(creatorEmailQuotas.id, existing.id))
        .returning();

      return updated;
    }

    return existing;
  }

  // Create new quota record
  const limits = QUOTA_LIMITS[planTier];
  const [created] = await db
    .insert(creatorEmailQuotas)
    .values({
      creatorProfileId,
      dailyLimit: limits.daily,
      monthlyLimit: limits.monthly,
      dailySent: 0,
      monthlySent: 0,
      dailyResetAt: getStartOfNextDay(now),
      monthlyResetAt: getStartOfNextMonth(now),
      metadata: { planTier },
    })
    .returning();

  return created;
}

/**
 * Check if a creator can send more emails
 */
export async function checkQuota(
  creatorProfileId: string
): Promise<QuotaCheckResult> {
  const quota = await getOrCreateQuota(creatorProfileId);

  const dailyRemaining = Math.max(0, quota.dailyLimit - quota.dailySent);
  const monthlyRemaining = Math.max(0, quota.monthlyLimit - quota.monthlySent);

  if (dailyRemaining === 0) {
    return {
      allowed: false,
      reason: 'daily_limit',
      remaining: { daily: dailyRemaining, monthly: monthlyRemaining },
      limits: { daily: quota.dailyLimit, monthly: quota.monthlyLimit },
    };
  }

  if (monthlyRemaining === 0) {
    return {
      allowed: false,
      reason: 'monthly_limit',
      remaining: { daily: dailyRemaining, monthly: monthlyRemaining },
      limits: { daily: quota.dailyLimit, monthly: quota.monthlyLimit },
    };
  }

  return {
    allowed: true,
    remaining: { daily: dailyRemaining, monthly: monthlyRemaining },
    limits: { daily: quota.dailyLimit, monthly: quota.monthlyLimit },
  };
}

/**
 * Increment quota counters after sending an email
 */
export async function incrementQuota(
  creatorProfileId: string,
  count: number = 1
): Promise<QuotaUpdateResult> {
  const now = new Date();

  try {
    // First ensure the quota record exists with reset periods
    await getOrCreateQuota(creatorProfileId);

    // Atomically increment counters
    const [updated] = await db
      .update(creatorEmailQuotas)
      .set({
        dailySent: sql`${creatorEmailQuotas.dailySent} + ${count}`,
        monthlySent: sql`${creatorEmailQuotas.monthlySent} + ${count}`,
        updatedAt: now,
      })
      .where(eq(creatorEmailQuotas.creatorProfileId, creatorProfileId))
      .returning();

    return {
      success: true,
      newCounts: {
        daily: updated.dailySent,
        monthly: updated.monthlySent,
      },
    };
  } catch (error) {
    logger.error('[quota] Failed to increment quota', {
      creatorProfileId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      newCounts: { daily: 0, monthly: 0 },
    };
  }
}

/**
 * Update quota limits for a creator (admin function)
 */
export async function updateQuotaLimits(
  creatorProfileId: string,
  limits: { daily?: number; monthly?: number },
  overrideReason?: string,
  overrideBy?: string
): Promise<CreatorEmailQuota | null> {
  const now = new Date();

  const [updated] = await db
    .update(creatorEmailQuotas)
    .set({
      ...(limits.daily !== undefined && { dailyLimit: limits.daily }),
      ...(limits.monthly !== undefined && { monthlyLimit: limits.monthly }),
      hasCustomLimits: true,
      metadata: sql`${creatorEmailQuotas.metadata} || ${JSON.stringify({
        overrideReason,
        overrideBy,
      })}::jsonb`,
      updatedAt: now,
    })
    .where(eq(creatorEmailQuotas.creatorProfileId, creatorProfileId))
    .returning();

  return updated ?? null;
}

/**
 * Reset expired daily quotas (for cron job cleanup)
 */
export async function resetExpiredDailyQuotas(): Promise<number> {
  const now = new Date();
  const nextDay = getStartOfNextDay(now);

  const result = await db
    .update(creatorEmailQuotas)
    .set({
      dailySent: 0,
      dailyResetAt: nextDay,
      updatedAt: now,
    })
    .where(lt(creatorEmailQuotas.dailyResetAt, now))
    .returning({ id: creatorEmailQuotas.id });

  return result.length;
}

/**
 * Reset expired monthly quotas (for cron job cleanup)
 */
export async function resetExpiredMonthlyQuotas(): Promise<number> {
  const now = new Date();
  const nextMonth = getStartOfNextMonth(now);

  const result = await db
    .update(creatorEmailQuotas)
    .set({
      monthlySent: 0,
      monthlyResetAt: nextMonth,
      updatedAt: now,
    })
    .where(lt(creatorEmailQuotas.monthlyResetAt, now))
    .returning({ id: creatorEmailQuotas.id });

  return result.length;
}

/**
 * Get quota usage summary for a creator (for dashboard display)
 */
export async function getQuotaSummary(creatorProfileId: string): Promise<{
  daily: { used: number; limit: number; percentage: number };
  monthly: { used: number; limit: number; percentage: number };
  resetsAt: { daily: Date; monthly: Date };
} | null> {
  const quota = await getOrCreateQuota(creatorProfileId);

  if (!quota) return null;

  return {
    daily: {
      used: quota.dailySent,
      limit: quota.dailyLimit,
      percentage: Math.round((quota.dailySent / quota.dailyLimit) * 100),
    },
    monthly: {
      used: quota.monthlySent,
      limit: quota.monthlyLimit,
      percentage: Math.round((quota.monthlySent / quota.monthlyLimit) * 100),
    },
    resetsAt: {
      daily: quota.dailyResetAt,
      monthly: quota.monthlyResetAt,
    },
  };
}
