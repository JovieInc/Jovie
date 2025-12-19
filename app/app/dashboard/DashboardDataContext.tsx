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
