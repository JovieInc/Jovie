import 'server-only';

import { and, desc, sql as drizzleSql, inArray } from 'drizzle-orm';

import { checkDbHealth, db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import {
  creatorProfiles,
  stripeWebhookEvents,
  waitlistEntries,
} from '@/lib/db/schema';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { getAdminMercuryMetrics } from './mercury-metrics';
import { getAdminStripeOverviewMetrics } from './stripe-metrics';

const DISABLED_TABLES = new Set<string>();

function shouldDisableStripeEventsTable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const mentionsTable = msg.includes('stripe_webhook_events');
  const isMissingRelation =
    msg.includes('does not exist') ||
    msg.includes('undefined_table') ||
    msg.includes('relation') ||
    msg.includes('missing relation');
  return mentionsTable && isMissingRelation;
}

/**
 * Fetches waitlist count with error handling
 */
async function getWaitlistCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(waitlistEntries);
    return Number(row?.count ?? 0);
  } catch (error) {
    console.error('Error fetching waitlist count:', error);
    return 0;
  }
}

/**
 * Computes financial runway and profitability metrics
 */
function computeFinancialMetrics(
  monthlyRevenue: number,
  monthlyExpense: number,
  balance: number,
  revenueGrowth30d: number
): {
  runwayMonths: number | null;
  netBurn: number;
  monthsToProfitability: number | null;
} {
  const netBurn = monthlyExpense - monthlyRevenue;
  const runwayMonths = netBurn > 0 ? balance / netBurn : null;
  const monthsToProfitability =
    netBurn > 0 && revenueGrowth30d > 0 ? netBurn / revenueGrowth30d : null;

  return { runwayMonths, netBurn, monthsToProfitability };
}

/**
 * Determines if company is "default alive" based on Paul Graham's definition
 */
function isDefaultAlive(
  netBurn: number,
  monthsToProfitability: number | null,
  runwayMonths: number | null
): boolean {
  return (
    netBurn <= 0 ||
    (monthsToProfitability != null &&
      runwayMonths != null &&
      monthsToProfitability <= runwayMonths)
  );
}

/**
 * Generates human-readable status detail message
 */
function computeDefaultStatusDetail(
  netBurn: number,
  monthsToProfitability: number | null,
  runwayMonths: number | null,
  isAlive: boolean
): string {
  if (netBurn <= 0) {
    return 'Revenue already exceeds spend at the current run rate.';
  }
  if (monthsToProfitability == null) {
    return 'Revenue growth is not yet outpacing burn at the current trajectory.';
  }
  if (runwayMonths == null) {
    return 'Runway is currently unlimited based on cash flow.';
  }
  if (isAlive) {
    return `Runway covers roughly ${monthsToProfitability.toFixed(1)} months to profitability.`;
  }
  return 'At the current growth rate, runway ends before profitability.';
}

/**
 * Generates error message for missing financial data sources
 */
function getMissingServicesMessage(
  stripeMetrics: { isConfigured: boolean; isAvailable: boolean },
  mercuryMetrics: { isConfigured: boolean; isAvailable: boolean }
): string {
  const missingServices: string[] = [];

  if (!stripeMetrics.isConfigured) {
    missingServices.push('Stripe (not configured)');
  } else if (!stripeMetrics.isAvailable) {
    missingServices.push('Stripe (unavailable)');
  }

  if (!mercuryMetrics.isConfigured) {
    missingServices.push('Mercury (not configured)');
  } else if (!mercuryMetrics.isAvailable) {
    missingServices.push('Mercury (unavailable)');
  }

  return missingServices.length > 0
    ? `Cannot calculate status: ${missingServices.join(', ')}`
    : 'Financial data sources unavailable.';
}

export interface AdminUsagePoint {
  label: string;
  value: number;
}

export interface AdminReliabilitySummary {
  errorRatePercent: number;
  p95LatencyMs: number | null;
  incidents24h: number;
  lastIncidentAt: Date | null;
}

export type AdminActivityStatus = 'success' | 'warning' | 'error';

export interface AdminActivityItem {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  status: AdminActivityStatus;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function getAdminUsageSeries(
  days: number = 14
): Promise<AdminUsagePoint[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - (days - 1) * MS_PER_DAY);
  const startIso = startDate.toISOString();

  let rows: { date: string; activeUsers: number | null }[] = [];
  try {
    const result = await db.execute(
      `
        SELECT DATE(created_at) AS date, COUNT(DISTINCT ip_address) AS active_users
        FROM click_events
        WHERE created_at >= '${startIso}'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `
    );
    const rawRows = (result as { rows?: Record<string, unknown>[] }).rows ?? [];
    rows = rawRows.map(row => ({
      date: String(row.date),
      activeUsers: row.active_users != null ? Number(row.active_users) : null,
    }));
  } catch (error) {
    console.error('Error loading admin usage series', error);
    // Fall through with empty rows, which will produce a zeroed series
  }

  const countsByDate = new Map<string, number>();
  for (const row of rows) {
    const value = Number(row.activeUsers ?? 0);
    countsByDate.set(row.date, value);
  }

  const points: AdminUsagePoint[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate.getTime() + i * MS_PER_DAY);
    const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const value = countsByDate.get(key) ?? 0;
    points.push({ label, value });
  }

  return points;
}

export async function getAdminReliabilitySummary(): Promise<AdminReliabilitySummary> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - MS_PER_DAY);
  const hasStripeEvents =
    !DISABLED_TABLES.has(TABLE_NAMES.stripeWebhookEvents) &&
    (await doesTableExist(TABLE_NAMES.stripeWebhookEvents));

  if (!hasStripeEvents) {
    const dbHealth = await checkDbHealth();
    return {
      errorRatePercent: 0,
      p95LatencyMs: dbHealth.latency ?? null,
      incidents24h: 0,
      lastIncidentAt: null,
    };
  }

  try {
    const dbHealth = await checkDbHealth();

    let totalEvents = 0;
    let incidentCount = 0;
    let lastIncidentAt: Date | null = null;

    try {
      const rows = await db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(stripeWebhookEvents)
        .where(
          drizzleSql`${stripeWebhookEvents.createdAt} >= ${dayAgo}::timestamp`
        );
      totalEvents = Number(rows[0]?.count ?? 0);
    } catch {
      DISABLED_TABLES.add(TABLE_NAMES.stripeWebhookEvents);
      console.warn(
        'Stripe webhook events unavailable; skipping reliability summary.'
      );

      return {
        errorRatePercent: 0,
        p95LatencyMs: dbHealth.latency ?? null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    }

    try {
      const rows = await db
        .select({
          count: drizzleSql<number>`count(*)`,
          lastAt: drizzleSql<Date | null>`max(${stripeWebhookEvents.createdAt})`,
        })
        .from(stripeWebhookEvents)
        .where(
          and(
            drizzleSql`${stripeWebhookEvents.createdAt} >= ${dayAgo}::timestamp`,
            inArray(stripeWebhookEvents.type, [
              'checkout.session.completed',
              'customer.subscription.created',
              'invoice.payment_failed',
            ])
          )
        );

      const row = rows[0];
      incidentCount = Number(row?.count ?? 0);
      const rawLastAt = row?.lastAt;
      // Extract nested ternary for clarity (S3358)
      if (rawLastAt instanceof Date) {
        lastIncidentAt = rawLastAt;
      } else if (rawLastAt != null) {
        lastIncidentAt = new Date(String(rawLastAt));
      } else {
        lastIncidentAt = null;
      }
    } catch {
      DISABLED_TABLES.add(TABLE_NAMES.stripeWebhookEvents);
      console.warn(
        'Stripe webhook incidents unavailable; skipping reliability summary.'
      );

      return {
        errorRatePercent: 0,
        p95LatencyMs: dbHealth.latency ?? null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    }

    const errorRatePercent =
      totalEvents > 0 ? (Number(incidentCount) / Number(totalEvents)) * 100 : 0;

    return {
      errorRatePercent,
      p95LatencyMs: dbHealth.latency ?? null,
      incidents24h: Number(incidentCount),
      lastIncidentAt,
    };
  } catch (error) {
    console.error('Error loading admin reliability summary', error);

    try {
      const dbHealth = await checkDbHealth();
      return {
        errorRatePercent: 0,
        p95LatencyMs: dbHealth.latency ?? null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    } catch {
      return {
        errorRatePercent: 0,
        p95LatencyMs: null,
        incidents24h: 0,
        lastIncidentAt: null,
      };
    }
  }
}

function formatTimestamp(timestamp: Date): string {
  return `${timestamp.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function mapStripeEventToActivity(event: {
  id: string;
  type: string;
  createdAt: Date;
}): AdminActivityItem {
  // Declare without initial values to avoid dead stores (S1854)
  let action: string;
  let status: AdminActivityStatus;

  switch (event.type) {
    case 'invoice.payment_failed':
      action = 'Invoice payment failed';
      status = 'error';
      break;
    case 'invoice.payment_succeeded':
      action = 'Invoice payment succeeded';
      status = 'success';
      break;
    case 'customer.subscription.created':
      action = 'Subscription created';
      status = 'success';
      break;
    case 'customer.subscription.updated':
      action = 'Subscription updated';
      status = 'warning';
      break;
    case 'customer.subscription.deleted':
      action = 'Subscription cancelled';
      status = 'warning';
      break;
    default:
      action = event.type;
      status = 'success';
      break;
  }

  return {
    id: `stripe-${event.id}`,
    user: 'Stripe',
    action,
    timestamp: formatTimestamp(event.createdAt),
    status,
  };
}

type CreatorActivityRow = {
  id: string;
  username: string;
  createdAt: Date | null;
};

type StripeActivityRow = {
  id: string;
  type: string;
  createdAt: Date;
};

export interface DataAvailability {
  isConfigured: boolean;
  isAvailable: boolean;
  errorMessage?: string;
}

export interface AdminOverviewMetrics {
  mrrUsd: number;
  mrrGrowth30dUsd: number;
  activeSubscribers: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
  defaultStatus: 'alive' | 'dead';
  defaultStatusDetail: string;
  waitlistCount: number;
  stripeAvailability: DataAvailability;
  mercuryAvailability: DataAvailability;
}

export async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const defaultUnavailableMetrics: AdminOverviewMetrics = {
    mrrUsd: 0,
    mrrGrowth30dUsd: 0,
    activeSubscribers: 0,
    balanceUsd: 0,
    burnRateUsd: 0,
    runwayMonths: null,
    defaultStatus: 'dead',
    defaultStatusDetail: 'Unable to compute default status.',
    waitlistCount: 0,
    stripeAvailability: { isConfigured: false, isAvailable: false },
    mercuryAvailability: { isConfigured: false, isAvailable: false },
  };

  try {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.isAuthenticated || !entitlements.isAdmin) {
      return {
        ...defaultUnavailableMetrics,
        defaultStatusDetail:
          'Admin access is required to evaluate default status.',
      };
    }

    const [stripeMetrics, mercuryMetrics, waitlistCount] = await Promise.all([
      getAdminStripeOverviewMetrics(),
      getAdminMercuryMetrics(),
      getWaitlistCount(),
    ]);

    const stripeAvailability: DataAvailability = {
      isConfigured: stripeMetrics.isConfigured,
      isAvailable: stripeMetrics.isAvailable,
      errorMessage: stripeMetrics.errorMessage,
    };

    const mercuryAvailability: DataAvailability = {
      isConfigured: mercuryMetrics.isConfigured,
      isAvailable: mercuryMetrics.isAvailable,
      errorMessage: mercuryMetrics.errorMessage,
    };

    const canCalculateFinancials =
      stripeMetrics.isAvailable && mercuryMetrics.isAvailable;

    let runwayMonths: number | null = null;
    let netBurn = 0;
    let monthsToProfitability: number | null = null;
    let isAlive = false;
    let defaultStatusDetail = '';

    if (canCalculateFinancials) {
      const financialMetrics = computeFinancialMetrics(
        stripeMetrics.mrrUsd,
        mercuryMetrics.burnRateUsd,
        mercuryMetrics.balanceUsd,
        stripeMetrics.mrrGrowth30dUsd
      );

      runwayMonths = financialMetrics.runwayMonths;
      netBurn = financialMetrics.netBurn;
      monthsToProfitability = financialMetrics.monthsToProfitability;

      isAlive = isDefaultAlive(netBurn, monthsToProfitability, runwayMonths);
      defaultStatusDetail = computeDefaultStatusDetail(
        netBurn,
        monthsToProfitability,
        runwayMonths,
        isAlive
      );
    } else {
      defaultStatusDetail = getMissingServicesMessage(
        stripeMetrics,
        mercuryMetrics
      );
    }

    return {
      mrrUsd: stripeMetrics.mrrUsd,
      mrrGrowth30dUsd: stripeMetrics.mrrGrowth30dUsd,
      activeSubscribers: stripeMetrics.activeSubscribers,
      balanceUsd: mercuryMetrics.balanceUsd,
      burnRateUsd: mercuryMetrics.burnRateUsd,
      runwayMonths,
      defaultStatus: isAlive ? 'alive' : 'dead',
      defaultStatusDetail,
      waitlistCount,
      stripeAvailability,
      mercuryAvailability,
    };
  } catch (error) {
    console.error('Error computing admin overview metrics:', error);
    return {
      ...defaultUnavailableMetrics,
      defaultStatusDetail:
        'Unable to compute default status due to a metrics error.',
    };
  }
}

export async function getAdminActivityFeed(
  limit: number = 10
): Promise<AdminActivityItem[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  const hasStripeEvents =
    !DISABLED_TABLES.has(TABLE_NAMES.stripeWebhookEvents) &&
    (await doesTableExist(TABLE_NAMES.stripeWebhookEvents));
  const hasCreatorProfiles = await doesTableExist(TABLE_NAMES.creatorProfiles);

  try {
    const creatorPromise: Promise<CreatorActivityRow[]> = hasCreatorProfiles
      ? db
          .select({
            id: creatorProfiles.id,
            username: creatorProfiles.username,
            createdAt: creatorProfiles.createdAt,
          })
          .from(creatorProfiles)
          .where(
            drizzleSql`${creatorProfiles.createdAt} >= ${sevenDaysAgo}::timestamp`
          )
          .orderBy(desc(creatorProfiles.createdAt))
          .limit(limit)
      : Promise.resolve([] as CreatorActivityRow[]);

    const [recentCreators, recentStripeEvents] = await Promise.all([
      creatorPromise,
      (async () => {
        if (!hasStripeEvents) return [] as StripeActivityRow[];
        try {
          return await db
            .select({
              id: stripeWebhookEvents.id,
              type: stripeWebhookEvents.type,
              createdAt: stripeWebhookEvents.createdAt,
            })
            .from(stripeWebhookEvents)
            .where(
              drizzleSql`${stripeWebhookEvents.createdAt} >= ${sevenDaysAgo}::timestamp`
            )
            .orderBy(desc(stripeWebhookEvents.createdAt))
            .limit(limit);
        } catch (error) {
          if (shouldDisableStripeEventsTable(error)) {
            DISABLED_TABLES.add(TABLE_NAMES.stripeWebhookEvents);
          }
          console.warn('Stripe webhook activity unavailable; skipping.');
          return [] as StripeActivityRow[];
        }
      })(),
    ]);

    const creatorItems: AdminActivityItem[] = recentCreators.map(row => ({
      id: `creator-${row.id}`,
      user: `@${row.username}`,
      action: 'Creator profile created',
      timestamp: formatTimestamp(row.createdAt ?? new Date()),
      status: 'success',
    }));

    const stripeItems: AdminActivityItem[] = recentStripeEvents.map(event =>
      mapStripeEventToActivity(event)
    );

    const allItems = [...creatorItems, ...stripeItems];

    allItems.sort((a, b) => {
      const aTime = Date.parse(
        a.timestamp.replace(' UTC', '').replace(' ', 'T')
      );
      const bTime = Date.parse(
        b.timestamp.replace(' UTC', '').replace(' ', 'T')
      );
      return bTime - aTime;
    });

    return allItems.slice(0, limit);
  } catch (error) {
    console.error('Error loading admin activity feed', error);
    return [];
  }
}
