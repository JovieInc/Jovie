'use client';

import { useState } from 'react';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { SettingsPolished } from '@/components/dashboard/organisms/SettingsPolished';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

export function DashboardSettings() {
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
