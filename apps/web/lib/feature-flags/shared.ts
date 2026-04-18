/**
 * Deprecated compatibility surface for static marketing flags and legacy
 * Statsig key references. Runtime app flags now live under `@/lib/flags/*`.
 */
import type { StatsigFeatureFlagsBootstrap } from '@/lib/flags/contracts';

export type { StatsigFeatureFlagsBootstrap } from '@/lib/flags/contracts';
export {
  LEGACY_STATSIG_GATE_KEYS as STATSIG_GATE_KEYS,
  LEGACY_STATSIG_GATE_KEYS as FEATURE_FLAG_KEYS,
  type StatsigGateKey,
  type StatsigGateKey as FeatureFlagKey,
  type SubscribeCTAVariant,
} from '@/lib/flags/contracts';
export type { MarketingStaticFlagName as CodeFlagName } from '@/lib/flags/marketing-static';
export { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

/** @deprecated Compatibility alias. */
export interface FeatureFlagsBootstrap extends StatsigFeatureFlagsBootstrap {}
