'use client';

import { createContext, useContext } from 'react';
import type { DashboardData } from './actions';

const DashboardDataContext = createContext<DashboardData | null>(null);

const EMPTY_PROFILE_COMPLETION: DashboardData['profileCompletion'] = {
  percentage: 0,
  completedCount: 0,
  totalCount: 0,
  steps: [],
};

function normalizeDashboardData(value: DashboardData): DashboardData {
  return {
    ...value,
    profileCompletion: value.profileCompletion ?? EMPTY_PROFILE_COMPLETION,
  };
}

interface DashboardDataProviderProps {
  readonly value: DashboardData;
  readonly children: React.ReactNode;
}

export function DashboardDataProvider({
  value,
  children,
}: Readonly<DashboardDataProviderProps>) {
  const normalizedValue = normalizeDashboardData(value);

  return (
    <DashboardDataContext.Provider value={normalizedValue}>
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
