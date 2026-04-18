'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  APP_FLAG_DEFAULTS,
  type AppFlagName,
  type AppFlagSnapshot,
} from './contracts';
import {
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

export function AppFlagProvider({
  children,
  initialFlags,
}: {
  readonly children: React.ReactNode;
  readonly initialFlags?: AppFlagSnapshot;
}) {
  const [overrides, setOverrides] = useState<AppFlagOverrideRecord>(
    readStoredAppFlagOverrides
  );

  const setOverride = useCallback((key: string, value: boolean) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: value };
      writeStoredAppFlagOverrides(next);
      return next;
    });
  }, []);

  const removeOverride = useCallback((key: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      writeStoredAppFlagOverrides(next);
      return next;
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setOverrides({});
    clearStoredAppFlagOverrides();
  }, []);

  const overridesValue = useMemo(
    () => ({ overrides, setOverride, removeOverride, clearOverrides }),
    [clearOverrides, overrides, removeOverride, setOverride]
  );

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
