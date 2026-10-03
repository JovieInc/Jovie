/**
 * Budget tracking for real-model eval lanes.
 *
 * Every run of this lane spends metered provider credits, so the cap must be
 * an explicit, in-range value. An out-of-range or malformed cap falls back to
 * the conservative default instead of the caller's value (JOV-6234).
 */

const SONNET_INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const SONNET_OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

/** Conservative default spend cap for one real-model eval run (USD). */
export const DEFAULT_BUDGET_CAP_USD = 2;
/**
 * Absolute ceiling for a single run's declared cap (USD). A higher declared
 * cap is treated as out-of-range and replaced with the conservative default
 * rather than honored.
 */
export const MAX_BUDGET_CAP_USD = 25;

export function parseBudgetCapUsd(
  raw: string | undefined,
  fallback: number = DEFAULT_BUDGET_CAP_USD
): number {
  const safeFallback =
    Number.isFinite(fallback) && fallback > 0 && fallback <= MAX_BUDGET_CAP_USD
      ? fallback
      : DEFAULT_BUDGET_CAP_USD;
  const parsed = Number(raw ?? safeFallback);
  const bounded =
    Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_BUDGET_CAP_USD;
  return bounded ? parsed : safeFallback;
}

export class EvalBudgetTracker {
  private spentUsd = 0;

  constructor(private readonly capUsd: number) {}

  get spent(): number {
    return this.spentUsd;
  }

  get remaining(): number {
    return Math.max(0, this.capUsd - this.spentUsd);
  }

  recordUsage(inputTokens: number, outputTokens: number): void {
    const input = Math.max(0, inputTokens);
    const output = Math.max(0, outputTokens);
    this.spentUsd +=
      input * SONNET_INPUT_USD_PER_TOKEN + output * SONNET_OUTPUT_USD_PER_TOKEN;
  }

  assertWithinBudget(context: string): void {
    if (this.spentUsd > this.capUsd) {
      throw new Error(
        `${context}: eval spend ${this.spentUsd.toFixed(4)} USD exceeded BUDGET_CAP_USD=${this.capUsd.toFixed(2)}`
      );
    }
  }
}
