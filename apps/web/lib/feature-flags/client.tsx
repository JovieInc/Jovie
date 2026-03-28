'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  CODE_FLAG_KEYS,
  type CodeFlagName,
  FEATURE_FLAGS,
  FF_OVERRIDES_KEY,
} from './shared';

function readOverrides(): Record<string, boolean> {
  if (globalThis.window === undefined) return {};
  try {
    return JSON.parse(localStorage.getItem(FF_OVERRIDES_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export interface FeatureFlagOverridesContext {
  overrides: Record<string, boolean>;
  setOverride: (key: string, value: boolean) => void;
  removeOverride: (key: string) => void;
  clearOverrides: () => void;
}

const OverridesContext = createContext<FeatureFlagOverridesContext | null>(
  null
);

/**
 * FeatureFlagsProvider — provides localStorage overrides for the dev toolbar.
 * The `bootstrap` prop is accepted but ignored (Statsig removed).
 */
export function FeatureFlagsProvider({
  children,
}: {
  readonly bootstrap?: { gates: Record<string, boolean> };
  readonly children: React.ReactNode;
}) {
  const [overrides, setOverrides] =
    useState<Record<string, boolean>>(readOverrides);

  const setOverride = useCallback((key: string, value: boolean) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeOverride = useCallback((key: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverrides({});
    localStorage.removeItem(FF_OVERRIDES_KEY);
  }, []);

  const overridesValue = useMemo(
    () => ({ overrides, setOverride, removeOverride, clearOverrides }),
    [overrides, setOverride, removeOverride, clearOverrides]
  );

  return (
    <OverridesContext.Provider value={overridesValue}>
      {children}
    </OverridesContext.Provider>
  );
}

/**
 * Hook to read and mutate local feature flag overrides (used by DevToolbar)
 */
export function useFeatureFlagOverrides(): FeatureFlagOverridesContext | null {
  return useContext(OverridesContext);
}

/**
 * Check if a code-level feature flag is enabled.
 * Supports dev toolbar overrides via the `code:` prefixed key in localStorage.
 */
export function useCodeFlag(flagName: CodeFlagName): boolean {
  const overrides = useContext(OverridesContext);
  const overrideKey = CODE_FLAG_KEYS[flagName];
  if (overrides && overrideKey in overrides.overrides) {
    return overrides.overrides[overrideKey];
  }
  return FEATURE_FLAGS[flagName];
}

/**
 * Hook with loading state (loading is always false).
 */
export function useCodeFlagWithLoading(flagName: CodeFlagName): {
  enabled: boolean;
  loading: boolean;
} {
  const enabled = useCodeFlag(flagName);
  return { enabled, loading: false };
}
