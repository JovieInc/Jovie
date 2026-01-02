'use client';

import { useId, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useDashboardAnalytics as useDashboardAnalyticsHook } from '@/lib/hooks/useDashboardAnalytics';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { Range } from './types';

export interface UseDashboardAnalyticsReturn {
  artist: Artist | null;
  range: Range;
  setRange: (range: Range) => void;
  rangeTabsBaseId: string;
  rangePanelId: string;
  activeRangeTabId: string;
  data: ReturnType<typeof useDashboardAnalyticsHook>['data'];
  error: ReturnType<typeof useDashboardAnalyticsHook>['error'];
  loading: ReturnType<typeof useDashboardAnalyticsHook>['loading'];
  refresh: ReturnType<typeof useDashboardAnalyticsHook>['refresh'];
  rangeLabel: string;
}

export function useDashboardAnalyticsState(): UseDashboardAnalyticsReturn {
  const dashboardData = useDashboardData();
  const [artist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );

  const [range, setRange] = useState<Range>('7d');
  const rangeTabsBaseId = useId();
  const rangePanelId = `${rangeTabsBaseId}-panel`;
  const activeRangeTabId = `${rangeTabsBaseId}-tab-${range}`;

  const { data, error, loading, refresh } = useDashboardAnalyticsHook({
    range,
    view: 'full',
  });

  const rangeLabel = useMemo(() => {
    if (range === '1d') return 'Last 24 hours';
    if (range === '7d') return 'Last 7 days';
    return 'Last 30 days';
  }, [range]);

  return {
    artist,
    range,
    setRange,
    rangeTabsBaseId,
    rangePanelId,
    activeRangeTabId,
    data,
    error,
    loading,
    refresh,
    rangeLabel,
  };
}
