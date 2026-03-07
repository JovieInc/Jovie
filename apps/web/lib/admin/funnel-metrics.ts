import 'server-only';

import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';

import { db, doesTableExist } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { emailEngagement } from '@/lib/db/schema/email-engagement';
import { leads } from '@/lib/db/schema/leads';
import { captureError } from '@/lib/error-tracking';
import { getAdminStripeOverviewMetrics } from './stripe-metrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASELINE_BURN_USD = 5_000;

export interface AdminFunnelMetrics {
  /** Total outreach emails sent in the last 7 days */
  outreachSent7d: number;
  /** Claim link clicks in the last 7 days */
  claimClicks7d: number;
  /** Claim rate: claimClicks / outreachSent (0-1) */
  claimRate: number | null;
  /** Completed signups in the last 7 days */
  signups7d: number;
  /** Signup rate: signups / claimClicks (0-1) */
  signupRate: number | null;
  /** Paid conversions in the last 7 days */
  paidConversions7d: number;
  /** Paid conversion rate: paidConversions / signups (0-1) */
  paidConversionRate: number | null;
  /** Current monthly recurring revenue in USD */
  mrrUsd: number;
  /** Months of runway at baseline burn ($5K/mo) */
  runwayMonths: number | null;
  /** Whether Stripe data is available */
  stripeAvailable: boolean;
  /** Errors encountered during fetch (non-fatal) */
  errors: string[];
}

/**
 * Count outreach emails sent in the last 7 days.
 * Uses leads table with outreach_status = 'sent' or 'dm_sent'.
 */
async function getOutreachSent7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          drizzleSql`${leads.outreachStatus} IN ('sent', 'dm_sent')`,
          gte(leads.updatedAt, sevenDaysAgo)
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    captureError('Error fetching outreach sent count', error);
    return 0;
  }
}

/**
 * Count claim link clicks in the last 7 days.
 * Uses email_engagement table with event_type = 'click' and email_type = 'claim_invite'.
 */
async function getClaimClicks7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasTable = await doesTableExist('email_engagement');
    if (!hasTable) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(emailEngagement)
      .where(
        and(
          eq(emailEngagement.eventType, 'click'),
          eq(emailEngagement.emailType, 'claim_invite'),
          gte(emailEngagement.createdAt, sevenDaysAgo)
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    captureError('Error fetching claim clicks count', error);
    return 0;
  }
}

/**
 * Count completed signups in the last 7 days.
 * Uses users table, counting non-deleted users created in the window.
 */
async function getSignups7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          gte(users.createdAt, sevenDaysAgo),
          drizzleSql`${users.deletedAt} IS NULL`
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    captureError('Error fetching signups count', error);
    return 0;
  }
}

/**
 * Count paid conversions in the last 7 days.
 * Users with an active Stripe subscription created in the window.
 */
async function getPaidConversions7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          drizzleSql`${users.stripeSubscriptionId} IS NOT NULL`,
          gte(users.billingUpdatedAt, sevenDaysAgo),
          drizzleSql`${users.deletedAt} IS NULL`
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    captureError('Error fetching paid conversions count', error);
    return 0;
  }
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export async function getAdminFunnelMetrics(): Promise<AdminFunnelMetrics> {
  const errors: string[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * MS_PER_DAY);

  const [
    outreachSent7d,
    claimClicks7d,
    signups7d,
    paidConversions7d,
    stripeMetrics,
  ] = await Promise.all([
    getOutreachSent7d(sevenDaysAgo).catch(err => {
      errors.push(
        `Outreach: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return 0;
    }),
    getClaimClicks7d(sevenDaysAgo).catch(err => {
      errors.push(`Claims: ${err instanceof Error ? err.message : 'unknown'}`);
      return 0;
    }),
    getSignups7d(sevenDaysAgo).catch(err => {
      errors.push(`Signups: ${err instanceof Error ? err.message : 'unknown'}`);
      return 0;
    }),
    getPaidConversions7d(sevenDaysAgo).catch(err => {
      errors.push(`Paid: ${err instanceof Error ? err.message : 'unknown'}`);
      return 0;
    }),
    getAdminStripeOverviewMetrics().catch(err => {
      errors.push(`Stripe: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }),
  ]);

  const mrrUsd = stripeMetrics?.mrrUsd ?? 0;
  const stripeAvailable = stripeMetrics?.isAvailable ?? false;

  // Runway: MRR offsets burn. If MRR >= burn, runway is infinite (null).
  // Otherwise, runway = 0 because we don't have a balance to draw down.
  // This is a simplified model — with Mercury balance it would be balance / (burn - mrr).
  let runwayMonths: number | null = null;
  if (stripeAvailable) {
    const netBurn = BASELINE_BURN_USD - mrrUsd;
    if (netBurn <= 0) {
      runwayMonths = null; // Revenue covers burn
    } else {
      // Without Mercury balance, estimate based on burn rate alone
      // Show 0 if we can't calculate (no balance data)
      runwayMonths = 0;
    }
  }

  return {
    outreachSent7d,
    claimClicks7d,
    claimRate: safeRate(claimClicks7d, outreachSent7d),
    signups7d,
    signupRate: safeRate(signups7d, claimClicks7d),
    paidConversions7d,
    paidConversionRate: safeRate(paidConversions7d, signups7d),
    mrrUsd,
    runwayMonths,
    stripeAvailable,
    errors,
  };
}
