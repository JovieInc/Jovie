import { computeRatePercent } from '@/lib/analytics/metrics';

export const USAGE_WARNING_REMAINING_PERCENT = 20;

export type UsageMeterState = 'healthy' | 'warning' | 'exhausted';

export interface UsageMeterModel {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly remainingPercent: number;
  readonly state: UsageMeterState;
  readonly resetAt: string | null;
  readonly warningRemainingPercent: number;
}

export interface UsageMeterInput {
  readonly used: number;
  readonly limit: number;
  readonly remaining?: number | null;
  readonly resetAt?: string | null;
  /** Optional product warning threshold expressed as an exact remaining count. */
  readonly warningRemaining?: number | null;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeResetAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Produces one internally consistent, fail-closed quota snapshot.
 *
 * When `used` and `remaining` disagree, the lower remaining value wins so the
 * UI never promises capacity that either upstream observation says is gone.
 * Invalid limits/counts return null instead of rendering a false healthy bar.
 */
export function createUsageMeterModel(
  input: UsageMeterInput
): UsageMeterModel | null {
  if (
    !isFiniteNonNegative(input.used) ||
    !Number.isFinite(input.limit) ||
    input.limit <= 0
  ) {
    return null;
  }

  const limit = input.limit;
  const remainingFromUsed = limit - clamp(input.used, 0, limit);
  let remaining = remainingFromUsed;

  if (input.remaining !== undefined && input.remaining !== null) {
    if (!Number.isFinite(input.remaining)) return null;
    remaining = Math.min(remaining, clamp(input.remaining, 0, limit));
  }

  const used = limit - remaining;
  const remainingPercent = computeRatePercent(remaining, limit, 0);
  const warningRemaining =
    input.warningRemaining !== undefined &&
    input.warningRemaining !== null &&
    isFiniteNonNegative(input.warningRemaining)
      ? clamp(input.warningRemaining, 0, limit)
      : 0;
  const productWarningPercent = Math.ceil(
    computeRatePercent(warningRemaining, limit, 2)
  );
  const warningRemainingPercent = Math.max(
    USAGE_WARNING_REMAINING_PERCENT,
    productWarningPercent
  );

  let state: UsageMeterState = 'healthy';
  if (remaining === 0) {
    state = 'exhausted';
  } else if (
    remaining <= warningRemaining ||
    remainingPercent <= warningRemainingPercent
  ) {
    state = 'warning';
  }

  return {
    used,
    limit,
    remaining,
    remainingPercent,
    state,
    resetAt: normalizeResetAt(input.resetAt),
    warningRemainingPercent,
  };
}
