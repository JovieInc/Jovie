'use client';

import { createContext, useContext } from 'react';
import type { DashboardData } from './actions';

const DashboardDataContext = createContext<DashboardData | null>(null);

interface DashboardDataProviderProps {
  value: DashboardData;
  children: React.ReactNode;
}

export function DashboardDataProvider({
  value,
  children,
}: DashboardDataProviderProps) {
  // Debug: track isAdmin value changes in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[DashboardDataProvider] isAdmin:', value.isAdmin);
  }
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardData {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error(
      'useDashboardData must be used within a DashboardDataProvider'
    );
  }
  return context;
}
