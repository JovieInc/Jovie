'use client';

import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { SettingsPolished } from '@/components/dashboard/organisms/SettingsPolished';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardSettingsProps {
  initialData: DashboardData;
}

export function DashboardSettings({ initialData }: DashboardSettingsProps) {
  const { flags } = useFeatureFlags();
  const [artist, setArtist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  // Note: Profile switching functionality will be implemented in the future

  if (!flags.profileSettingsEnabled) {
    return (
      <p className='text-secondary-token'>
        Profile settings aren&rsquo;t available right now.
      </p>
    );
  }

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Settings</h1>
        <p className='text-secondary-token mt-1'>
          Manage your account preferences and settings
        </p>
      </div>

      {/* Settings content */}
      <SettingsPolished artist={artist} onArtistUpdate={setArtist} />
    </div>
  );
}
