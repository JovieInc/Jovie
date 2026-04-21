import 'server-only';

import {
  and,
  asc,
  desc,
  sql as drizzleSql,
  eq,
  gte,
  inArray,
} from 'drizzle-orm';
import { db, doesTableExist } from '@/lib/db';
import {
  productFunnelAlertStates,
  productFunnelEvents,
  productSyntheticRuns,
} from '@/lib/db/schema/product-funnel';
import { captureError } from '@/lib/error-tracking';
import {
  PRODUCT_FUNNEL_STAGE_ORDER,
  type ProductFunnelEventType,
} from '@/lib/product-funnel/shared';

export type ProductFunnelTimeRange = '24h' | '7d' | '30d';

export interface AdminProductFunnelStage {
  readonly key: ProductFunnelEventType;
  readonly label: string;
  readonly count: number;
  readonly conversionRate: number | null;
  readonly dropOff: number | null;
}

export interface AdminProductFunnelAlert {
  readonly ruleName: string;
  readonly severity: 'warning' | 'critical';
  readonly reason: string;
  readonly lastTriggeredAt: Date | null;
}

export interface SyntheticMonitorStatus {
  readonly monitorKey: string;
  readonly status: 'running' | 'success' | 'failure' | 'idle';
  readonly lastStartedAt: Date | null;
  readonly lastFinishedAt: Date | null;
  readonly error: string | null;
  readonly consecutiveFailures: number;
}

export interface AdminProductFunnelExternalEngagementMetrics {
  readonly profileEngagedDay1: number;
  readonly profileEngagedDay7: number;
}

export interface AdminProductFunnelDashboard {
  readonly timeRange: ProductFunnelTimeRange;
  readonly stages: readonly AdminProductFunnelStage[];
  readonly activeAlerts: readonly AdminProductFunnelAlert[];
  readonly externalEngagement: AdminProductFunnelExternalEngagementMetrics;
  readonly syntheticMonitor: SyntheticMonitorStatus;
  readonly latestPaymentSucceededAt: Date | null;
  readonly latestRetentionMaterializedAt: Date | null;
  readonly dataCollectionStartedAt: Date | null;
  readonly sentryReliabilityNote: string;
  readonly errors: readonly string[];
}

const TIME_RANGE_MS: Record<ProductFunnelTimeRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const STAGE_LABELS: Record<ProductFunnelEventType, string> = {
  visit: 'Visit',
  signup_started: 'Signup Started',
  signup_completed: 'Signup Completed',
  email_verified: 'Email Verified',
  onboarding_started: 'Onboarding Started',
  onboarding_completed: 'Onboarding Completed',
  activated: 'Activated',
  checkout_started: 'Checkout Started',
  payment_succeeded: 'Payment Succeeded',
  retained_day_1: 'Retained Day 1',
  retained_day_7: 'Retained Day 7',
  app_session: 'App Session',
};

const ALERT_SEVERITY: Record<string, 'warning' | 'critical'> = {
  signup_completion_stalled: 'critical',
  onboarding_completion_stalled: 'critical',
  payment_completion_stalled: 'critical',
  synthetic_signup_failing: 'critical',
};

function buildEmptyDashboard(
  timeRange: ProductFunnelTimeRange,
  errors: readonly string[]
): AdminProductFunnelDashboard {
  return {
    timeRange,
    stages: buildStages({}),
    activeAlerts: [],
    externalEngagement: {
      profileEngagedDay1: 0,
      profileEngagedDay7: 0,
    },
    syntheticMonitor: {
      monitorKey: 'synthetic_signup',
      status: 'idle',
      lastStartedAt: null,
      lastFinishedAt: null,
      error: null,
      consecutiveFailures: 0,
    },
    latestPaymentSucceededAt: null,
    latestRetentionMaterializedAt: null,
    dataCollectionStartedAt: null,
    sentryReliabilityNote:
      '10-minute production error-rate alerting is managed in Sentry.',
    errors,
  };
}

function getRangeStart(timeRange: ProductFunnelTimeRange): Date {
  return new Date(Date.now() - TIME_RANGE_MS[timeRange]);
}

function buildStages(
  counts: Partial<Record<ProductFunnelEventType, number>>
): readonly AdminProductFunnelStage[] {
  return PRODUCT_FUNNEL_STAGE_ORDER.map((key, index) => {
    const count = counts[key] ?? 0;
    if (index === 0) {
      return {
        key,
        label: STAGE_LABELS[key],
        count,
        conversionRate: null,
        dropOff: null,
      };
    }

    const previousCount = counts[PRODUCT_FUNNEL_STAGE_ORDER[index - 1]] ?? 0;
    return {
      key,
      label: STAGE_LABELS[key],
      count,
      conversionRate: previousCount > 0 ? count / previousCount : null,
      dropOff: previousCount > 0 ? previousCount - count : null,
    };
  });
}

async function getExternalEngagementMetrics(
  rangeStart: Date,
  now: Date
): Promise<AdminProductFunnelExternalEngagementMetrics> {
  type EngagementRow = {
    profile_engaged_day_1: string | number;
    profile_engaged_day_7: string | number;
  };

  // Use raw SQL here because Drizzle does not express this CTE + FILTER +
  // correlated EXISTS query cleanly.
  const result = await db.execute<EngagementRow>(drizzleSql`
    WITH activations AS (
      SELECT occurred_at, creator_profile_id
      FROM product_funnel_events
      WHERE event_type = 'activated'
        AND is_synthetic = false
        AND occurred_at >= ${rangeStart}
        AND creator_profile_id IS NOT NULL
    )
    SELECT
      COUNT(*) FILTER (
        WHERE occurred_at + interval '1 day' <= ${now}
          AND EXISTS (
            SELECT 1
            FROM click_events ce
            WHERE ce.creator_profile_id = activations.creator_profile_id
              AND ce.is_bot = false
              AND ce.created_at >= activations.occurred_at + interval '1 day'
              AND ce.created_at < activations.occurred_at + interval '2 day'
          )
      ) AS profile_engaged_day_1,
      COUNT(*) FILTER (
        WHERE occurred_at + interval '7 day' <= ${now}
          AND EXISTS (
            SELECT 1
            FROM click_events ce
            WHERE ce.creator_profile_id = activations.creator_profile_id
              AND ce.is_bot = false
              AND ce.created_at >= activations.occurred_at + interval '7 day'
              AND ce.created_at < activations.occurred_at + interval '8 day'
          )
      ) AS profile_engaged_day_7
    FROM activations
  `);

  const row = result.rows[0];
  return {
    profileEngagedDay1: Number(row?.profile_engaged_day_1 ?? 0),
    profileEngagedDay7: Number(row?.profile_engaged_day_7 ?? 0),
  };
}

export async function getAdminProductFunnelDashboard(
  timeRange: ProductFunnelTimeRange = '24h'
): Promise<AdminProductFunnelDashboard> {
  const now = new Date();
  const rangeStart = getRangeStart(timeRange);
  const errors: string[] = [];

  try {
    const [
      hasEventsTable,
      hasAlertStatesTable,
      hasSyntheticRunsTable,
      hasClickEventsTable,
    ] = await Promise.all([
      doesTableExist('product_funnel_events'),
      doesTableExist('product_funnel_alert_states'),
      doesTableExist('product_synthetic_runs'),
      doesTableExist('click_events'),
    ]);

    if (!hasEventsTable) {
      return buildEmptyDashboard(timeRange, [
        'Product funnel schema is not available in this environment yet.',
      ]);
    }

    const [
      stageRows,
      alertRows,
      syntheticRun,
      syntheticFailureRows,
      paymentRows,
      retentionRows,
      startRows,
      externalEngagement,
    ] = await Promise.all([
      db
        .select({
          eventType: productFunnelEvents.eventType,
          count: drizzleSql<number>`count(*)`,
        })
        .from(productFunnelEvents)
        .where(
          and(
            eq(productFunnelEvents.isSynthetic, false),
            gte(productFunnelEvents.occurredAt, rangeStart),
            inArray(productFunnelEvents.eventType, PRODUCT_FUNNEL_STAGE_ORDER)
          )
        )
        .groupBy(productFunnelEvents.eventType),
      hasAlertStatesTable
        ? db
            .select()
            .from(productFunnelAlertStates)
            .where(eq(productFunnelAlertStates.status, 'alerting'))
            .orderBy(desc(productFunnelAlertStates.lastTriggeredAt))
        : Promise.resolve([]),
      hasSyntheticRunsTable
        ? db
            .select()
            .from(productSyntheticRuns)
            .where(eq(productSyntheticRuns.monitorKey, 'synthetic_signup'))
            .orderBy(desc(productSyntheticRuns.startedAt))
            .limit(1)
        : Promise.resolve([]),
      hasSyntheticRunsTable
        ? db
            .select({ status: productSyntheticRuns.status })
            .from(productSyntheticRuns)
            .where(eq(productSyntheticRuns.monitorKey, 'synthetic_signup'))
            .orderBy(desc(productSyntheticRuns.startedAt))
            .limit(5)
        : Promise.resolve([]),
      db
        .select({
          occurredAt: productFunnelEvents.occurredAt,
        })
        .from(productFunnelEvents)
        .where(
          and(
            eq(productFunnelEvents.eventType, 'payment_succeeded'),
            eq(productFunnelEvents.isSynthetic, false)
          )
        )
        .orderBy(desc(productFunnelEvents.occurredAt))
        .limit(1),
      db
        .select({
          occurredAt: productFunnelEvents.occurredAt,
        })
        .from(productFunnelEvents)
        .where(
          and(
            inArray(productFunnelEvents.eventType, [
              'retained_day_1',
              'retained_day_7',
            ]),
            eq(productFunnelEvents.isSynthetic, false)
          )
        )
        .orderBy(desc(productFunnelEvents.occurredAt))
        .limit(1),
      db
        .select({
          createdAt: productFunnelEvents.createdAt,
        })
        .from(productFunnelEvents)
        .orderBy(asc(productFunnelEvents.createdAt))
        .limit(1),
      hasClickEventsTable
        ? getExternalEngagementMetrics(rangeStart, now)
        : Promise.resolve({
            profileEngagedDay1: 0,
            profileEngagedDay7: 0,
          }),
    ]);

    if (!hasAlertStatesTable) {
      errors.push('Product funnel alert state table is not available yet.');
    }
    if (!hasSyntheticRunsTable) {
      errors.push('Synthetic monitor history table is not available yet.');
    }
    if (!hasClickEventsTable) {
      errors.push(
        'External engagement metrics are unavailable in this environment.'
      );
    }

    const counts = Object.fromEntries(
      stageRows.map(row => [row.eventType, Number(row.count ?? 0)])
    ) as Partial<Record<ProductFunnelEventType, number>>;
    const stages = buildStages(counts);

    let consecutiveFailures = 0;
    for (const row of syntheticFailureRows) {
      if (row.status !== 'failure') {
        break;
      }
      consecutiveFailures += 1;
    }

    return {
      timeRange,
      stages,
      activeAlerts: alertRows.map(row => ({
        ruleName: row.ruleName,
        severity: ALERT_SEVERITY[row.ruleName] ?? 'warning',
        reason:
          row.lastPayload !== null &&
          typeof row.lastPayload === 'object' &&
          'reason' in row.lastPayload &&
          typeof row.lastPayload.reason === 'string'
            ? row.lastPayload.reason
            : 'Alert is active.',
        lastTriggeredAt: row.lastTriggeredAt ?? null,
      })),
      externalEngagement,
      syntheticMonitor: {
        monitorKey: 'synthetic_signup',
        status:
          syntheticRun[0]?.status === 'skipped'
            ? 'idle'
            : (syntheticRun[0]?.status ?? 'idle'),
        lastStartedAt: syntheticRun[0]?.startedAt ?? null,
        lastFinishedAt: syntheticRun[0]?.finishedAt ?? null,
        error: syntheticRun[0]?.error ?? null,
        consecutiveFailures,
      },
      latestPaymentSucceededAt: paymentRows[0]?.occurredAt ?? null,
      latestRetentionMaterializedAt: retentionRows[0]?.occurredAt ?? null,
      dataCollectionStartedAt: startRows[0]?.createdAt ?? null,
      sentryReliabilityNote:
        '10-minute production error-rate alerting is managed in Sentry.',
      errors,
    };
  } catch (error) {
    captureError('Error loading admin product funnel dashboard', error);
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return buildEmptyDashboard(timeRange, errors);
  }
}
