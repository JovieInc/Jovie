/** Browser-safe Storybook stand-in for Statsig's native Node SDK. */
export class StatsigUser {
  static withUserID(id: string): StatsigUser {
    return new StatsigUser(id);
  }

  private constructor(readonly id: string) {}
}

export class Statsig {
  constructor(
    readonly _secret: string,
    readonly _options?: Record<string, unknown>
  ) {}

  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  getFeatureGate() {
    return {
      value: false,
      getEvaluationDetails: () => ({ reason: 'Unrecognized' }),
    };
  }

  getExperiment() {
    return { value: {} };
  }

  logEvent(): void {}
}
