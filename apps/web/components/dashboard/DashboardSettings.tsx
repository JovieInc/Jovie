'use client';

import { memo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
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
    return null; // This shouldn't happen given the server-side logic
  }

  return (
    <div className='mx-auto max-w-2xl'>
      <SettingsPolished
        artist={artist}
        onArtistUpdate={setArtist}
        focusSection={focusSection}
      />
    </div>
  );
});
