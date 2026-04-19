import 'server-only';

/**
 * Deprecated compatibility surface. Runtime app flags now live under
 * `@/lib/flags/server`.
 */
export {
  checkGateForUser as checkGate,
  getExperiment,
  getFeatureFlagsBootstrap,
  getSubscribeCTAVariant,
  shutdownStatsig,
} from '@/lib/flags/server';
