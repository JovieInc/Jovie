'use client';

import {
  StatsigContext,
  useFeatureGate as useStatsigFeatureGate,
} from '@statsig/react-bindings';
import { useContext, useMemo } from 'react';
import type { StatsigFlagName } from '@/lib/flags';

/**
 * Default gate value returned when Statsig client is not available.
 * This ensures consistent hook behavior regardless of initialization state.
 */
const DEFAULT_GATE_VALUE = {
  value: false,
  details: {
    reason: 'Uninitialized',
  },
} as const;

/**
 * Safe wrapper around Statsig's useFeatureGate hook.
 *
 * Returns a default disabled gate when Statsig client is not yet initialized,
 * preventing "Rendered more hooks than during the previous render" errors
 * that can occur when the Statsig hook is called before the provider is ready.
 */
export function useFeatureGate(gateName: StatsigFlagName) {
  // Check if we have a valid Statsig context
  const statsigContext = useContext(StatsigContext);
  const hasClient = statsigContext?.client != null;

  // Always call the Statsig hook to maintain consistent hook count,
  // but only use its result when we have a valid client
  const statsigGate = useStatsigFeatureGate(gateName);

  // Return memoized default when client isn't available
  const defaultGate = useMemo(() => DEFAULT_GATE_VALUE, []);

  return hasClient ? statsigGate : defaultGate;
}
