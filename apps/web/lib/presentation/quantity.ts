/**
 * Canonical quantity presentation contract (JOV-7092).
 *
 * Every user-facing numeric control must declare a `QuantityContract`:
 * the semantic domain, display unit, domain-native interaction quantum,
 * display/input precision, valid range, and normalization policy. The
 * quantum and precision are chosen from the domain and user context —
 * never inferred from a storage type (`Double`, decimal columns) or from
 * a mechanically converted source value.
 *
 * Direct entry, +/- steppers, repeat/long-press, sliders/pickers,
 * validation, and rendered precision must all consume the same contract
 * so the interaction contract stays coherent.
 */

export interface QuantityContract {
  /** Semantic quantity/domain, e.g. 'tip-amount', 'track-count'. */
  readonly domain: string;
  /** Display unit. ISO 4217 code for money, otherwise a unit label. */
  readonly unit: string;
  /**
   * Domain-native interaction quantum in display units — the step used by
   * +/- controls, repeat gestures, and picker increments. Not necessarily
   * an integer.
   */
  readonly quantum: number;
  /** Fraction digits allowed for display and direct entry. */
  readonly precision: number;
  /** Inclusive valid range in display units. */
  readonly min?: number;
  readonly max?: number;
  /** Render money with Intl currency style when true. */
  readonly currency?: boolean;
}

/** Round `value` to the contract's display precision. */
export function roundToPrecision(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * Normalize a raw value into the contract: quantize to display precision
 * and clamp to the valid range. Returns null for non-finite input.
 */
export function normalizeQuantity(
  value: number,
  contract: QuantityContract
): number | null {
  if (!Number.isFinite(value)) return null;
  let normalized = roundToPrecision(value, contract.precision);
  if (contract.min !== undefined && normalized < contract.min) {
    normalized = contract.min;
  }
  if (contract.max !== undefined && normalized > contract.max) {
    normalized = contract.max;
  }
  return normalized;
}

/**
 * Step a value by the contract's domain-native quantum and re-normalize.
 * This is the only lawful way +/- controls move a quantity.
 */
export function stepQuantity(
  value: number,
  direction: 1 | -1,
  contract: QuantityContract
): number | null {
  return normalizeQuantity(value + direction * contract.quantum, contract);
}

/**
 * Convert a quantity into a destination contract and re-snap to the
 * destination's **native** quantum. Prevents ugly converted increments
 * (e.g. a 5 lb step becoming a 2.26796 kg step).
 */
export function convertQuantity(
  value: number,
  rate: number,
  destination: QuantityContract
): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  const converted = value * rate;
  const snapped =
    Math.round(converted / destination.quantum) * destination.quantum;
  return normalizeQuantity(snapped, destination);
}

/**
 * Format a quantity for display under the contract, honoring locale.
 * Never emits raw floating-point artifacts: output precision is always
 * bound by `contract.precision`.
 */
export function formatQuantity(
  value: number,
  contract: QuantityContract,
  locale = 'en-US'
): string {
  const normalized = normalizeQuantity(value, contract) ?? 0;
  if (contract.currency) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: contract.unit,
      minimumFractionDigits: contract.precision,
      maximumFractionDigits: contract.precision,
    }).format(normalized);
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: contract.precision,
  }).format(normalized);
}

// ============================================================================
// Shared contracts
// ============================================================================

/** Integer counts: reps, tracks, seats. Step 1, no fraction digits. */
export const COUNT_CONTRACT: QuantityContract = {
  domain: 'count',
  unit: 'count',
  quantum: 1,
  precision: 0,
  min: 0,
};

/**
 * USD tip/support amounts: direct entry allows cents (precision 2),
 * +/- affordances move in whole dollars (quantum 1).
 */
export const USD_AMOUNT_CONTRACT: QuantityContract = {
  domain: 'money-amount',
  unit: 'USD',
  quantum: 1,
  precision: 2,
  min: 0,
  currency: true,
};

/** Durations presented in minutes: 5-minute native quantum. */
export const DURATION_MINUTES_CONTRACT: QuantityContract = {
  domain: 'duration',
  unit: 'minute',
  quantum: 5,
  precision: 0,
  min: 0,
};
