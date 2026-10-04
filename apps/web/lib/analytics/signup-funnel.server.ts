import 'server-only';

import { and, sql as drizzleSql, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { trackServerEvent } from '@/lib/server-analytics';
import type { AccountMetricCohort } from '@/lib/utils/email';
import {
  isSignupFunnelStep,
  normalizeSignupFunnelReason,
  SIGNUP_FUNNEL_CONTRACT_VERSION,
  SIGNUP_FUNNEL_IDS,
  SIGNUP_FUNNEL_STEPS,
  type SignupFunnelId,
  type SignupFunnelStepInput,
} from './signup-funnel';

/**
 * Record one signup funnel step in the first-party server analytics store.
 * Never throws: funnel telemetry must not break the product path it measures.
 */
export async function recordFunnelStep<F extends SignupFunnelId>(
  input: SignupFunnelStepInput<F>
): Promise<void> {
  if (!isSignupFunnelStep(input.funnel, input.step)) return;
  try {
    await trackServerEvent('funnel_step', {
      funnel_id: input.funnel,
      step: input.step,
      outcome: input.outcome ?? 'reached',
      surface: input.surface ?? 'server',
      reason:
        input.outcome && input.outcome !== 'reached'
          ? normalizeSignupFunnelReason(input.reason)
          : undefined,
      cohort: input.cohort ?? 'unattributed',
    });
  } catch {
    // trackServerEvent reports its own failures to Sentry.
  }
}

// ---------------------------------------------------------------------------
// Summer aggregate
// ---------------------------------------------------------------------------

export const SUMMER_FUNNEL_CONTRACT_VERSION = 'summer-funnel/v2';

/**
 * A step needs this many events at the previous step before its conversion
 * can be called the bottleneck. Below it, noise dominates.
 */
export const FUNNEL_BOTTLENECK_MIN_SAMPLE = 20;

export type FunnelWindowKey = '24h' | '7d';

export interface FunnelAggregateRow {
  readonly cohort?: AccountMetricCohort | null;
  readonly funnelId: string | null;
  readonly step: string | null;
  readonly outcome: string | null;
  readonly reason: string | null;
  readonly count24h: number;
  readonly count7d: number;
}

export interface FunnelStepReport {
  readonly step: string;
  readonly count: number;
  /** count / previous step count, 0..1+ rounded to 4dp. Null on step 1. */
  readonly conversionFromPrevious: number | null;
  readonly errors: number;
  readonly dropped: number;
  readonly topReasons: ReadonlyArray<{
    readonly reason: string;
    readonly count: number;
  }>;
}

export interface FunnelReport {
  readonly funnelId: SignupFunnelId;
  readonly steps: readonly FunnelStepReport[];
  /** Last step count / first step count. Null when step 1 has no events. */
  readonly overallConversion: number | null;
  readonly bottleneck:
    | {
        readonly step: string;
        readonly previousStep: string;
        readonly conversionFromPrevious: number;
      }
    | {
        readonly step: null;
        readonly reason: 'no_data' | 'insufficient_sample';
      };
}

export interface FunnelWindowReport {
  readonly window: FunnelWindowKey;
  readonly since: string;
  readonly funnels: readonly FunnelReport[];
}

export interface SummerFunnelResponse {
  readonly contractVersion: typeof SUMMER_FUNNEL_CONTRACT_VERSION;
  readonly eventContract: typeof SIGNUP_FUNNEL_CONTRACT_VERSION;
  readonly observedAt: string;
  readonly unit: 'events';
  /** Customer-only view used for business reporting. */
  readonly metricScope: 'customer_only';
  readonly windows: Readonly<Record<FunnelWindowKey, FunnelWindowReport>>;
  /** All events, including historical events without a cohort tag. */
  readonly rawWindows: Readonly<Record<FunnelWindowKey, FunnelWindowReport>>;
  /** Operational dogfood/QA events, kept outside customer metrics. */
  readonly syntheticHealth: Readonly<{
    windows: Readonly<Record<FunnelWindowKey, FunnelWindowReport>>;
  }>;
  /** Events that cannot safely be classified as customer or synthetic. */
  readonly unattributed: Readonly<{
    windows: Readonly<Record<FunnelWindowKey, FunnelWindowReport>>;
  }>;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 10_000
    : null;

function buildFunnelReport(
  funnelId: SignupFunnelId,
  rows: readonly FunnelAggregateRow[],
  pick: (row: FunnelAggregateRow) => number
): FunnelReport {
  const funnelRows = rows.filter(row => row.funnelId === funnelId);
  const steps = SIGNUP_FUNNEL_STEPS[funnelId].map(
    (step, index, allSteps): FunnelStepReport & { previous: number | null } => {
      const stepRows = funnelRows.filter(row => row.step === step);
      const sum = (outcome: string) =>
        stepRows
          .filter(row => (row.outcome ?? 'reached') === outcome)
          .reduce((total, row) => total + pick(row), 0);
      const count = sum('reached');
      const reasons = new Map<string, number>();
      for (const row of stepRows) {
        if ((row.outcome ?? 'reached') === 'reached' || !row.reason) continue;
        reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + pick(row));
      }
      const previousStep = index > 0 ? allSteps[index - 1] : null;
      const previous =
        previousStep === null
          ? null
          : funnelRows
              .filter(
                row =>
                  row.step === previousStep &&
                  (row.outcome ?? 'reached') === 'reached'
              )
              .reduce((total, row) => total + pick(row), 0);
      return {
        step,
        count,
        previous,
        conversionFromPrevious:
          previous === null ? null : ratio(count, previous),
        errors: sum('error'),
        dropped: sum('dropped'),
        topReasons: [...reasons.entries()]
          .filter(([, reasonCount]) => reasonCount > 0)
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([reason, reasonCount]) => ({ reason, count: reasonCount })),
      };
    }
  );

  const first = steps[0]?.count ?? 0;
  const last = steps.at(-1)?.count ?? 0;
  const candidates = steps.filter(
    step =>
      step.previous !== null &&
      step.previous >= FUNNEL_BOTTLENECK_MIN_SAMPLE &&
      step.conversionFromPrevious !== null
  );
  const worst = candidates.reduce<(typeof steps)[number] | null>(
    (lowest, step) =>
      lowest === null ||
      (step.conversionFromPrevious ?? 1) < (lowest.conversionFromPrevious ?? 1)
        ? step
        : lowest,
    null
  );
  const worstIndex = worst ? steps.indexOf(worst) : -1;

  return {
    funnelId,
    steps: steps.map(({ previous: _previous, ...step }) => step),
    overallConversion: ratio(last, first),
    bottleneck:
      worst && worstIndex > 0 && worst.conversionFromPrevious !== null
        ? {
            step: worst.step,
            previousStep: steps[worstIndex - 1].step,
            conversionFromPrevious: worst.conversionFromPrevious,
          }
        : {
            step: null,
            reason: funnelRows.length === 0 ? 'no_data' : 'insufficient_sample',
          },
  };
}

/** Pure: turn grouped rows into the Summer response. Exported for tests. */
export function buildSummerFunnelResponse(
  rows: readonly FunnelAggregateRow[],
  now: Date
): SummerFunnelResponse {
  const buildWindows = (
    selectedRows: readonly FunnelAggregateRow[]
  ): Readonly<Record<FunnelWindowKey, FunnelWindowReport>> => {
    const buildWindow = (
      window: FunnelWindowKey,
      hours: number,
      pick: (row: FunnelAggregateRow) => number
    ): FunnelWindowReport => ({
      window,
      since: new Date(now.getTime() - hours * 3_600_000).toISOString(),
      funnels: SIGNUP_FUNNEL_IDS.map(funnelId =>
        buildFunnelReport(funnelId, selectedRows, pick)
      ),
    });
    return {
      '24h': buildWindow('24h', 24, row => row.count24h),
      '7d': buildWindow('7d', 24 * 7, row => row.count7d),
    };
  };
  const rowsFor = (cohort: AccountMetricCohort) =>
    rows.filter(row => (row.cohort ?? 'unattributed') === cohort);
  const windows = buildWindows(rowsFor('customer'));

  return {
    contractVersion: SUMMER_FUNNEL_CONTRACT_VERSION,
    eventContract: SIGNUP_FUNNEL_CONTRACT_VERSION,
    observedAt: now.toISOString(),
    unit: 'events',
    metricScope: 'customer_only',
    windows,
    rawWindows: buildWindows(rows),
    syntheticHealth: { windows: buildWindows(rowsFor('synthetic')) },
    unattributed: { windows: buildWindows(rowsFor('unattributed')) },
  };
}

/** One grouped scan over the 7d window; 24h is a filtered count of it. */
export async function getSummerFunnel(
  now = new Date()
): Promise<SummerFunnelResponse> {
  const since7d = new Date(now.getTime() - 7 * 24 * 3_600_000);
  const since24h = new Date(now.getTime() - 24 * 3_600_000);
  const props = serverAnalyticsEvents.properties;
  const funnelId = drizzleSql<string | null>`${props}->>'funnel_id'`;
  const step = drizzleSql<string | null>`${props}->>'step'`;
  const outcome = drizzleSql<string | null>`${props}->>'outcome'`;
  const reason = drizzleSql<string | null>`${props}->>'reason'`;
  const cohort = drizzleSql<AccountMetricCohort | null>`${props}->>'cohort'`;

  const rows = await db
    .select({
      funnelId,
      step,
      outcome,
      reason,
      cohort,
      count24h: drizzleSql<number>`(count(*) filter (where ${serverAnalyticsEvents.occurredAt} >= ${since24h}))::int`,
      count7d: drizzleSql<number>`count(*)::int`,
    })
    .from(serverAnalyticsEvents)
    .where(
      and(
        eq(serverAnalyticsEvents.eventName, 'funnel_step'),
        gte(serverAnalyticsEvents.occurredAt, since7d)
      )
    )
    .groupBy(funnelId, step, outcome, reason, cohort);

  return buildSummerFunnelResponse(
    rows.map(row => ({
      ...row,
      count24h: Number(row.count24h) || 0,
      count7d: Number(row.count7d) || 0,
    })),
    now
  );
}
