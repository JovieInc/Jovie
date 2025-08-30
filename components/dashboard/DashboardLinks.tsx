'use client';

import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { flags } from '@/lib/env';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { SocialsForm } from './organisms';

interface DashboardLinksProps {
  initialData: DashboardData;
}

export function DashboardLinks({ initialData }: DashboardLinksProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  // Note: Profile switching functionality will be implemented in the future

  if (!artist || !flags.feature_social_links) {
    return null; // Feature disabled or artist missing
  }

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Manage Links</h1>
        <p className='text-secondary-token mt-1'>
          Add and manage your social and streaming links
        </p>
      </div>

      {/* Links content */}
      <div className='space-y-6'>
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Your Links
          </h3>
          <SocialsForm artist={artist} />
        </div>
      </div>
    </div>
  );
}
