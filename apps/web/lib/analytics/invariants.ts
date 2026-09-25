/**
 * Analytics invariant engine (JOV-3587) — grain-correct funnel and sanity
 * invariants, encoded once and enforced in two places:
 *
 * (a) deterministic CI tests over fixtures (`tests/unit/analytics-invariants.test.ts`),
 * (b) runtime guards that flag a contradiction even when every value is
 *     non-zero (bad-but-plausible data), degrading the UI to a safe state.
 *
 * Governing rules (corrected 2026-09-24, superseding the earlier universal
 * "profile views >= total clicks" rule):
 *
 * - Total click events may exceed profile views. Repeated clicks,
 *   direct-link entry and incomplete view ingestion are valid. No invariant
 *   may fabricate or clamp a source fact to satisfy an invalid inequality.
 * - Unique counts are bounded by their corresponding total only when both
 *   are measured from the same event population. Lifetime/rolling and
 *   ranged visitor, subscriber and capture counts are not ordered against
 *   each other.
 * - Channel counts are bounded by their parent count only for the same
 *   filters and window; summing channels requires an explicit partition
 *   declaration.
 * - Count metrics are finite and nonnegative. Financial adjustments may be
 *   negative. Known zero, unknown, partial and unavailable are distinct
 *   typed states — missing data must never become zero.
 * - Range monotonicity applies only to additive counts from the same
 *   snapshot, filters and nested windows. Rates, refunds, rolling values
 *   and distinct counts from incompatible identities are not compared.
 * - Duplicate deliveries are idempotent upstream; attribution allocation
 *   cannot overcredit a shared source event. Model-derived proxy money and
 *   observational attribution are not verified receipts or causal lift —
 *   the engine never treats them as either.
 *
 * Every invariant names its metric definitions, grain, preconditions and
 * applicable population through the declarations the caller passes in; a
 * comparison the caller has not declared comparable produces a
 * non-comparable finding, never a violation and never a coerced value.
 *
 * This module is intentionally free of raw analytics-table references and
 * ad-hoc rate derivations (see the canonical metrics layer guard) — it
 * reasons over readings and grains only.
 */

/** Typed value states. Missing data never becomes zero. */
export type MetricReading =
  | { readonly state: 'known-zero' }
  | {
      readonly state: 'measured';
      readonly value: number;
      /** Financial adjustments (refunds, corrections) may be negative. */
      readonly allowsNegative?: boolean;
    }
  | {
      /** Incomplete source coverage — the value is a lower bound, not a fact. */
      readonly state: 'partial';
      readonly value: number;
    }
  | { readonly state: 'unavailable' }
  | { readonly state: 'unreported' };

/** Which source population a metric is measured over. */
export type MetricPopulation =
  | 'profile-views'
  | 'audience-identities'
  | 'link-clicks'
  | 'subscriptions'
  | 'derived';

/** How identity is counted: raw events or deduplicated people. */
export type IdentityBasis = 'event' | 'distinct-identity';

/** Window semantics of the source query. */
export type WindowBasis = 'ranged' | 'rolling-to-date';

export type SourceCoverage = 'complete' | 'partial' | 'unknown';

export interface MetricGrain {
  readonly population: MetricPopulation;
  readonly identityBasis: IdentityBasis;
  readonly windowBasis: WindowBasis;
  readonly coverage: SourceCoverage;
  /**
   * Declared shared identity cohort. Two readings are identity-comparable
   * only when they declare the SAME cohort id (e.g. subscribers and unique
   * visitors resolved onto one deduplicated cohort). Without a cohort, the
   * engine refuses deduplication and conversion ordering.
   */
  readonly cohortId?: string;
  /**
   * True when the metric is additive over time (event counts), so nested
   * windows are monotone. Rates, rolling values, refunds and distinct
   * counts from incompatible identities are not additive.
   */
  readonly additive: boolean;
  /**
   * Value type from the canonical metrics layer. Rate entries are bounded
   * to [0, 100] unconditionally — no declaration required.
   */
  readonly valueType?: 'count' | 'rate';
}

export interface MetricEntry {
  readonly key: string;
  readonly reading: MetricReading;
  readonly grain: MetricGrain;
}

/** One reporting window of readings, all taken from the same snapshot. */
export interface AnalyticsWindowSnapshot {
  readonly windowId: string;
  /**
   * When set, this window's range nests inside the referenced window and
   * both come from the same snapshot with the same filters — the only
   * precondition under which range monotonicity is enforced.
   */
  readonly parentWindowId?: string;
  readonly metrics: readonly MetricEntry[];
}

/** Declared subset relation: child counts a filtered slice of parent's population. */
export interface SubsetRelation {
  readonly parent: string;
  readonly child: string;
}

/** Declared complete partition: the channels fully tile the parent metric. */
export interface ChannelPartition {
  readonly parent: string;
  readonly channels: readonly string[];
}

/**
 * Declared bounded conversion: numerator and denominator are deduplicated
 * conversion/eligible populations with the same identity grain, source
 * coverage and reporting window.
 */
export interface ConversionRateDeclaration {
  readonly rate: string;
  readonly numerator: string;
  readonly denominator: string;
}

export interface AnalyticsInvariantInput {
  readonly windows: readonly AnalyticsWindowSnapshot[];
  readonly subsetRelations?: readonly SubsetRelation[];
  readonly channelPartitions?: readonly ChannelPartition[];
  readonly conversionRates?: readonly ConversionRateDeclaration[];
}

export type InvariantId =
  | 'count-finite-nonnegative'
  | 'subset-within-parent'
  | 'dedup-within-total'
  | 'conversion-rate-bounded'
  | 'channel-partition-bounded'
  | 'range-monotonicity'
  | 'attribution-allocation-bounded';

export type FindingKind = 'violation' | 'non-comparable';

export interface InvariantFinding {
  readonly invariant: InvariantId;
  readonly kind: FindingKind;
  readonly message: string;
  readonly metricKeys: readonly string[];
  readonly windowId?: string;
  /** Offending observed values (original facts — never clamped). */
  readonly observed?: Readonly<Record<string, unknown>>;
}

export interface AnalyticsInvariantResult {
  /** True only when there are zero violations. Non-comparable is not a violation. */
  readonly ok: boolean;
  readonly violations: readonly InvariantFinding[];
  readonly nonComparable: readonly InvariantFinding[];
}

/** Error thrown by `assertAnalyticsInvariants` when a violation exists. */
export class AnalyticsInvariantError extends Error {
  readonly violations: readonly InvariantFinding[];

  constructor(violations: readonly InvariantFinding[]) {
    super(
      `analytics invariant violation (${violations.length}): ${violations
        .map(formatInvariantFinding)
        .join(' | ')}`
    );
    this.name = 'AnalyticsInvariantError';
    this.violations = violations;
  }
}

type NumericReading = Extract<
  MetricReading,
  { state: 'measured' } | { state: 'partial' }
>;

function asNumeric(reading: MetricReading | undefined): NumericReading | null {
  if (!reading) return null;
  if (reading.state === 'measured' || reading.state === 'partial') {
    return reading;
  }
  return null;
}

/**
 * Grains are comparable when they measure the same population over the
 * same window semantics with compatible coverage. Identity-level ordering
 * (dedup totals, conversion bounds) additionally requires the SAME
 * declared cohort.
 */
function grainsOrderable(a: MetricGrain, b: MetricGrain): boolean {
  return (
    a.population === b.population &&
    a.windowBasis === b.windowBasis &&
    a.coverage !== 'unknown' &&
    b.coverage !== 'unknown'
  );
}

function grainsIdentityComparable(a: MetricGrain, b: MetricGrain): boolean {
  return (
    grainsOrderable(a, b) &&
    a.identityBasis === b.identityBasis &&
    a.cohortId !== undefined &&
    a.cohortId === b.cohortId
  );
}

function indexWindow(
  window: AnalyticsWindowSnapshot
): Map<string, MetricEntry> {
  return new Map(window.metrics.map(entry => [entry.key, entry]));
}

/**
 * Evaluate all declared invariants over the snapshot. Deterministic and
 * pure — safe to call in CI tests and at runtime. Never mutates, clamps or
 * fabricates values; contradictions are reported with the original facts.
 */
export function findAnalyticsInvariantViolations(
  input: AnalyticsInvariantInput
): AnalyticsInvariantResult {
  const violations: InvariantFinding[] = [];
  const nonComparable: InvariantFinding[] = [];

  for (const window of input.windows) {
    const byKey = indexWindow(window);

    // Invariant: count metrics are finite and nonnegative (financial
    // adjustments excepted); rate metrics are bounded to [0, 100]
    // unconditionally. Applies to measured AND partial values.
    for (const entry of window.metrics) {
      const numeric = asNumeric(entry.reading);
      if (!numeric) continue;
      const { value } = numeric;
      if (!Number.isFinite(value)) {
        violations.push({
          invariant: 'count-finite-nonnegative',
          kind: 'violation',
          message: `metric ${entry.key} is not finite`,
          metricKeys: [entry.key],
          windowId: window.windowId,
          observed: { value: String(value) },
        });
      } else if (value < 0 && !numeric.allowsNegative) {
        violations.push({
          invariant: 'count-finite-nonnegative',
          kind: 'violation',
          message: `metric ${entry.key} is negative without a financial-adjustment declaration`,
          metricKeys: [entry.key],
          windowId: window.windowId,
          observed: { value },
        });
      } else if (
        entry.grain.valueType === 'rate' &&
        (value < 0 || value > 100)
      ) {
        violations.push({
          invariant: 'conversion-rate-bounded',
          kind: 'violation',
          message: `rate metric ${entry.key} is outside [0, 100]`,
          metricKeys: [entry.key],
          windowId: window.windowId,
          observed: { value },
        });
      }
    }

    // Invariant: a declared subset child stays within its parent when both
    // are numeric and measured over the same population, window and
    // coverage. A grain mismatch is refused, not judged.
    for (const relation of input.subsetRelations ?? []) {
      const parent = byKey.get(relation.parent);
      const child = byKey.get(relation.child);
      const parentValue = asNumeric(parent?.reading);
      const childValue = asNumeric(child?.reading);
      if (!parentValue || !childValue || !parent || !child) continue;

      if (!grainsOrderable(parent.grain, child.grain)) {
        nonComparable.push({
          invariant: 'subset-within-parent',
          kind: 'non-comparable',
          message: `${relation.child} and ${relation.parent} are measured over different grains — not ordered`,
          metricKeys: [relation.child, relation.parent],
          windowId: window.windowId,
          observed: {
            [relation.child]: childValue.value,
            [relation.parent]: parentValue.value,
          },
        });
        continue;
      }
      if (childValue.value > parentValue.value) {
        violations.push({
          invariant: 'subset-within-parent',
          kind: 'violation',
          message: `${relation.child} exceeds its declared parent ${relation.parent} within the same grain`,
          metricKeys: [relation.child, relation.parent],
          windowId: window.windowId,
          observed: {
            [relation.child]: childValue.value,
            [relation.parent]: parentValue.value,
          },
        });
      }
    }

    // Invariant: a declared channel partition sums to at most its parent.
    // A child with missing data is skipped, NOT treated as zero.
    for (const partition of input.channelPartitions ?? []) {
      const parent = byKey.get(partition.parent);
      const parentValue = asNumeric(parent?.reading);
      if (!parentValue || !parent) continue;

      let sum = 0;
      let allComparable = true;
      for (const channelKey of partition.channels) {
        const channel = byKey.get(channelKey);
        const channelValue = asNumeric(channel?.reading);
        if (!channelValue || !channel) {
          continue;
        }
        if (!grainsOrderable(channel.grain, parent.grain)) {
          allComparable = false;
          break;
        }
        sum += channelValue.value;
      }

      if (!allComparable) {
        nonComparable.push({
          invariant: 'channel-partition-bounded',
          kind: 'non-comparable',
          message: `channel partition of ${partition.parent} spans incompatible grains — not summed`,
          metricKeys: [partition.parent, ...partition.channels],
          windowId: window.windowId,
        });
        continue;
      }
      if (sum > parentValue.value) {
        violations.push({
          invariant: 'channel-partition-bounded',
          kind: 'violation',
          message: `declared channel partition of ${partition.parent} sums above the parent`,
          metricKeys: [partition.parent, ...partition.channels],
          windowId: window.windowId,
          observed: {
            [partition.parent]: parentValue.value,
            declaredChannelSum: sum,
          },
        });
      }
    }

    // Invariant: a declared conversion rate is bounded to [0, 100] and its
    // numerator cannot exceed its denominator — only when both populations
    // are deduplicated onto the SAME declared identity cohort with the same
    // coverage and window. Without that cohort the comparison is refused.
    for (const declaration of input.conversionRates ?? []) {
      const rateEntry = byKey.get(declaration.rate);
      const rateValue = asNumeric(rateEntry?.reading);
      const numerator = byKey.get(declaration.numerator);
      const denominator = byKey.get(declaration.denominator);

      if (rateValue) {
        const { value } = rateValue;
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          violations.push({
            invariant: 'conversion-rate-bounded',
            kind: 'violation',
            message: `rate ${declaration.rate} is outside [0, 100]`,
            metricKeys: [declaration.rate],
            windowId: window.windowId,
            observed: { value: String(value) },
          });
        }
      }

      if (!numerator || !denominator) continue;
      const numeratorValue = asNumeric(numerator.reading);
      const denominatorValue = asNumeric(denominator.reading);
      if (!numeratorValue || !denominatorValue) continue;

      if (!grainsIdentityComparable(numerator.grain, denominator.grain)) {
        nonComparable.push({
          invariant: 'conversion-rate-bounded',
          kind: 'non-comparable',
          message: `${declaration.numerator} and ${declaration.denominator} do not share a declared identity cohort — conversion not asserted`,
          metricKeys: [declaration.numerator, declaration.denominator],
          windowId: window.windowId,
          observed: {
            [declaration.numerator]: numeratorValue.value,
            [declaration.denominator]: denominatorValue.value,
          },
        });
        continue;
      }
      if (numeratorValue.value > denominatorValue.value) {
        violations.push({
          invariant: 'conversion-rate-bounded',
          kind: 'violation',
          message: `${declaration.numerator} exceeds ${declaration.denominator} within the same declared identity cohort`,
          metricKeys: [declaration.numerator, declaration.denominator],
          windowId: window.windowId,
          observed: {
            [declaration.numerator]: numeratorValue.value,
            [declaration.denominator]: denominatorValue.value,
          },
        });
      }
    }
  }

  // Invariant: range monotonicity for additive counts from the same
  // snapshot, filters and nested windows. Everything else is refused.
  const byWindowId = new Map(input.windows.map(w => [w.windowId, w]));
  for (const window of input.windows) {
    if (!window.parentWindowId) continue;
    const parentWindow = byWindowId.get(window.parentWindowId);
    if (!parentWindow) continue;
    const parentByKey = indexWindow(parentWindow);
    const childByKey = indexWindow(window);

    for (const [key, child] of childByKey) {
      const parent = parentByKey.get(key);
      const childValue = asNumeric(child.reading);
      const parentValue = asNumeric(parent?.reading);
      if (!parent || !childValue || !parentValue) continue;

      const sameSnapshotAdditive =
        child.grain.additive &&
        parent.grain.additive &&
        child.grain.population === parent.grain.population &&
        child.grain.windowBasis === 'ranged' &&
        parent.grain.windowBasis === 'ranged' &&
        child.grain.coverage !== 'unknown' &&
        parent.grain.coverage !== 'unknown';

      if (!sameSnapshotAdditive) {
        nonComparable.push({
          invariant: 'range-monotonicity',
          kind: 'non-comparable',
          message: `${key} is not an additive ranged count from one snapshot — nested windows not compared`,
          metricKeys: [key],
          windowId: window.windowId,
          observed: {
            inner: childValue.value,
            outer: parentValue.value,
          },
        });
        continue;
      }
      if (childValue.value > parentValue.value) {
        violations.push({
          invariant: 'range-monotonicity',
          kind: 'violation',
          message: `${key} in nested window ${window.windowId} exceeds the same-snapshot outer window ${parentWindow.windowId}`,
          metricKeys: [key],
          windowId: window.windowId,
          observed: {
            inner: childValue.value,
            outer: parentValue.value,
          },
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    nonComparable,
  };
}

/**
 * Shared assertion entry point for tests and runtime. Throws
 * `AnalyticsInvariantError` carrying every violation; non-comparable
 * findings never throw (refusing a comparison is correct behavior, not a
 * data contradiction).
 */
export function assertAnalyticsInvariants(
  input: AnalyticsInvariantInput
): AnalyticsInvariantResult {
  const result = findAnalyticsInvariantViolations(input);
  if (result.violations.length > 0) {
    throw new AnalyticsInvariantError(result.violations);
  }
  return result;
}

/** Stable one-line rendering for structured logs and CI output. */
export function formatInvariantFinding(finding: InvariantFinding): string {
  const observed = finding.observed
    ? ` observed=${JSON.stringify(finding.observed)}`
    : '';
  const window = finding.windowId ? ` window=${finding.windowId}` : '';
  return `[${finding.kind}] ${finding.invariant}${window}: ${finding.message}${observed}`;
}

/** One attribution allocation against a shared source event. */
export interface AttributionAllocation {
  readonly sourceEventId: string;
  /** Verified receipt value of the source event (e.g. cents). */
  readonly sourceValue: number;
  readonly credited: readonly number[];
  /**
   * True when the credited entries are declared to draw exclusively on this
   * source event, so their sum cannot exceed it.
   */
  readonly exclusive: boolean;
}

/**
 * Attribution allocation cannot overcredit a shared source event. Only
 * exclusive allocations over verified receipts are judged; observational or
 * model-derived proxy credit is reported as non-comparable, never treated
 * as a verified receipt.
 */
export function findAttributionOvercredit(
  allocations: readonly AttributionAllocation[]
): InvariantFinding[] {
  const violations: InvariantFinding[] = [];
  for (const allocation of allocations) {
    if (
      !Number.isFinite(allocation.sourceValue) ||
      allocation.sourceValue < 0
    ) {
      violations.push({
        invariant: 'attribution-allocation-bounded',
        kind: 'violation',
        message: `source event ${allocation.sourceEventId} has a non-finite or negative receipt value`,
        metricKeys: ['attribution'],
        observed: { sourceValue: String(allocation.sourceValue) },
      });
      continue;
    }
    if (!allocation.exclusive) {
      // Model-derived proxy money / observational attribution: not a
      // verified receipt, so no bounded assertion is possible.
      continue;
    }
    const creditedSum = allocation.credited.reduce(
      (total, amount) => total + amount,
      0
    );
    if (!Number.isFinite(creditedSum) || creditedSum > allocation.sourceValue) {
      violations.push({
        invariant: 'attribution-allocation-bounded',
        kind: 'violation',
        message: `exclusive attribution overcredits source event ${allocation.sourceEventId}`,
        metricKeys: ['attribution'],
        observed: {
          sourceValue: allocation.sourceValue,
          creditedSum,
        },
      });
    }
  }
  return violations;
}
