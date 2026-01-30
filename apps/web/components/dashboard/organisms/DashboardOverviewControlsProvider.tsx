'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { AnalyticsRange } from '@/types/analytics';

type DashboardOverviewRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

type DashboardOverviewControlsValue = {
  range: DashboardOverviewRange;
  setRange: (range: DashboardOverviewRange) => void;
  refreshSignal: number;
  triggerRefresh: () => void;
};

const DashboardOverviewControlsContext =
  createContext<DashboardOverviewControlsValue | null>(null);

export function useDashboardOverviewControls(): DashboardOverviewControlsValue {
  const value = useContext(DashboardOverviewControlsContext);

  if (!value) {
    throw new TypeError(
      'useDashboardOverviewControls must be used within DashboardOverviewControlsProvider'
    );
  }

  return value;
}

export interface DashboardOverviewControlsProviderProps {
  readonly children: ReactNode;
  readonly defaultRange?: DashboardOverviewRange;
}

export function DashboardOverviewControlsProvider({
  children,
  defaultRange = '7d',
}: DashboardOverviewControlsProviderProps) {
  const [range, setRange] = useState<DashboardOverviewRange>(defaultRange);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const updateRange = useCallback((newRange: DashboardOverviewRange) => {
    setRange(newRange);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshSignal(prev => prev + 1);
  }, []);

  const value = useMemo<DashboardOverviewControlsValue>(() => {
    return {
      range,
      setRange: updateRange,
      refreshSignal,
      triggerRefresh,
    };
  }, [range, updateRange, refreshSignal, triggerRefresh]);

  return (
    <DashboardOverviewControlsContext.Provider value={value}>
      {children}
    </DashboardOverviewControlsContext.Provider>
  );
}
