'use client';

import dynamic from 'next/dynamic';
import { memo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

const SettingsPolished = dynamic(
  () =>
    import('@/components/dashboard/organisms/SettingsPolished').then(mod => ({
      default: mod.SettingsPolished,
    })),
  {
    loading: () => (
      <div className='mx-auto max-w-2xl space-y-8 pb-8'>
        <div className='h-96 animate-pulse motion-reduce:animate-none rounded-lg bg-surface-1' />
      </div>
    ),
  }
);

export interface DashboardSettingsProps {
  focusSection?: string;
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
