'use client';

import { createContext, useContext } from 'react';
import type { DashboardData } from './actions';

const DashboardDataContext = createContext<DashboardData | null>(null);

interface DashboardDataProviderProps {
  readonly value: DashboardData;
  readonly children: React.ReactNode;
}

export function DashboardDataProvider({
  value,
  children,
}: Readonly<DashboardDataProviderProps>) {
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardData {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new TypeError(
      'useDashboardData must be used within a DashboardDataProvider'
    );
  }
  return context;
}

/**
 * Optional variant that returns null instead of throwing when outside the provider.
 * Use this when the component may or may not be rendered within a DashboardDataProvider.
 */
export function useDashboardDataOptional(): DashboardData | null {
  return useContext(DashboardDataContext);
}
