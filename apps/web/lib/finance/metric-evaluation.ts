import {
  FINANCE_METRIC_DEFINITIONS,
  type FinanceDesiredDirection,
  type FinanceMetricId,
  type FinanceMetricUnit,
} from './metric-contracts';

export type FinanceTrendDirection =
  | 'decreasing'
  | 'flat'
  | 'increasing'
  | 'unavailable';
export type FinanceTrendStatus =
  | 'favorable'
  | 'neutral'
  | 'unavailable'
  | 'unfavorable';
export type FinanceTargetStatus =
  | 'met'
  | 'missed'
  | 'near'
  | 'not_set'
  | 'unavailable';

export interface FinanceTrendResult {
  readonly direction: FinanceTrendDirection;
  readonly magnitude: number | null;
  readonly percent: number | null;
  readonly status: FinanceTrendStatus;
}

const unitTolerance = (unit: FinanceMetricUnit): number => {
  if (unit === 'minor_currency') return 1;
  if (unit === 'months') return 0.01;
  return 0.0001;
};

/** Direction and magnitude use a 0.5% relative floor plus a unit floor. */
export function evaluateFinanceTrend(
  id: FinanceMetricId,
  current: number | null,
  previous: number | null
): FinanceTrendResult {
  if (current === null || previous === null) {
    return {
      direction: 'unavailable',
      magnitude: null,
      percent: null,
      status: 'unavailable',
    };
  }
  const definition = FINANCE_METRIC_DEFINITIONS[id];
  const desiredDirection =
    definition.desiredDirection as FinanceDesiredDirection;
  const delta = current - previous;
  const flatThreshold = Math.max(
    unitTolerance(definition.unit),
    Math.abs(previous) * 0.005
  );
  const direction: FinanceTrendDirection =
    Math.abs(delta) <= flatThreshold
      ? 'flat'
      : delta > 0
        ? 'increasing'
        : 'decreasing';
  const status: FinanceTrendStatus = (() => {
    if (direction === 'flat' || desiredDirection === 'neutral')
      return 'neutral';
    if (desiredDirection === 'target_is_best') return 'neutral';
    const favorable =
      (direction === 'increasing' && desiredDirection === 'higher_is_better') ||
      (direction === 'decreasing' && desiredDirection === 'lower_is_better');
    return favorable ? 'favorable' : 'unfavorable';
  })();
  return {
    direction,
    magnitude: Math.abs(delta),
    percent: previous === 0 ? null : delta / Math.abs(previous),
    status,
  };
}

/** Target status uses a direction-aware 5% band and explicit null states. */
export function evaluateFinanceTarget(
  id: FinanceMetricId,
  value: number | null,
  target: number | null
): FinanceTargetStatus {
  if (target === null) return 'not_set';
  if (value === null) return 'unavailable';
  const definition = FINANCE_METRIC_DEFINITIONS[id];
  const tolerance = Math.max(
    unitTolerance(definition.unit),
    Math.abs(target) * 0.05
  );
  if (definition.desiredDirection === 'higher_is_better') {
    if (value >= target) return 'met';
    return value >= target - tolerance ? 'near' : 'missed';
  }
  if (definition.desiredDirection === 'lower_is_better') {
    if (value <= target) return 'met';
    return value <= target + tolerance ? 'near' : 'missed';
  }
  const distance = Math.abs(value - target);
  if (distance <= tolerance) return 'met';
  return distance <= tolerance * 2 ? 'near' : 'missed';
}

export type FinanceMetricConfidence = 'high' | 'low' | 'medium';

export interface FinanceConfidenceInput {
  readonly historyDays: number;
  readonly sourceCoverage: number;
  readonly classifiedFraction: number;
  readonly freshestBalanceAgeHours: number | null;
  readonly unresolvedCount: number;
  readonly postedCount: number;
}

/** Confidence is deterministic and never substitutes for metric availability. */
export function evaluateFinanceConfidence(
  input: FinanceConfidenceInput
): FinanceMetricConfidence {
  if (
    input.historyDays >= 90 &&
    input.sourceCoverage >= 0.9 &&
    input.classifiedFraction >= 0.9 &&
    input.freshestBalanceAgeHours !== null &&
    input.freshestBalanceAgeHours <= 48 &&
    input.unresolvedCount === 0 &&
    input.postedCount > 0
  ) {
    return 'high';
  }
  if (
    input.historyDays >= 30 &&
    input.sourceCoverage >= 0.5 &&
    input.classifiedFraction >= 0.75 &&
    input.freshestBalanceAgeHours !== null &&
    input.freshestBalanceAgeHours <= 168 &&
    input.postedCount > 0
  ) {
    return 'medium';
  }
  return 'low';
}
