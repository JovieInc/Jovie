'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useBillingStatusQuery } from '@/lib/queries';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

export function useSettingsContext() {
  const dashboardData = useDashboardData();
  const selectedArtist = useMemo(
    () =>
      dashboardData.selectedProfile
        ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
        : null,
    [dashboardData.selectedProfile]
  );
  const [artist, setArtist] = useState<Artist | null>(selectedArtist);

  useEffect(() => {
    setArtist(selectedArtist);
  }, [selectedArtist]);
  const { data: billingData } = useBillingStatusQuery();
  const isPro = billingData?.isPro ?? false;
  const isGrowth = billingData?.plan === 'growth';

  return {
    artist,
    setArtist,
    isPro,
    isGrowth,
    isAdmin: dashboardData.isAdmin,
  };
}
