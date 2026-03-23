'use client';

import { useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { useBillingStatusQuery } from '@/lib/queries';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

export function useSettingsContext() {
  const dashboardData = useDashboardData();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
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
