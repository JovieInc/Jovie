'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { FeatureFlagsBootstrap } from './shared';

const FF_OVERRIDES_KEY = '__ff_overrides';

function readOverrides(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(FF_OVERRIDES_KEY) ?? '{}');
  } catch {
    return {};
  }
}

interface FeatureFlagOverridesContext {
  overrides: Record<string, boolean>;
  setOverride: (key: string, value: boolean) => void;
  removeOverride: (key: string) => void;
  clearOverrides: () => void;
}

const OverridesContext = createContext<FeatureFlagOverridesContext | null>(
  null
);

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
 * FeatureFlagsProvider - Client component that provides server-evaluated flags.
 * Supports local overrides stored in localStorage for dev toolbar use.
 */
export function FeatureFlagsProvider({
  bootstrap,
  children,
}: FeatureFlagsProviderProps) {
  const [overrides, setOverridesState] =
    useState<Record<string, boolean>>(readOverrides);

  const setOverride = useCallback((key: string, value: boolean) => {
    setOverridesState(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeOverride = useCallback((key: string) => {
    setOverridesState(prev => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverridesState({});
    localStorage.removeItem(FF_OVERRIDES_KEY);
  }, []);

  const merged = useMemo(
    () => ({ gates: { ...bootstrap.gates, ...overrides } }),
    [bootstrap.gates, overrides]
  );

  const overridesValue = useMemo(
    () => ({ overrides, setOverride, removeOverride, clearOverrides }),
    [overrides, setOverride, removeOverride, clearOverrides]
  );

  return (
    <OverridesContext.Provider value={overridesValue}>
      <FeatureFlagsContext.Provider value={merged}>
        {children}
      </FeatureFlagsContext.Provider>
    </OverridesContext.Provider>
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
 * Hook to read and mutate local feature flag overrides (used by DevToolbar)
 */
export function useFeatureFlagOverrides(): FeatureFlagOverridesContext | null {
  return useContext(OverridesContext);
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
