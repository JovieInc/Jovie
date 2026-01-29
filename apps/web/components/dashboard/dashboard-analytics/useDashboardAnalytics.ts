'use client';

import { useId, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useDashboardAnalyticsQuery } from '@/lib/queries';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { Range } from './types';

export interface UseDashboardAnalyticsReturn {
  artist: Artist | null;
  range: Range;
  setRange: (range: Range) => void;
  rangeTabsBaseId: string;
  rangePanelId: string;
  activeRangeTabId: string;
  data: ReturnType<typeof useDashboardAnalyticsQuery>['data'];
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
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

  const { data, error, isLoading, refetch } = useDashboardAnalyticsQuery({
    range,
    view: 'full',
  });

  const rangeLabel = useMemo(() => {
    if (range === '1d') return 'Last 24 hours';
    if (range === '7d') return 'Last 7 days';
    return 'Last 30 days';
  }, [range]);

  // Wrap refetch to match old API
  const refresh = async () => {
    await refetch();
  };

  return {
    artist,
    range,
    setRange,
    rangeTabsBaseId,
    rangePanelId,
    activeRangeTabId,
    data,
    error: error?.message ?? null,
    loading: isLoading,
    refresh,
    rangeLabel,
  };
}
