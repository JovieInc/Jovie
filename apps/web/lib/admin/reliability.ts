import 'server-only';

import { and, sql as drizzleSql, inArray } from 'drizzle-orm';
import { checkDbHealth, db, doesTableExist, TABLE_NAMES } from '@/lib/db';
import { stripeWebhookEvents } from '@/lib/db/schema/billing';
import { sqlTimestamp } from '@/lib/db/sql-helpers';
import { getHudDeployments } from '@/lib/deployments/github';
import { captureError, captureWarning } from '@/lib/error-tracking';
import { getRedis } from '@/lib/redis';
import { getAdminSentryMetrics } from './sentry-metrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REDIS_REACHABILITY_TIMEOUT_MS = 250;
const DISABLED_RELIABILITY_TABLES = new Set<string>();

export interface AdminReliabilitySummary {
  errorRatePercent: number;
  p95LatencyMs: number | null;
  incidents24h: number;
  lastIncidentAt: Date | null;
  unresolvedSentryIssues24h: number;
  redisAvailable: boolean;
  deploymentAvailability: 'available' | 'error' | 'not_configured';
  deploymentState: 'success' | 'failure' | 'in_progress' | 'unknown' | null;
}

/**
 * Performs a bounded Redis reachability check for the admin reliability summary.
 */
async function isRedisReachable(): Promise<boolean> {
  const redis = getRedis({
    signal: AbortSignal.timeout(REDIS_REACHABILITY_TIMEOUT_MS),
  });
  if (!redis) {
    return false;
  }

  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the admin reliability summary from DB, Sentry, deployment, and Redis signals.
 */
export async function getAdminReliabilitySummary(): Promise<AdminReliabilitySummary> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - MS_PER_DAY);
  const [dbHealth, sentryMetrics, deployments, redisAvailable] =
    await Promise.all([
      checkDbHealth().catch(() => ({ latency: null })),
      getAdminSentryMetrics().catch(() => null),
      getHudDeployments().catch(() => ({
        availability: 'error' as const,
        current: null,
        recent: [],
      })),
      isRedisReachable(),
    ]);

  const reliabilityBase = {
    p95LatencyMs: dbHealth.latency ?? null,
    unresolvedSentryIssues24h: sentryMetrics?.unresolvedIssues24h ?? 0,
    redisAvailable,
    deploymentAvailability: deployments.availability,
    deploymentState:
      deployments.current?.status === 'not_configured'
        ? null
        : (deployments.current?.status ?? null),
  };
  const hasStripeEvents =
    !DISABLED_RELIABILITY_TABLES.has(TABLE_NAMES.stripeWebhookEvents) &&
    (await doesTableExist(TABLE_NAMES.stripeWebhookEvents));

  if (!hasStripeEvents) {
    return {
      errorRatePercent: 0,
      incidents24h: 0,
      lastIncidentAt: null,
      ...reliabilityBase,
    };
  }

  try {
    let totalEvents = 0;
    let incidentCount = 0;
    let lastIncidentAt: Date | null = null;

    try {
      const rows = await db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(stripeWebhookEvents)
        .where(
          drizzleSql`${stripeWebhookEvents.createdAt} >= ${sqlTimestamp(dayAgo)}`
        );
      totalEvents = Number(rows[0]?.count ?? 0);
    } catch {
      DISABLED_RELIABILITY_TABLES.add(TABLE_NAMES.stripeWebhookEvents);
      captureWarning(
        'Stripe webhook events unavailable; skipping reliability summary.'
      );

      return {
        errorRatePercent: 0,
        incidents24h: 0,
        lastIncidentAt: null,
        ...reliabilityBase,
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
            drizzleSql`${stripeWebhookEvents.createdAt} >= ${sqlTimestamp(dayAgo)}`,
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
      if (rawLastAt instanceof Date) {
        lastIncidentAt = rawLastAt;
      } else if (rawLastAt != null) {
        lastIncidentAt = new Date(String(rawLastAt));
      }
    } catch {
      DISABLED_RELIABILITY_TABLES.add(TABLE_NAMES.stripeWebhookEvents);
      captureWarning(
        'Stripe webhook incidents unavailable; skipping reliability summary.'
      );

      return {
        errorRatePercent: 0,
        incidents24h: 0,
        lastIncidentAt: null,
        ...reliabilityBase,
      };
    }

    const errorRatePercent =
      totalEvents > 0 ? (Number(incidentCount) / Number(totalEvents)) * 100 : 0;

    return {
      errorRatePercent,
      incidents24h: Number(incidentCount),
      lastIncidentAt,
      ...reliabilityBase,
    };
  } catch (error) {
    captureError('Error loading admin reliability summary', error);

    return {
      errorRatePercent: 0,
      incidents24h: 0,
      lastIncidentAt: null,
      ...reliabilityBase,
    };
  }
}
