'use client';

import { createContext, useContext } from 'react';
import type { FeatureFlagsBootstrap } from './server';

/**
 * Client-side feature flags context
 * Hydrated from server-side evaluation, no client SDK needed
 */
const FeatureFlagsContext = createContext<FeatureFlagsBootstrap | null>(null);

interface FeatureFlagsProviderProps {
  readonly bootstrap: FeatureFlagsBootstrap;
  readonly children: React.ReactNode;
}

/**
 * FeatureFlagsProvider - Client component that provides server-evaluated flags
 * This replaces the Statsig client SDK with a lightweight context provider
 */
export function FeatureFlagsProvider({
  bootstrap,
  children,
}: FeatureFlagsProviderProps) {
  return (
    <FeatureFlagsContext.Provider value={bootstrap}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/**
 * Hook to access feature flags bootstrap
 * Returns null if used outside of /app routes (marketing pages don't have flags)
 */
export function useFeatureFlagsBootstrap(): FeatureFlagsBootstrap | null {
  return useContext(FeatureFlagsContext);
}

/**
 * Check if a feature gate is enabled
 * Falls back to defaultValue if bootstrap is not available (marketing routes)
 */
export function useFeatureGate(gateKey: string, defaultValue = false): boolean {
  const bootstrap = useFeatureFlagsBootstrap();
  if (!bootstrap) return defaultValue;
  return bootstrap.gates[gateKey] ?? defaultValue;
}

/**
 * Hook with loading state for feature gates
 * In this implementation, loading is always false since flags are server-evaluated
 */
export function useFeatureGateWithLoading(
  gateKey: string,
  defaultValue = false
): { enabled: boolean; loading: boolean } {
  const enabled = useFeatureGate(gateKey, defaultValue);
  return { enabled, loading: false };
}
