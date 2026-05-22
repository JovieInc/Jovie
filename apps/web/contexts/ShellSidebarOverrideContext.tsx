'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface ShellSidebarOverride {
  readonly key: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly content: ReactNode;
}

type ShellSidebarOverrideDispatch = Dispatch<
  SetStateAction<ShellSidebarOverride | null>
>;

const ShellSidebarOverrideStateContext = createContext<
  ShellSidebarOverride | null | undefined
>(undefined);

const ShellSidebarOverrideDispatchContext = createContext<
  ShellSidebarOverrideDispatch | undefined
>(undefined);

export function ShellSidebarOverrideProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [override, setOverride] = useState<ShellSidebarOverride | null>(null);

  return (
    <ShellSidebarOverrideDispatchContext.Provider value={setOverride}>
      <ShellSidebarOverrideStateContext.Provider value={override}>
        {children}
      </ShellSidebarOverrideStateContext.Provider>
    </ShellSidebarOverrideDispatchContext.Provider>
  );
}

export function useShellSidebarOverride(): ShellSidebarOverride | null {
  return useContext(ShellSidebarOverrideStateContext) ?? null;
}

export function useRegisterShellSidebarOverride(
  override: ShellSidebarOverride | null
): void {
  const setOverride = useContext(ShellSidebarOverrideDispatchContext);
  const overrideKey = override?.key ?? null;

  const stableOverride = useMemo(() => override, [override]);

  useEffect(() => {
    if (!setOverride) return undefined;

    setOverride(stableOverride);

    return () => {
      setOverride(current =>
        current?.key && current.key === overrideKey ? null : current
      );
    };
  }, [overrideKey, setOverride, stableOverride]);
}
