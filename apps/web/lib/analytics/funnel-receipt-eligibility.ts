import {
  EVIDENCE_RECEIPT_CONTRACT_VERSION,
  type MetricReceipt,
} from './evidence-receipt';
import { CANONICAL_METRICS, computeRatePercent } from './metrics';

/** Consumer policy over existing receipts, not a new metric or evidence store. */
export interface FunnelReceiptStage {
  readonly receipt: MetricReceipt | null;
  readonly access: 'internal' | 'customer';
  readonly sourceState: 'available' | 'missing' | 'failed';
  /** Opaque, source-owned cohort and population identities; never personal data. */
  readonly cohort: string;
  readonly population: string;
}

export interface FunnelReceiptPolicy {
  readonly audience: 'internal' | 'customer';
  readonly profileId: string;
  readonly now: Date;
  readonly maxAgeMs: number;
  readonly minimumDenominator: number;
}

export type FunnelEvidenceReason =
  | 'scope_mismatch'
  | 'missing'
  | 'failed'
  | 'unavailable'
  | 'partial_data'
  | 'insufficient_sample'
  | 'invalid_receipt'
  | 'invalid_count'
  | 'invalid_freshness'
  | 'stale'
  | 'incompatible'
  | 'population_not_nested'
  | 'empty_denominator';

export type FunnelRateEligibility =
  | { readonly eligible: false; readonly reason: FunnelEvidenceReason }
  | {
      readonly eligible: true;
      readonly percent: number;
      readonly availability: 'measured' | 'measured_zero';
      /** Descriptive evidence can support investigation, never establish causality. */
      readonly actionability: 'investigate';
    };

function instant(value: string): number {
  // Date.parse accepts normalized impossible dates and timezone-free strings.
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? parsed
    : Number.NaN;
}

function stageReason(
  stage: FunnelReceiptStage,
  policy: FunnelReceiptPolicy
): FunnelEvidenceReason | null {
  // Check scope before returning any source state or value to a customer.
  if (
    !policy.profileId ||
    !['internal', 'customer'].includes(policy.audience) ||
    !['internal', 'customer'].includes(stage.access) ||
    (policy.audience === 'customer' && stage.access !== 'customer') ||
    (stage.receipt && stage.receipt.scope.profileId !== policy.profileId)
  )
    return 'scope_mismatch';
  if (stage.sourceState === 'failed') return 'failed';
  if (stage.sourceState === 'missing' || !stage.receipt) return 'missing';
  if (stage.sourceState !== 'available') return 'invalid_receipt';
  const receipt = stage.receipt;
  const definition = CANONICAL_METRICS[receipt.metric];
  if (
    !definition ||
    definition.valueType !== 'count' ||
    receipt.contract_version !== EVIDENCE_RECEIPT_CONTRACT_VERSION ||
    receipt.definition_version !== definition.version ||
    receipt.unit !== definition.unit ||
    receipt.source !== definition.source ||
    !stage.cohort.trim() ||
    !stage.population.trim()
  )
    return 'invalid_receipt';
  if (receipt.availability === 'unavailable') return 'unavailable';
  if (receipt.availability === 'partial_data') return 'partial_data';
  if (receipt.availability === 'not_yet_mature') return 'insufficient_sample';
  if (
    !Number.isSafeInteger(receipt.value) ||
    receipt.value < 0 ||
    receipt.availability !==
      (receipt.value === 0 ? 'measured_zero' : 'measured')
  )
    return 'invalid_count';
  if (receipt.limitations.some(code => code !== 'source_grain_daily')) {
    return 'unavailable';
  }
  const now = policy.now.getTime();
  const asOf = instant(receipt.as_of);
  const computed = instant(receipt.computed_at);
  const end = instant(receipt.window.end);
  const start =
    receipt.window.start === null ? null : instant(receipt.window.start);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(policy.maxAgeMs) ||
    policy.maxAgeMs < 0 ||
    !Number.isFinite(asOf) ||
    !Number.isFinite(computed) ||
    !Number.isFinite(end) ||
    asOf > computed ||
    computed > now ||
    end > computed ||
    (start !== null && (!Number.isFinite(start) || start >= end)) ||
    (start === null
      ? receipt.window.hours !== null
      : receipt.window.hours !== Math.round((end - start) / 3_600_000))
  )
    return 'invalid_freshness';
  if (now - asOf > policy.maxAgeMs || now - computed > policy.maxAgeMs)
    return 'stale';
  return null;
}

/**
 * Descriptive conversion only. The authorized producer must supply a source-bound
 * nesting receipt; matching counts or labels alone cannot establish membership.
 * This is not an authorization boundary: callers still enforce server access.
 * Original MetricReceipts retain all provenance and must accompany any display.
 */
export function assessFunnelRate(
  denominator: FunnelReceiptStage,
  numerator: FunnelReceiptStage,
  nesting: {
    readonly parentPopulation: string;
    readonly childPopulation: string;
    readonly cohort: string;
    readonly evidenceRef: string;
    readonly window: MetricReceipt['window'];
    readonly asOf: string;
  } | null,
  policy: FunnelReceiptPolicy
): FunnelRateEligibility {
  // Fail scope checks for either side before exposing another side's health.
  const reasons = [
    stageReason(denominator, policy),
    stageReason(numerator, policy),
  ];
  const reason = reasons.includes('scope_mismatch')
    ? 'scope_mismatch'
    : reasons.find(Boolean);
  if (reason) return { eligible: false, reason };
  const before = denominator.receipt!;
  const after = numerator.receipt!;
  if (
    before.unit !== after.unit ||
    before.grain !== after.grain ||
    denominator.cohort !== numerator.cohort ||
    before.window.start !== after.window.start ||
    before.window.end !== after.window.end ||
    before.window.hours !== after.window.hours ||
    before.window.timezone !== after.window.timezone ||
    before.as_of !== after.as_of
  )
    return { eligible: false, reason: 'incompatible' };
  if (
    !nesting?.evidenceRef.trim() ||
    nesting.parentPopulation !== denominator.population ||
    nesting.childPopulation !== numerator.population ||
    nesting.cohort !== denominator.cohort ||
    nesting.window.start !== before.window.start ||
    nesting.window.end !== before.window.end ||
    nesting.asOf !== before.as_of ||
    after.value > before.value
  )
    return { eligible: false, reason: 'population_not_nested' };
  if (before.value === 0)
    return { eligible: false, reason: 'empty_denominator' };
  if (
    !Number.isSafeInteger(policy.minimumDenominator) ||
    policy.minimumDenominator < 1
  ) {
    return { eligible: false, reason: 'invalid_receipt' };
  }
  if (before.value < policy.minimumDenominator)
    return { eligible: false, reason: 'insufficient_sample' };
  return {
    eligible: true,
    percent: computeRatePercent(after.value, before.value),
    availability: after.value === 0 ? 'measured_zero' : 'measured',
    actionability: 'investigate',
  };
}
