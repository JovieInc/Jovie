/**
 * Budget tracking for real-model eval lanes.
 *
 * JOV-6234: the default cap is 0 USD — no-spend unless an explicit positive
 * BUDGET_CAP_USD is provided by an explicitly authorized dispatch. There is
 * no automatic paid fallback.
 */

const SONNET_INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const SONNET_OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

/** Default spend cap: 0 USD — paid calls require an explicit positive cap. */
export const REAL_EVAL_DEFAULT_CAP_USD = 0;

export function parseBudgetCapUsd(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw ?? String(REAL_EVAL_DEFAULT_CAP_USD));
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : REAL_EVAL_DEFAULT_CAP_USD;
}

export class EvalBudgetTracker {
  private spentUsd = 0;

  constructor(private readonly capUsd: number) {}

  get cap(): number {
    return this.capUsd;
  }

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
