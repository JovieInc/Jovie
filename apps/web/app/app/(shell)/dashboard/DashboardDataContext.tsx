'use client';

import { createContext, useContext, useMemo } from 'react';
import { UNKNOWN_AVATAR_QUALITY } from '@/lib/profile/avatar-quality';
import type { DashboardData } from './actions';

const DashboardDataContext = createContext<DashboardData | null>(null);

const EMPTY_PROFILE_COMPLETION: DashboardData['profileCompletion'] = {
  percentage: 0,
  completedCount: 0,
  totalCount: 0,
  steps: [],
  profileIsLive: false,
};

function normalizeDashboardData(value: DashboardData): DashboardData {
  return {
    ...value,
    avatarQuality: value.avatarQuality ?? UNKNOWN_AVATAR_QUALITY,
    bioLinkActivation: value.bioLinkActivation ?? null,
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
  const normalizedValue = useMemo(() => normalizeDashboardData(value), [value]);

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

// Use when the consumer can render outside a DashboardDataProvider (e.g.,
// components mounted in shared shells like AuthShellWrapper that can appear
// on pre-auth routes). Returns null when no provider is above in the tree.
export function useDashboardDataSafe(): DashboardData | null {
  return useContext(DashboardDataContext);
}
