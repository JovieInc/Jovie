'use client';

import { useFeatureGate as useStatsigFeatureGate } from '@statsig/react-bindings';
import type { StatsigFlagName } from '@/lib/flags';

/**
 * Wrapper around Statsig's useFeatureGate hook.
 *
 * Returns the boolean value of the feature gate.
 * The StatsigProvider must be present in the component tree.
 */
export function useFeatureGate(gateName: StatsigFlagName): boolean {
  const gate = useStatsigFeatureGate(gateName);
  return gate.value;
}
