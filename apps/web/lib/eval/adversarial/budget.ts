/**
 * Budget tracking for real-model eval lanes.
 */

const SONNET_INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const SONNET_OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

export function parseBudgetCapUsd(raw: string | undefined): number {
  const parsed = Number.parseFloat(raw ?? '2');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
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
