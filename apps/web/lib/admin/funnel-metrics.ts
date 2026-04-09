import 'server-only';

import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';

import { db, doesTableExist } from '@/lib/db';
import { getDeepErrorMessage } from '@/lib/db/errors';
import { discogReleases } from '@/lib/db/schema/content';
import { leadFunnelEvents, leads } from '@/lib/db/schema/leads';
import {
  creatorDistributionEvents,
  creatorProfiles,
} from '@/lib/db/schema/profiles';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getAdminStripeOverviewMetrics } from './stripe-metrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASELINE_BURN_USD = 5_000;
const SERPAPI_COST_PER_QUERY = 0.005;

/** Extract rows from a raw db.execute() result. */
function extractRawRows(result: unknown): Record<string, unknown>[] {
  return (result as { rows?: Record<string, unknown>[] }).rows ?? [];
}

function getUtcWeekStart(date: Date): Date {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = weekStart.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + offset);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isMissingLeadsOutreachStatusColumnError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  return (
    message.includes('does not exist') &&
    (message.includes('column leads.outreach_status') ||
      message.includes('column "outreach_status"'))
  );
}

function isMissingLeadAttributionColumnError(error: unknown): boolean {
  const message = getDeepErrorMessage(error).toLowerCase();
  if (!message.includes('does not exist')) {
    return false;
  }

  return [
    'column leads.signup_at',
    'column "signup_at"',
    'column leads.signup_user_id',
    'column "signup_user_id"',
    'column leads.paid_at',
    'column "paid_at"',
    'column leads.paid_subscription_id',
    'column "paid_subscription_id"',
  ].some(pattern => message.includes(pattern));
}

export interface AdminFunnelMetrics {
  /** Onboarding completion step views for Instagram share flow in the last 7 days */
  instagramShareStepViews7d: number;
  /** Distinct creators who copied the Instagram bio link in the last 7 days */
  instagramBioCopies7d: number;
  /** Instagram open rate from the share step in the last 7 days (0-1) */
  instagramBioOpenRate7d: number | null;
  /** Distinct creators activated from the onboarding Instagram share funnel in the last 7 days */
  instagramBioActivations7d: number;
  /** Activation rate from share-step view to activated visit in the last 7 days (0-1) */
  instagramBioActivationRate7d: number | null;
  /** Total attributable outbound contacts in the last 7 days (email queued + DM sent) */
  outreachSent7d: number;
  /** Claim-page visits in the last 7 days from attributable outbound links */
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
  /** Annual recurring revenue in USD */
  arrUsd: number;
  /** Current paying customers */
  payingCustomers: number;
  /** Months of runway at baseline burn ($5K/mo) */
  runwayMonths: number | null;
  /** Default alive date as YYYY-MM-DD when runway can be projected */
  defaultAliveDate: string | null;
  /** Week-over-week growth placeholder (0-1), null until tracked */
  wowGrowthRate: number | null;
  /** Month-over-month MRR growth rate (0-1), null when unavailable */
  momGrowthRate: number | null;
  /** YC metric placeholders and computed engagement proxies */
  churnRate: number | null;
  retention30d: number | null;
  retention60d: number | null;
  retention90d: number | null;
  engagementActiveProfiles30d: number | null;
  cacUsd: number | null;
  ltvUsd: number | null;
  paybackPeriodMonths: number | null;
  /** Whether Stripe data is available */
  stripeAvailable: boolean;
  /** Errors encountered during fetch (non-fatal) */
  errors: string[];
  /** Outreach to signup conversion rate: signups7d / outreachSent7d (0-1) */
  outreachToSignupRate: number | null;
  /** Signup to paid conversion rate: paidConversions7d / signups7d (0-1) */
  signupToPaidRate: number | null;
  /** MRR dollars generated per outreach sent: mrrUsd / outreachSent7d */
  dollarPerOutreach: number | null;
  /** Magic moment: % of signups with avatar + name + DSP link + release */
  magicMomentRate: number | null;
  /** Magic moment: total profiles that achieved magic moment */
  magicMomentCount: number;
  /** Enrichment failure rate: profiles with any failed enrichment status */
  enrichmentFailureRate: number | null;
}

/**
 * Count attributable outbound contacts in the last 7 days.
 * Uses lead_funnel_events with event_type in ('email_queued', 'dm_sent').
 */
async function getOutreachSent7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasEvents = await doesTableExist('lead_funnel_events');
    if (hasEvents) {
      const [row] = await db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(leadFunnelEvents)
        .where(
          and(
            drizzleSql`${leadFunnelEvents.eventType} in ('email_queued', 'dm_sent')`,
            gte(leadFunnelEvents.occurredAt, sevenDaysAgo)
          )
        );

      return Number(row?.count ?? 0);
    }

    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          drizzleSql`${leads.outreachStatus}::text IN ('queued', 'dm_sent')`,
          gte(leads.updatedAt, sevenDaysAgo)
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    if (isMissingLeadsOutreachStatusColumnError(error)) {
      await captureWarning(
        '[admin/funnel-metrics] leads.outreach_status column missing; returning 0 outreach count',
        error
      );
      return 0;
    }

    captureError('Error fetching outreach sent count', error);
    return 0;
  }
}

/**
 * Count attributable claim-page views in the last 7 days.
 */
async function getClaimClicks7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasTable = await doesTableExist('lead_funnel_events');
    if (!hasTable) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leadFunnelEvents)
      .where(
        and(
          eq(leadFunnelEvents.eventType, 'claim_page_viewed'),
          gte(leadFunnelEvents.occurredAt, sevenDaysAgo)
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    captureError('Error fetching claim clicks count', error);
    return 0;
  }
}

/**
 * Count attributable signups in the last 7 days.
 */
async function getSignups7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          gte(leads.signupAt, sevenDaysAgo),
          drizzleSql`${leads.signupUserId} IS NOT NULL`
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    if (isMissingLeadAttributionColumnError(error)) {
      await captureWarning(
        '[admin/funnel-metrics] lead attribution columns missing; returning 0 signups count',
        error
      );
      return 0;
    }

    captureError('Error fetching signups count', error);
    return 0;
  }
}

/**
 * Count attributable paid conversions in the last 7 days.
 */
async function getPaidConversions7d(sevenDaysAgo: Date): Promise<number> {
  try {
    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return 0;

    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          drizzleSql`${leads.paidSubscriptionId} IS NOT NULL`,
          gte(leads.paidAt, sevenDaysAgo)
        )
      );

    return Number(row?.count ?? 0);
  } catch (error) {
    if (isMissingLeadAttributionColumnError(error)) {
      await captureWarning(
        '[admin/funnel-metrics] lead attribution columns missing; returning 0 paid conversions count',
        error
      );
      return 0;
    }

    captureError('Error fetching paid conversions count', error);
    return 0;
  }
}

async function getInstagramActivationMetrics7d(sevenDaysAgo: Date): Promise<{
  activations: number;
  copies: number;
  platformOpens: number;
  stepViews: number;
}> {
  const empty = {
    activations: 0,
    copies: 0,
    platformOpens: 0,
    stepViews: 0,
  };

  try {
    const hasTable = await doesTableExist('creator_distribution_events');
    if (!hasTable) {
      return empty;
    }

    const onboardingShareProfiles = drizzleSql`
      select distinct creator_profile_id
      from creator_distribution_events as onboarding_events
      where onboarding_events.platform = 'instagram'
        and onboarding_events.event_type = 'step_viewed'
        and onboarding_events.created_at >= ${sevenDaysAgo}
        and coalesce(onboarding_events.metadata->>'surface', '') = 'onboarding'
    `;

    const [row] = await db
      .select({
        activations: drizzleSql<number>`
          count(distinct ${creatorDistributionEvents.creatorProfileId}) filter (
            where ${creatorDistributionEvents.eventType} = 'activated'
              and ${creatorDistributionEvents.creatorProfileId} in (${onboardingShareProfiles})
          )::int
        `,
        copies: drizzleSql<number>`
          count(distinct ${creatorDistributionEvents.creatorProfileId}) filter (
            where ${creatorDistributionEvents.eventType} = 'link_copied'
              and coalesce(${creatorDistributionEvents.metadata}->>'surface', '') = 'onboarding'
          )::int
        `,
        platformOpens: drizzleSql<number>`
          count(distinct ${creatorDistributionEvents.creatorProfileId}) filter (
            where ${creatorDistributionEvents.eventType} = 'platform_opened'
              and coalesce(${creatorDistributionEvents.metadata}->>'surface', '') = 'onboarding'
              and ${creatorDistributionEvents.creatorProfileId} in (${onboardingShareProfiles})
          )::int
        `,
        stepViews: drizzleSql<number>`
          count(distinct ${creatorDistributionEvents.creatorProfileId}) filter (
            where ${creatorDistributionEvents.eventType} = 'step_viewed'
              and coalesce(${creatorDistributionEvents.metadata}->>'surface', '') = 'onboarding'
          )::int
        `,
      })
      .from(creatorDistributionEvents)
      .where(
        and(
          eq(creatorDistributionEvents.platform, 'instagram'),
          gte(creatorDistributionEvents.createdAt, sevenDaysAgo)
        )
      );

    return {
      activations: Number(row?.activations ?? 0),
      copies: Number(row?.copies ?? 0),
      platformOpens: Number(row?.platformOpens ?? 0),
      stepViews: Number(row?.stepViews ?? 0),
    };
  } catch (error) {
    captureError('Error fetching Instagram activation metrics', error);
    return empty;
  }
}

/**
 * Magic moment metrics: profiles with avatar + display name + DSP link + release.
 */
async function getMagicMomentMetrics(): Promise<{
  magicMomentCount: number;
  totalProfiles: number;
  enrichmentFailureCount: number;
}> {
  const profiles = await db
    .select({
      id: creatorProfiles.id,
      avatarUrl: creatorProfiles.avatarUrl,
      displayName: creatorProfiles.displayName,
      spotifyId: creatorProfiles.spotifyId,
      appleMusicId: creatorProfiles.appleMusicId,
      settings: creatorProfiles.settings,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.isClaimed, true));

  let magicMomentCount = 0;
  let enrichmentFailureCount = 0;

  // Get release counts per profile
  const releaseCounts = await db
    .select({
      profileId: discogReleases.creatorProfileId,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(discogReleases)
    .groupBy(discogReleases.creatorProfileId);

  const releaseCountMap = new Map(
    releaseCounts.map(r => [r.profileId, r.count])
  );

  for (const profile of profiles) {
    const hasAvatar = Boolean(profile.avatarUrl);
    const hasDisplayName = Boolean(profile.displayName);
    const hasDspLink = Boolean(profile.spotifyId || profile.appleMusicId);
    const hasRelease = (releaseCountMap.get(profile.id) ?? 0) > 0;

    if (hasAvatar && hasDisplayName && hasDspLink && hasRelease) {
      magicMomentCount++;
    }

    const settings = (profile.settings ?? {}) as Record<string, unknown>;
    const enrichmentStatus = (settings.enrichmentStatus ?? {}) as Record<
      string,
      string
    >;
    const hasFailure = Object.values(enrichmentStatus).includes('failed');
    if (hasFailure) {
      enrichmentFailureCount++;
    }
  }

  return {
    magicMomentCount,
    totalProfiles: profiles.length,
    enrichmentFailureCount,
  };
}

/**
 * Week-over-week signup growth rate.
 * Compares signups in the last 7 days vs the prior 7 days.
 */
async function getWowGrowthRate(): Promise<number | null> {
  try {
    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return null;

    const now = Date.now();
    const thisWeekStart = new Date(now - 7 * MS_PER_DAY);
    const lastWeekStart = new Date(now - 14 * MS_PER_DAY);

    const [thisWeek] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          drizzleSql`${leads.signupAt} IS NOT NULL`,
          gte(leads.signupAt, thisWeekStart)
        )
      );

    const [lastWeek] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(
        and(
          drizzleSql`${leads.signupAt} IS NOT NULL`,
          gte(leads.signupAt, lastWeekStart),
          drizzleSql`${leads.signupAt} < ${thisWeekStart}`
        )
      );

    const thisCount = Number(thisWeek?.count ?? 0);
    const lastCount = Number(lastWeek?.count ?? 0);

    if (lastCount === 0) return thisCount > 0 ? Number.POSITIVE_INFINITY : null;
    return (thisCount - lastCount) / lastCount;
  } catch (error) {
    captureError('Error fetching WoW growth rate', error);
    return null;
  }
}

/**
 * Estimated customer acquisition cost.
 * Query-based acquisition cost / total signups.
 */
async function getCacUsd(): Promise<number | null> {
  try {
    const hasLeads = await doesTableExist('leads');
    if (!hasLeads) return null;

    // Count total SerpAPI queries (approximated from leads discovered)
    const [totalLeads] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads);

    // Each SerpAPI query returns ~10 results, so queries ~= total / 10
    const estimatedQueries = Math.ceil(Number(totalLeads?.count ?? 0) / 10);
    const serpApiCost = estimatedQueries * SERPAPI_COST_PER_QUERY;

    // Count total signups
    const [signupRow] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(leads)
      .where(drizzleSql`${leads.signupAt} IS NOT NULL`);

    const signups = Number(signupRow?.count ?? 0);
    if (signups === 0) return null;

    return serpApiCost / signups;
  } catch (error) {
    captureError('Error fetching CAC', error);
    return null;
  }
}

/**
 * Simple LTV estimate: MRR per customer * 12 months (assumed avg lifespan).
 */
function computeLtv(mrrUsd: number, payingCustomers: number): number | null {
  if (payingCustomers <= 0) return null;
  const monthlyRevenuePerCustomer = mrrUsd / payingCustomers;
  return monthlyRevenuePerCustomer * 12;
}

/**
 * Payback period in months: CAC / monthly revenue per customer.
 */
function computePaybackPeriod(
  cacUsd: number | null,
  mrrUsd: number,
  payingCustomers: number
): number | null {
  if (cacUsd == null || payingCustomers <= 0) return null;
  if (cacUsd === 0) return 0;
  const monthlyRevenuePerCustomer = mrrUsd / payingCustomers;
  if (monthlyRevenuePerCustomer <= 0) return null;
  return cacUsd / monthlyRevenuePerCustomer;
}

/**
 * Active profiles in the last 30 days (profiles with non-bot click events).
 */
async function getActiveProfiles30d(): Promise<number | null> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const hasProfiles = await doesTableExist('creator_profiles');
    const hasClickEvents = await doesTableExist('click_events');
    if (!hasProfiles || !hasClickEvents) return null;

    // Count claimed profiles that had click events in the last 30 days
    const result = await db.execute(
      drizzleSql`
        SELECT COUNT(DISTINCT cp.id)::int as count
        FROM creator_profiles cp
        INNER JOIN click_events ce ON ce.creator_profile_id = cp.id
        WHERE cp.is_claimed = true
          AND ce.created_at >= ${thirtyDaysAgo}
          AND ce.is_bot = false
      `
    );

    return Number(extractRawRows(result)[0]?.count ?? 0);
  } catch (error) {
    captureError('Error fetching active profiles', error);
    return null;
  }
}

/**
 * Weekly funnel trend for the last N weeks.
 * Returns an array of { weekStart, scraped, qualified, contacted, signups, paid }.
 */
export async function getWeeklyFunnelTrend(weeks: number = 4): Promise<
  Array<{
    weekStart: string;
    scraped: number;
    qualified: number;
    contacted: number;
    signups: number;
    paid: number;
  }>
> {
  try {
    const hasEvents = await doesTableExist('lead_funnel_events');
    const hasLeads = await doesTableExist('leads');
    if (!hasEvents || !hasLeads) return [];

    const currentWeekStart = getUtcWeekStart(new Date());
    const seededWeeks = Array.from({ length: weeks }, (_, index) => {
      const weekStart = new Date(currentWeekStart);
      weekStart.setUTCDate(
        currentWeekStart.getUTCDate() - (weeks - index - 1) * 7
      );
      return weekStart;
    });
    const startDate = seededWeeks[0] ?? currentWeekStart;

    const rows = await db.execute(
      drizzleSql`
        SELECT
          DATE_TRUNC('week', occurred_at)::date as week_start,
          COUNT(DISTINCT CASE WHEN event_type = 'discovered' THEN lead_id END)::int AS scraped,
          COUNT(DISTINCT CASE WHEN event_type = 'qualified' THEN lead_id END)::int AS qualified,
          COUNT(DISTINCT CASE WHEN event_type IN ('email_queued', 'dm_sent') THEN lead_id END)::int AS contacted,
          COUNT(DISTINCT CASE WHEN event_type = 'signup_completed' THEN lead_id END)::int AS signups,
          COUNT(DISTINCT CASE WHEN event_type = 'paid_converted' THEN lead_id END)::int AS paid
        FROM lead_funnel_events
        WHERE occurred_at >= ${startDate}
        GROUP BY 1
        ORDER BY 1
      `
    );

    const weekMap = new Map(
      seededWeeks.map(weekStart => [
        formatUtcDate(weekStart),
        {
          scraped: 0,
          qualified: 0,
          contacted: 0,
          signups: 0,
          paid: 0,
        },
      ])
    );

    for (const row of extractRawRows(rows)) {
      const weekStart = String(row.week_start).slice(0, 10);
      if (!weekMap.has(weekStart)) {
        continue;
      }
      weekMap.set(weekStart, {
        scraped: Number(row.scraped ?? 0),
        qualified: Number(row.qualified ?? 0),
        contacted: Number(row.contacted ?? 0),
        signups: Number(row.signups ?? 0),
        paid: Number(row.paid ?? 0),
      });
    }

    return Array.from(weekMap.entries()).map(([weekStart, data]) => ({
      weekStart,
      ...data,
    }));
  } catch (error) {
    captureError('Error fetching weekly funnel trend', error);
    return [];
  }
}

/**
 * All-time funnel totals (not windowed).
 */
export async function getAllTimeFunnelTotals(): Promise<{
  scraped: number;
  qualified: number;
  contacted: number;
  claimed: number;
  signedUp: number;
  paid: number;
}> {
  const empty = {
    scraped: 0,
    qualified: 0,
    contacted: 0,
    claimed: 0,
    signedUp: 0,
    paid: 0,
  };

  try {
    const hasEvents = await doesTableExist('lead_funnel_events');
    if (!hasEvents) return empty;

    const rows = await db.execute(
      drizzleSql`
        SELECT
          COUNT(DISTINCT CASE WHEN event_type = 'discovered' THEN lead_id END)::int AS scraped,
          COUNT(DISTINCT CASE WHEN event_type = 'qualified' THEN lead_id END)::int AS qualified,
          COUNT(DISTINCT CASE WHEN event_type IN ('email_queued', 'dm_sent') THEN lead_id END)::int AS contacted,
          COUNT(DISTINCT CASE WHEN event_type = 'claim_page_viewed' THEN lead_id END)::int AS claimed,
          COUNT(DISTINCT CASE WHEN event_type = 'signup_completed' THEN lead_id END)::int AS signed_up,
          COUNT(DISTINCT CASE WHEN event_type = 'paid_converted' THEN lead_id END)::int AS paid
        FROM lead_funnel_events
      `
    );

    const rawRows = extractRawRows(rows);
    if (rawRows.length === 0) return empty;
    const row = rawRows[0];

    return {
      scraped: Number(row.scraped ?? 0),
      qualified: Number(row.qualified ?? 0),
      contacted: Number(row.contacted ?? 0),
      claimed: Number(row.claimed ?? 0),
      signedUp: Number(row.signed_up ?? 0),
      paid: Number(row.paid ?? 0),
    };
  } catch (error) {
    captureError('Error fetching all-time funnel totals', error);
    return empty;
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
    instagramActivationMetrics,
    outreachSent7d,
    claimClicks7d,
    signups7d,
    paidConversions7d,
    stripeMetrics,
    magicMomentMetrics,
    wowGrowthRate,
    cacUsd,
    activeProfiles30d,
  ] = await Promise.all([
    getInstagramActivationMetrics7d(sevenDaysAgo).catch(err => {
      errors.push(
        `Instagram Activation: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return {
        activations: 0,
        copies: 0,
        platformOpens: 0,
        stepViews: 0,
      };
    }),
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
    getMagicMomentMetrics().catch(err => {
      errors.push(
        `MagicMoment: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return {
        magicMomentCount: 0,
        totalProfiles: 0,
        enrichmentFailureCount: 0,
      };
    }),
    getWowGrowthRate().catch(err => {
      errors.push(
        `WoW Growth: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return null;
    }),
    getCacUsd().catch(err => {
      errors.push(`CAC: ${err instanceof Error ? err.message : 'unknown'}`);
      return null;
    }),
    getActiveProfiles30d().catch(err => {
      errors.push(
        `Active Profiles: ${err instanceof Error ? err.message : 'unknown'}`
      );
      return null;
    }),
  ]);

  const mrrUsd = stripeMetrics?.mrrUsd ?? 0;
  const stripeAvailable = stripeMetrics?.isAvailable ?? false;
  const payingCustomers = stripeMetrics?.activeSubscribers ?? 0;
  const arrUsd = mrrUsd * 12;

  // Runway: MRR offsets burn. If MRR >= burn, runway is infinite (null).
  // Otherwise, runway = 0 because we don't have a balance to draw down.
  // This is a simplified model — with Mercury balance it would be balance / (burn - mrr).
  let runwayMonths: number | null = null;
  if (stripeAvailable) {
    const netBurn = BASELINE_BURN_USD - mrrUsd;
    if (netBurn > 0) {
      // Without Mercury balance, estimate based on burn rate alone
      // Show 0 if we can't calculate (no balance data)
      runwayMonths = 0;
    }
  }

  const defaultAliveDate =
    runwayMonths !== null && runwayMonths > 0
      ? new Date(Date.now() + runwayMonths * 30 * MS_PER_DAY)
          .toISOString()
          .slice(0, 10)
      : null;

  const momGrowthRate =
    stripeMetrics && stripeMetrics.mrrUsd30dAgo > 0
      ? mrrUsd / stripeMetrics.mrrUsd30dAgo - 1
      : null;

  return {
    instagramShareStepViews7d: instagramActivationMetrics.stepViews,
    instagramBioCopies7d: instagramActivationMetrics.copies,
    instagramBioOpenRate7d: safeRate(
      instagramActivationMetrics.platformOpens,
      instagramActivationMetrics.stepViews
    ),
    instagramBioActivations7d: instagramActivationMetrics.activations,
    instagramBioActivationRate7d: safeRate(
      instagramActivationMetrics.activations,
      instagramActivationMetrics.stepViews
    ),
    outreachSent7d,
    claimClicks7d,
    claimRate: safeRate(claimClicks7d, outreachSent7d),
    signups7d,
    signupRate: safeRate(signups7d, claimClicks7d),
    paidConversions7d,
    paidConversionRate: safeRate(paidConversions7d, signups7d),
    mrrUsd,
    arrUsd,
    payingCustomers,
    runwayMonths,
    defaultAliveDate,
    wowGrowthRate,
    momGrowthRate,
    churnRate: null,
    retention30d: null,
    retention60d: null,
    retention90d: null,
    engagementActiveProfiles30d: activeProfiles30d,
    cacUsd,
    ltvUsd: computeLtv(mrrUsd, payingCustomers),
    paybackPeriodMonths: computePaybackPeriod(cacUsd, mrrUsd, payingCustomers),
    stripeAvailable,
    errors,
    outreachToSignupRate: safeRate(signups7d, outreachSent7d),
    signupToPaidRate: safeRate(paidConversions7d, signups7d),
    dollarPerOutreach: safeRate(mrrUsd, outreachSent7d),
    magicMomentRate: safeRate(
      magicMomentMetrics.magicMomentCount,
      magicMomentMetrics.totalProfiles
    ),
    magicMomentCount: magicMomentMetrics.magicMomentCount,
    enrichmentFailureRate: safeRate(
      magicMomentMetrics.enrichmentFailureCount,
      magicMomentMetrics.totalProfiles
    ),
  };
}
