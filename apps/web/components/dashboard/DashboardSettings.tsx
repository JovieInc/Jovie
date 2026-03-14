'use client';

import { memo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsErrorState } from '@/components/dashboard/molecules/SettingsErrorState';
import { SettingsPolished } from '@/components/dashboard/organisms/SettingsPolished';
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
      <div className='mx-auto w-full max-w-5xl px-4 pb-8 pt-2 sm:px-6 lg:px-8'>
        <SettingsErrorState message='Unable to load your profile settings. Please refresh the page.' />
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-5xl px-4 pb-8 pt-2 sm:px-6 lg:px-8'>
      <SettingsPolished
        artist={artist}
        onArtistUpdate={setArtist}
        focusSection={focusSection}
        isAdmin={dashboardData.isAdmin}
      />
    </div>
  );
});
