'use client';

import { createContext, useContext, useMemo } from 'react';

interface BackNavigationValue {
  canGoBack: boolean;
  goBack: () => void;
}

const BackNavigationContext = createContext<BackNavigationValue>({
  canGoBack: false,
  goBack: () => {},
});

export function useBackNavigation(): BackNavigationValue {
  return useContext(BackNavigationContext);
}

export function BackNavigationProvider({
  canGoBack,
  goBack,
  children,
}: Readonly<{
  canGoBack?: boolean;
  goBack?: () => void;
  children: React.ReactNode;
}>) {
  const value = useMemo<BackNavigationValue>(
    () => ({
      canGoBack: canGoBack ?? false,
      goBack: goBack ?? (() => {}),
    }),
    [canGoBack, goBack]
  );
  return (
    <BackNavigationContext.Provider value={value}>
      {children}
    </BackNavigationContext.Provider>
  );
}
