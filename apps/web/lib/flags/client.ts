'use client';

import { useFeatureGate as useStatsigFeatureGate } from '@statsig/react-bindings';
import type { StatsigFlagName } from '@/lib/flags';

export function useFeatureGate(gateName: StatsigFlagName) {
  return useStatsigFeatureGate(gateName);
}
