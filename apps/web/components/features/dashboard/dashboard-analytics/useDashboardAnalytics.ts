'use client';

import { useId, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  evaluateDashboardAnalyticsInvariants,
  reportAnalyticsRuntimeViolation,
} from '@/lib/analytics/invariants-runtime';
import { getTimeRangeLabel } from '@/lib/analytics/time-range';
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
  /**
   * Metric keys the JOV-3587 runtime guard found contradictory (including
   * bad-but-plausible non-zero values). The UI degrades these to a safe
   * state instead of showing the contradiction.
   */
  runtimeContradictedKeys: ReadonlySet<string>;
}

/** One structured diagnostic per contradiction — no duplicate warnings. */
const reportedViolations = new Set<string>();

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

  // Runtime invariant guard: evaluate the loaded window, degrade
  // contradictory metrics to a safe state, and emit exactly one structured
  // warning per contradiction (profile id + range + offending pair).
  const runtimeContradictedKeys = useMemo<ReadonlySet<string>>(() => {
    if (isLoading || !data) return new Set<string>();
    const profileId = dashboardData.selectedProfile?.id;
    if (!profileId) return new Set<string>();

    const result = evaluateDashboardAnalyticsInvariants(data, {
      profileId,
      range,
    });
    if (!result || result.ok) return new Set<string>();

    const reportKey = `${profileId}:${range}`;
    if (!reportedViolations.has(reportKey)) {
      reportedViolations.add(reportKey);
      void reportAnalyticsRuntimeViolation(result, { profileId, range });
    }
    return new Set(
      new Set(result.violations.flatMap(finding => finding.metricKeys))
    );
  }, [data, isLoading, dashboardData.selectedProfile?.id, range]);

  const rangeLabel = useMemo(
    () => getTimeRangeLabel(range, 'description'),
    [range]
  );

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
    error: error ? 'Unable to load analytics. Please try again.' : null,
    loading: isLoading,
    refresh,
    rangeLabel,
    runtimeContradictedKeys,
  };
}
