/**
 * Trial Expiration Cron
 *
 * Daily job that:
 * 1. Downgrades expired trial users to free plan (only if no active Stripe subscription)
 * 2. Identifies users approaching trial expiry for lifecycle emails
 *
 * Note: Phase 4 lazy check in the entitlements system is the AUTHORITY on trial
 * status -- users see free-tier entitlements the moment trialEndsAt passes.
 * This cron handles DB cleanup and email triggers only.
 *
 * Schedule: daily via /api/cron/daily-maintenance
 */

import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/**
 * Core logic for trial expiration processing.
 * Exported for use by the consolidated /api/cron/daily-maintenance handler.
 */
export async function processTrialExpirations(): Promise<{
  expired: number;
  threeDayWarning: number;
  oneDayWarning: number;
}> {
  const now = new Date();

  // 1. Downgrade expired trials to free (only if no active Stripe subscription)
  const expired = await db
    .update(users)
    .set({ plan: 'free' })
    .where(
      and(
        eq(users.plan, 'trial'),
        lte(users.trialEndsAt, now),
        isNull(users.stripeSubscriptionId)
      )
    )
    .returning({ id: users.id, email: users.email });

  if (expired.length > 0) {
    logger.info(
      `[trial-expiration] Downgraded ${expired.length} expired trials to free`
    );
  }

  // TODO: Send "Your trial ended, here's what you built" email to expired users.
  // These should be plain-text founder emails via Resend once templates exist.
  // Data available: expired[].id, expired[].email

  // 2. Find trials expiring within 3 days (for warning email)
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const threeDayWarningUsers = await db
    .select({
      id: users.id,
      email: users.email,
      trialEndsAt: users.trialEndsAt,
    })
    .from(users)
    .where(
      and(
        eq(users.plan, 'trial'),
        gt(users.trialEndsAt, now),
        lte(users.trialEndsAt, threeDaysFromNow)
      )
    );

  // 3. Separate out trials expiring within 1 day (for urgent email)
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const oneDayWarningUsers = threeDayWarningUsers.filter(
    u => u.trialEndsAt && u.trialEndsAt <= oneDayFromNow
  );
  const threeDayOnlyUsers = threeDayWarningUsers.filter(
    u => u.trialEndsAt && u.trialEndsAt > oneDayFromNow
  );

  // TODO: Send "Your Jovie trial ends Friday" email to threeDayOnlyUsers.
  // Plain-text founder email via Resend once templates exist.
  // Data available: threeDayOnlyUsers[].id, threeDayOnlyUsers[].email, threeDayOnlyUsers[].trialEndsAt

  // TODO: Send "Last day of your Pro trial" email to oneDayWarningUsers.
  // Plain-text founder email via Resend once templates exist.
  // Data available: oneDayWarningUsers[].id, oneDayWarningUsers[].email, oneDayWarningUsers[].trialEndsAt

  logger.info('[trial-expiration] Summary', {
    expired: expired.length,
    threeDayWarning: threeDayOnlyUsers.length,
    oneDayWarning: oneDayWarningUsers.length,
  });

  return {
    expired: expired.length,
    threeDayWarning: threeDayOnlyUsers.length,
    oneDayWarning: oneDayWarningUsers.length,
  };
}

/**
 * Standalone cron endpoint for trial expiration.
 * Primary invocation is via /api/cron/daily-maintenance sub-job.
 */
export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/trial-expiration',
  });
  if (authError) return authError;

  try {
    const result = await processTrialExpirations();
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[trial-expiration] Cron failed', { error });
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
