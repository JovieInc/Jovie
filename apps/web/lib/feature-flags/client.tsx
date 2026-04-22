'use client';

/**
 * Deprecated compatibility surface. Runtime app flags now live under
 * `@/lib/flags/client`.
 */
export {
  AppFlagProvider as FeatureFlagsProvider,
  useAppFlag as useCodeFlag,
  useAppFlagOverrides as useFeatureFlagOverrides,
  useAppFlagWithLoading as useCodeFlagWithLoading,
} from '@/lib/flags/client';
