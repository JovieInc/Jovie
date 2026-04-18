'use client';

import { memo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsPolished } from '@/features/dashboard/organisms/SettingsPolished';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

export interface DashboardSettingsProps {
  readonly focusSection?: string;
}

export const DashboardSettings = memo(function DashboardSettings({
  focusSection,
}: DashboardSettingsProps) {
  const dashboardData = useDashboardData();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  // Note: Profile switching functionality will be implemented in the future
  // Feature flag check removed - settings always enabled

  if (!artist) {
    return (
      <div className='mx-auto w-full max-w-[980px] px-3 pb-6 pt-1 sm:px-4 lg:px-5'>
        <SettingsErrorState message='Unable to load your profile settings. Please refresh the page.' />
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-[980px] px-3 pb-6 pt-1 sm:px-4 lg:px-5'>
      <SettingsPolished
        artist={artist}
        onArtistUpdate={setArtist}
        focusSection={focusSection}
        isAdmin={dashboardData.isAdmin}
      />
    </div>
  );
});
