/**
 * Runtime bridge between the dashboard analytics API payload and the
 * JOV-3587 invariant engine (`lib/analytics/invariants.ts`).
 *
 * The engine is pure and typed; this module adapts the dashboard payload
 * (numbers or undefined) into declared readings and grains, evaluates the
 * invariants for the loaded range, and turns violations into a bounded
 * structured diagnostic (profile id + range + offending pair — no raw
 * contact PII) plus a UI-safe degraded state. Missing values become
 * `unreported` readings, never zeros; `capture_rate` is undefined in the
 * payload when there is no denominator, so it maps to `unreported` too.
 *
 * Deliberately kept out of `metric-definitions.ts` display guards so the
 * engine can be wired without colliding with PR #16937's in-flight
 * component consolidation on the same surface.
 */

import { captureWarning } from '@/lib/error-tracking';
import {
  type AnalyticsInvariantInput,
  type AnalyticsInvariantResult,
  type AnalyticsWindowSnapshot,
  type ChannelPartition,
  type ConversionRateDeclaration,
  type MetricEntry,
  type MetricReading,
  findAnalyticsInvariantViolations,
  formatInvariantFinding,
} from './invariants';

/** Dashboard payload shape consumed by the invariant check. */
export interface DashboardAnalyticsMetricsPayload {
  readonly profile_views?: number;
  readonly unique_users?: number;
  readonly subscribers?: number;
  readonly listen_clicks?: number;
  readonly total_clicks?: number;
  readonly identified_users?: number;
  readonly capture_rate?: number;
  readonly tip_link_visits?: number;
}

/** Identity context for the structured diagnostic (no raw contact PII). */
export interface AnalyticsRuntimeContext {
  readonly profileId: string;
  readonly range: string;
}

const COUNT_ADDITIVE = true;
const RATE_NOT_ADDITIVE = false;

function countGrain(coverage: 'complete' | 'unknown'): MetricEntry['grain'] {
  return {
    population: 'link-clicks',
    identityBasis: 'event',
    windowBasis: 'ranged',
    coverage,
    additive: COUNT_ADDITIVE,
  };
}

function audienceGrain(cohortId: string): MetricEntry['grain'] {
  return {
    population: 'audience-identities',
    identityBasis: 'distinct-identity',
    windowBasis: 'ranged',
    coverage: 'complete',
    cohortId,
    additive: RATE_NOT_ADDITIVE,
  };
}

/**
 * Map a payload number into a reading. `undefined` (field absent from the
 * API response) maps to `unreported` — never to zero.
 */
function readingFromValue(value: number | undefined): MetricReading {
  if (value === undefined || value === null) {
    return { state: 'unreported' };
  }
  return { state: 'measured', value };
}

/**
 * Evaluate the grain-correct invariants over one loaded dashboard window.
 *
 * Returns `null` when the data is consistent (the common case). Returns a
 * degraded-state descriptor when the values contradict the declared
 * invariants — the caller hides the offending metrics and shows a safe
 * state instead of the contradiction.
 */
export function evaluateDashboardAnalyticsInvariants(
  metrics: DashboardAnalyticsMetricsPayload,
  context: AnalyticsRuntimeContext
): AnalyticsInvariantResult | null {
  const hasAnyValue = Object.values(metrics).some(
    value => value !== undefined && value !== null
  );
  if (!hasAnyValue) return null;

  const entries: MetricEntry[] = [
    {
      key: 'profile_views',
      reading: readingFromValue(metrics.profile_views),
      // Total page visits including repeats: additive event count over the
      // ranged window, one coverage basis shared with the click stream.
      grain: {
        ...countGrain(metrics.total_clicks === undefined ? 'unknown' : 'complete'),
        population: 'profile-views',
      },
    },
    {
      key: 'total_clicks',
      reading: readingFromValue(metrics.total_clicks),
      grain: countGrain(metrics.total_clicks === undefined ? 'unknown' : 'complete'),
    },
    {
      key: 'listen_clicks',
      reading: readingFromValue(metrics.listen_clicks),
      grain: countGrain(metrics.listen_clicks === undefined ? 'unknown' : 'complete'),
    },
    {
      key: 'tip_link_visits',
      reading: readingFromValue(metrics.tip_link_visits),
      grain: countGrain(metrics.tip_link_visits === undefined ? 'unknown' : 'complete'),
    },
    {
      key: 'unique_users',
      reading: readingFromValue(metrics.unique_users),
      // Deduplicated people counted in the same range. Cohort joins the
      // subscriber conversion population below — same identity grain,
      // same coverage, same window.
      grain: audienceGrain('profile-visitors'),
    },
    {
      key: 'identified_users',
      reading: readingFromValue(metrics.identified_users),
      grain: audienceGrain('profile-visitors'),
    },
    {
      key: 'subscribers',
      reading: readingFromValue(metrics.subscribers),
      grain: audienceGrain('profile-visitors'),
    },
    {
      key: 'capture_rate',
      reading: readingFromValue(metrics.capture_rate),
      grain: {
        population: 'derived',
        identityBasis: 'distinct-identity',
        windowBasis: 'ranged',
        coverage: 'complete',
        additive: RATE_NOT_ADDITIVE,
        valueType: 'rate',
      },
    },
  ];

  const subsetRelations: AnalyticsInvariantInput['subsetRelations'] = [
    // Listen clicks are a filtered slice of total link clicks (same
    // click_events population, same is_bot filter, same range).
    { parent: 'total_clicks', child: 'listen_clicks' },
    // Tip visits are also a click_events slice.
    { parent: 'total_clicks', child: 'tip_link_visits' },
  ];

  const conversionRates: ConversionRateDeclaration[] = [
    {
      rate: 'capture_rate',
      numerator: 'subscribers',
      denominator: 'unique_users',
    },
  ];

  const windows: AnalyticsWindowSnapshot[] = [
    { windowId: `dashboard:${context.range}`, metrics: entries },
  ];

  const channelPartitions: ChannelPartition[] = [];

  return findAnalyticsInvariantViolations({
    windows,
    subsetRelations,
    channelPartitions,
    conversionRates,
  });
}

/**
 * Report a runtime contradiction as a bounded structured warning. Preserves
 * the original observed facts, exposes profile id + range + offending
 * invariants, and never includes raw contact PII (profile id is the
 * internal identifier; no emails, phones or handles).
 */
export async function reportAnalyticsRuntimeViolation(
  result: AnalyticsInvariantResult,
  context: AnalyticsRuntimeContext
): Promise<void> {
  const lines = result.violations.map(formatInvariantFinding);
  await captureWarning(
    '[analytics-invariants] contradiction detected',
    undefined,
    {
      profileId: context.profileId,
      range: context.range,
      invariants: result.violations.map(v => v.invariant),
      findings: lines,
    }
  );
}
