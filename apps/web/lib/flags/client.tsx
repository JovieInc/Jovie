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
  APP_FLAG_OVERRIDE_KEYS,
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
  validOverrides: AppFlagOverrideRecord;
  orphanKeys: string[];
  setOverride: (key: string, value: boolean) => void;
  removeOverride: (key: string) => void;
  clearOverrides: () => void;
  purgeOrphans: () => void;
}

const KNOWN_OVERRIDE_KEYS = new Set<string>(
  Object.values(APP_FLAG_OVERRIDE_KEYS)
);

function partitionOverrides(record: AppFlagOverrideRecord): {
  valid: AppFlagOverrideRecord;
  orphans: string[];
} {
  const valid: AppFlagOverrideRecord = {};
  const orphans: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (KNOWN_OVERRIDE_KEYS.has(key)) {
      valid[key] = value;
    } else {
      orphans.push(key);
    }
  }
  return { valid, orphans };
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

  const purgeOrphans = useCallback(() => {
    const current = readStoredAppFlagOverrides();
    const { valid, orphans } = partitionOverrides(current);
    if (orphans.length === 0) return;
    writeStoredAppFlagOverrides(valid);
    setOverrides(valid);
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

  const { valid: validOverrides, orphans: orphanKeys } = useMemo(
    () => partitionOverrides(overrides),
    [overrides]
  );

  return useMemo(
    () => ({
      overrides,
      validOverrides,
      orphanKeys,
      setOverride,
      removeOverride,
      clearOverrides,
      purgeOrphans,
    }),
    [
      overrides,
      validOverrides,
      orphanKeys,
      setOverride,
      removeOverride,
      clearOverrides,
      purgeOrphans,
    ]
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
