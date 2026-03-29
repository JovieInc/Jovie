'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

const FLAG_BADGES_KEY = '__dev_flag_badges';

interface FlagBadgeContextValue {
  showBadges: boolean;
  toggleBadges: () => void;
}

const FlagBadgeContext = createContext<FlagBadgeContextValue | null>(null);

function readBadgesPref(): boolean {
  if (globalThis.window === undefined) return false;
  try {
    return localStorage.getItem(FLAG_BADGES_KEY) === '1';
  } catch {
    return false;
  }
}

export function FlagBadgeProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [showBadges, setShowBadges] = useState(readBadgesPref);

  const toggleBadges = useCallback(() => {
    setShowBadges(prev => {
      const next = !prev;
      localStorage.setItem(FLAG_BADGES_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ showBadges, toggleBadges }),
    [showBadges, toggleBadges]
  );

  return (
    <FlagBadgeContext.Provider value={value}>
      {children}
    </FlagBadgeContext.Provider>
  );
}

export function useFlagBadges(): FlagBadgeContextValue | null {
  return useContext(FlagBadgeContext);
}
