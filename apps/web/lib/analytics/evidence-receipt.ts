/**
 * Versioned analytics evidence receipts (JOV-6582).
 *
 * A receipt is the bounded evidence contract that wraps an analytics result:
 * which metric definition produced it (by version), over what resolved
 * window, from which source, with what freshness and completeness, and what
 * the value is allowed to claim (a measured zero vs. partial data vs.
 * unavailable data vs. a not-yet-mature measurement).
 *
 * Consumers (dashboard, agents) read the receipt instead of re-deriving
 * formulas or windows locally. The existing `DashboardAnalyticsResponse`
 * shape is unchanged — receipts ride alongside it under `evidence`, so
 * legacy consumers keep working (backward compatibility by adapter, not by
 * editing the old fields).
 *
 * Building blocks reused, none replaced:
 * - Metric identity/version: `CANONICAL_METRICS` + `METRICS_CONTRACT_VERSION`
 *   in `lib/analytics/metrics.ts` (JOV-3586 foundation).
 * - Window semantics: `resolveRangeStart` in `lib/analytics/time-range.ts`
 *   (JOV-3588 foundation) — one rolling N×24h window and one as-of per
 *   request, inclusive lower bound / exclusive upper bound (the query time),
 *   elapsed-time semantics. No calendar grouping is offered by this layer,
 *   so no timezone-dependent bucketing exists; the request timezone is
 *   recorded verbatim in the receipt for consumers that display times.
 * - Source grain: the views source is date-bucketed; the receipt's
 *   `limitation` field says so rather than implying intraday precision.
 */

import {
  CANONICAL_METRICS,
  type CanonicalMetricKey,
  computeCaptureRate,
  computeCtr,
} from '@/lib/analytics/metrics';
import {
  ANALYTICS_EPOCH,
  type ResolvedWindow,
} from '@/lib/analytics/time-range';

/** Bump when a metric's definition changes meaning (not its label). */
export const EVIDENCE_RECEIPT_CONTRACT_VERSION =
  'analytics.evidence-receipt/v1' as const;

/** How a metric value's availability should be interpreted. */
export type EvidenceAvailability =
  /**
   * The source was queried, the measurement ran to completion, and the value
   * is trustworthy (nonzero or a genuinely measured zero — see
   * {@link measuredAvailability}).
   */
  | 'measured'
  /**
   * The source was queried, the measurement ran to completion, and the true
   * value is zero. This zero is trustworthy — distinct from `unavailable`.
   */
  | 'measured_zero'
  /** The source was queried but only part of the expected data is present (e.g. partial ingestion). */
  | 'partial_data'
  /** The measurement has not had enough time/data to be meaningful yet. */
  | 'not_yet_mature'
  /** The source is missing or unusable, so no value can be claimed. */
  | 'unavailable';

/**
 * Availability for a successfully measured count: a zero stays a
 * **measured zero** (trustworthy), anything else is `measured`.
 */
export function measuredAvailability(value: number): EvidenceAvailability {
  return value === 0 ? 'measured_zero' : 'measured';
}

/** Why a receipt's availability is degraded (absent for clean measurements). */
export type EvidenceLimitationCode =
  | 'source_table_missing'
  | 'source_grain_daily'
  | 'partial_source'
  | 'unknown_denominator'
  | 'not_mature';

export interface MetricReceipt {
  /** Receipt contract version (the shape of this object). */
  readonly contract_version: typeof EVIDENCE_RECEIPT_CONTRACT_VERSION;
  /** Canonical metric key. */
  readonly metric: CanonicalMetricKey;
  /** Version of the metric's definition (identity + formula + source). */
  readonly definition_version: string;
  /** Human-readable definition, verbatim from the canonical layer. */
  readonly definition: string;
  /** Unit from the canonical layer. */
  readonly unit: string;
  /** Aggregation grain the source natively supports. */
  readonly grain: 'event' | 'daily_bucket' | 'member_snapshot';
  /** Tenant/profile scope the value was computed for. */
  readonly scope: { readonly profileId: string };
  /** Resolved reporting window. `start` null means unbounded ('all'). */
  readonly window: {
    /** Inclusive lower bound, or null for the unbounded 'all' range. */
    readonly start: string | null;
    /** Exclusive upper bound (the query's as-of instant). */
    readonly end: string;
    /** Rolling elapsed-hours length, or null for unbounded. */
    readonly hours: number | null;
    /** IANA timezone requested for display; this layer never groups by calendar day. */
    readonly timezone: string;
  };
  /** Where the value came from. */
  readonly source: string;
  /** Newest data instant the source had seen when the value was computed. */
  readonly as_of: string;
  /** Epoch ms the receipt was computed; cached receipts keep their compute time. */
  readonly computed_at: string;
  /** True when the response came from a cache older than the current source watermark. */
  readonly from_cache: boolean;
  readonly value: number;
  /** Numerator/denominator for derived rates, when both are measured. */
  readonly numerator?: number;
  readonly denominator?: number;
  readonly availability: EvidenceAvailability;
  /** Machine-readable limitation codes; empty for a clean measurement. */
  readonly limitations: readonly EvidenceLimitationCode[];
  /** Human-readable explanation of limitations (dashboards/agents may show verbatim). */
  readonly limitation_detail: string;
}

/** A collection of metric receipts sharing one resolved window. */
export interface EvidenceReceiptSet {
  readonly contract_version: typeof EVIDENCE_RECEIPT_CONTRACT_VERSION;
  /** One resolved window and as-of per request — never per-metric. */
  readonly window: MetricReceipt['window'];
  readonly as_of: string;
  readonly computed_at: string;
  readonly from_cache: boolean;
  readonly metrics: readonly MetricReceipt[];
}

export interface MetricReceiptInput {
  readonly metric: CanonicalMetricKey;
  readonly value: number;
  readonly grain: MetricReceipt['grain'];
  readonly availability: EvidenceAvailability;
  readonly limitations?: readonly EvidenceLimitationCode[];
  readonly limitationDetail?: string;
  readonly numerator?: number;
  readonly denominator?: number;
}

export interface EvidenceReceiptContext {
  readonly profileId: string;
  readonly rangeEnd: Date;
  /** IANA timezone requested for display (no calendar grouping is performed). */
  readonly timezone?: string;
  /** Newest data instant the source had seen (defaults to rangeEnd). */
  readonly sourceWatermark?: Date;
  /** Set when the served value came from a cache entry. */
  readonly fromCache?: boolean;
  /** Epoch ms the underlying data was computed (defaults to now). */
  readonly computedAt?: Date;
  /**
   * The already-resolved inclusive lower bound for the range — the SAME
   * value the query used. Receipts never re-resolve windows independently
   * of the query that produced the value. Null = unbounded ('all');
   * undefined = fall back to the epoch sentinel.
   */
  readonly resolvedRangeStart?: Date | null;
}

/**
 * Resolve the single reporting window for a request. All receipts in one
 * response share this window — consumers can compare metrics without
 * reconciling boundaries.
 *
 * Boundaries: `start` is INCLUSIVE (rows at the boundary instant count),
 * `end` is the query's as-of instant. Lengths are elapsed hours (24h days),
 * never calendar days, matching the rolling-window rule in time-range.ts.
 */
export function resolveEvidenceWindow(
  rangeEnd: Date,
  rangeStart: Date | null,
  timezone = 'UTC'
): ResolvedWindow {
  return {
    start: rangeStart ? rangeStart.toISOString() : null,
    end: rangeEnd.toISOString(),
    hours:
      rangeStart === null
        ? null
        : Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 3_600_000),
    timezone,
  };
}

/**
 * Build one metric receipt. The metric identity (definition, source, unit)
 * always comes from the canonical layer — never re-specified at call sites.
 */
export function buildMetricReceipt(
  input: MetricReceiptInput,
  context: EvidenceReceiptContext,
  window: ResolvedWindow
): MetricReceipt {
  const definition = CANONICAL_METRICS[input.metric];
  const limitations = [...(input.limitations ?? [])];

  return {
    contract_version: EVIDENCE_RECEIPT_CONTRACT_VERSION,
    metric: input.metric,
    definition_version: definition.version,
    definition: definition.definition,
    unit: definition.unit,
    grain: input.grain,
    scope: { profileId: context.profileId },
    window,
    source: definition.source,
    as_of: (context.sourceWatermark ?? context.rangeEnd).toISOString(),
    computed_at: (context.computedAt ?? new Date()).toISOString(),
    from_cache: context.fromCache ?? false,
    value: input.value,
    ...(input.numerator !== undefined && { numerator: input.numerator }),
    ...(input.denominator !== undefined && { denominator: input.denominator }),
    availability: input.availability,
    limitations,
    limitation_detail: input.limitationDetail ?? '',
  };
}

/** Assemble the per-request receipt set with the shared window. */
export function buildEvidenceReceiptSet(
  metrics: readonly MetricReceipt[],
  context: EvidenceReceiptContext
): EvidenceReceiptSet {
  return {
    contract_version: EVIDENCE_RECEIPT_CONTRACT_VERSION,
    window: resolveEvidenceWindow(
      context.rangeEnd,
      resolveRangeStartFor(context),
      context.timezone
    ),
    as_of: (context.sourceWatermark ?? context.rangeEnd).toISOString(),
    computed_at: (context.computedAt ?? new Date()).toISOString(),
    from_cache: context.fromCache ?? false,
    metrics,
  };
}

function resolveRangeStartFor(context: EvidenceReceiptContext): Date | null {
  // Return exactly what the caller's query used: null stays null
  // (unbounded 'all'), undefined falls back to the epoch sentinel.
  return context.resolvedRangeStart ?? ANALYTICS_EPOCH;
}

/**
 * Derived-rate guard: a rate receipt may only be certified when BOTH sides
 * of the fraction were measured. Unknown denominators never produce a
 * certified rate — the receipt is emitted as `unavailable` instead.
 */
export function certifiedRateOrUnavailable(
  metric: Extract<CanonicalMetricKey, 'ctr' | 'capture_rate'>,
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  context: EvidenceReceiptContext,
  window: ResolvedWindow
): MetricReceipt {
  if (
    typeof numerator !== 'number' ||
    typeof denominator !== 'number' ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator)
  ) {
    return buildMetricReceipt(
      {
        metric,
        value: 0,
        grain: 'event',
        availability: 'unavailable',
        limitations: ['unknown_denominator'],
        limitationDetail:
          'Denominator was not measured for this window; no rate is certified.',
      },
      context,
      window
    );
  }

  // Rate derivations MUST go through the canonical helpers — the same rule
  // the metrics-layer guard enforces for ad-hoc percentage math elsewhere.
  const value =
    metric === 'ctr'
      ? computeCtr(numerator, denominator)
      : computeCaptureRate(numerator, denominator);

  return buildMetricReceipt(
    {
      metric,
      value,
      grain: 'event',
      availability: measuredAvailability(value),
      numerator,
      denominator,
    },
    context,
    window
  );
}
