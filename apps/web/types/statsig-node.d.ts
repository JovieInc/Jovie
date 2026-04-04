/**
 * Minimal type declarations for statsig-node.
 * The package was removed but server.ts still references it.
 * This stub satisfies the TypeScript compiler.
 */
declare module 'statsig-node' {
  interface StatsigOptions {
    environment?: { tier?: string };
  }

  interface FeatureGate {
    value: boolean;
    evaluationDetails?: { reason?: string };
  }

  interface StatsigUser {
    userID: string;
  }

  interface DynamicConfig {
    value: Record<string, unknown>;
  }

  const Statsig: {
    initialize(secret: string, options?: StatsigOptions): Promise<void>;
    getFeatureGateSync(user: StatsigUser, gateName: string): FeatureGate;
    getExperiment(
      user: StatsigUser,
      experimentName: string
    ): Promise<DynamicConfig>;
    shutdown(): Promise<void>;
  };

  export default Statsig;
}
