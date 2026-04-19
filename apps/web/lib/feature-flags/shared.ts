/**
 * Deprecated compatibility surface for static marketing flags and legacy
 * Statsig key references. Runtime app flags now live under `@/lib/flags/*`.
 */
import {
  APP_FLAG_DEFAULTS,
  type StatsigFeatureFlagsBootstrap,
} from '@/lib/flags/contracts';
import { FEATURE_FLAGS as MARKETING_STATIC_FLAGS } from '@/lib/flags/marketing-static';

export type { StatsigFeatureFlagsBootstrap } from '@/lib/flags/contracts';
export {
  LEGACY_STATSIG_GATE_KEYS as STATSIG_GATE_KEYS,
  LEGACY_STATSIG_GATE_KEYS as FEATURE_FLAG_KEYS,
  type StatsigGateKey,
  type StatsigGateKey as FeatureFlagKey,
  type SubscribeCTAVariant,
} from '@/lib/flags/contracts';

/**
 * Compatibility surface for legacy `FEATURE_FLAGS` call-sites that still read a
 * small subset of runtime flags alongside static marketing flags.
 */
export const FEATURE_FLAGS = {
  ...MARKETING_STATIC_FLAGS,
  ALBUM_ART_GENERATION: APP_FLAG_DEFAULTS.ALBUM_ART_GENERATION,
} as const;

export type CodeFlagName = keyof typeof FEATURE_FLAGS;

/** @deprecated Compatibility alias. */
export interface FeatureFlagsBootstrap extends StatsigFeatureFlagsBootstrap {}
