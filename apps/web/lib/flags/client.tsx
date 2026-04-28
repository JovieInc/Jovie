'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  APP_FLAG_DEFAULTS,
  type AppFlagName,
  type AppFlagSnapshot,
} from './contracts';
import {
  APP_FLAG_OVERRIDES_CHANGED_EVENT,
  type AppFlagOverrideRecord,
  clearStoredAppFlagOverrides,
  getAppFlagOverrideValue,
  readStoredAppFlagOverrides,
  writeStoredAppFlagOverrides,
} from './overrides';

export interface AppFlagOverridesContextValue {
  overrides: AppFlagOverrideRecord;
  setOverride: (key: string, value: boolean) => void;
  removeOverride: (key: string) => void;
  clearOverrides: () => void;
}

const AppFlagsContext = createContext<AppFlagSnapshot | null>(null);
const OverridesContext = createContext<AppFlagOverridesContextValue | null>(
  null
);

export function useStoredAppFlagOverrides(): AppFlagOverridesContextValue {
  const [overrides, setOverrides] = useState<AppFlagOverrideRecord>(
    readStoredAppFlagOverrides
  );

  const setOverride = useCallback((key: string, value: boolean) => {
    const next = { ...readStoredAppFlagOverrides(), [key]: value };
    writeStoredAppFlagOverrides(next);
    setOverrides(next);
  }, []);

  const removeOverride = useCallback((key: string) => {
    const next = { ...readStoredAppFlagOverrides() };
    delete next[key];
    writeStoredAppFlagOverrides(next);
    setOverrides(next);
  }, []);

  const clearOverrides = useCallback(() => {
    clearStoredAppFlagOverrides();
    setOverrides({});
  }, []);

  useEffect(() => {
    const syncOverrides = () => {
      setOverrides(readStoredAppFlagOverrides());
    };

    globalThis.addEventListener(
      APP_FLAG_OVERRIDES_CHANGED_EVENT,
      syncOverrides
    );
    globalThis.addEventListener('storage', syncOverrides);
    return () => {
      globalThis.removeEventListener(
        APP_FLAG_OVERRIDES_CHANGED_EVENT,
        syncOverrides
      );
      globalThis.removeEventListener('storage', syncOverrides);
    };
  }, []);

  return useMemo(
    () => ({ overrides, setOverride, removeOverride, clearOverrides }),
    [clearOverrides, overrides, removeOverride, setOverride]
  );
}

export function AppFlagProvider({
  children,
  initialFlags,
}: {
  readonly children: React.ReactNode;
  readonly initialFlags?: AppFlagSnapshot;
}) {
  const overridesValue = useStoredAppFlagOverrides();

  return (
    <AppFlagsContext.Provider value={initialFlags ?? APP_FLAG_DEFAULTS}>
      <OverridesContext.Provider value={overridesValue}>
        {children}
      </OverridesContext.Provider>
    </AppFlagsContext.Provider>
  );
}

export function useAppFlagOverrides(): AppFlagOverridesContextValue | null {
  return useContext(OverridesContext);
}

export function useAppFlag(flagName: AppFlagName): boolean {
  const appFlags = useContext(AppFlagsContext);
  const overrides = useContext(OverridesContext)?.overrides;
  const effectiveOverrides = overrides ?? readStoredAppFlagOverrides();
  const overrideValue = getAppFlagOverrideValue(flagName, effectiveOverrides);

  if (overrideValue !== undefined) {
    return overrideValue;
  }

  return appFlags?.[flagName] ?? APP_FLAG_DEFAULTS[flagName];
}

export function useAppFlagWithLoading(flagName: AppFlagName): {
  enabled: boolean;
  loading: boolean;
} {
  return {
    enabled: useAppFlag(flagName),
    loading: false,
  };
}
