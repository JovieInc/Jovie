import type { DesignRefsIntakeConfig } from './config';

export interface IntakeSpendLedger {
  readonly browserCaptures: number;
  readonly estimatedUsd: number;
}

export class IntakeSpendBudget {
  private browserCaptures = 0;
  private estimatedUsd = 0;

  constructor(private readonly config: DesignRefsIntakeConfig['spendCap']) {}

  recordBrowserCapture(): void {
    this.browserCaptures += 1;
    this.estimatedUsd += this.config.estimatedUsdPerBrowserCapture;
    this.assertWithinCap();
  }

  snapshot(): IntakeSpendLedger {
    return {
      browserCaptures: this.browserCaptures,
      estimatedUsd: this.estimatedUsd,
    };
  }

  private assertWithinCap(): void {
    if (this.browserCaptures > this.config.maxBrowserCapturesPerRun) {
      throw new Error(
        `design-refs intake: browser capture cap exceeded (${this.config.maxBrowserCapturesPerRun} per run)`
      );
    }
    if (this.estimatedUsd > this.config.maxEstimatedUsdPerRun) {
      throw new Error(
        `design-refs intake: estimated spend cap exceeded ($${this.config.maxEstimatedUsdPerRun} per run)`
      );
    }
  }
}
