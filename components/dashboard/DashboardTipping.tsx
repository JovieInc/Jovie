'use client';

import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardTippingProps {
  initialData: DashboardData;
}

export function DashboardTipping({ initialData }: DashboardTippingProps) {
  const [artist] = useState<Artist | null>(
    initialData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(initialData.selectedProfile)
      : null
  );
  // Note: Profile switching functionality will be implemented in the future

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  return (
    <div>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-primary-token'>Tipping</h1>
        <p className='text-secondary-token mt-1'>
          Manage your tipping settings and view your tipping history
        </p>
      </div>

      {/* Tipping content */}
      <div className='space-y-6'>
        {/* Tipping Stats */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Tipping Stats
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>
                Total Tips Received
              </p>
              <p className='text-2xl font-bold text-primary-token'>$0.00</p>
            </div>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>This Month</p>
              <p className='text-2xl font-bold text-primary-token'>$0.00</p>
            </div>
            <div className='bg-surface-2/50 rounded-lg p-4'>
              <p className='text-sm text-secondary-token'>Tip Count</p>
              <p className='text-2xl font-bold text-primary-token'>0</p>
            </div>
          </div>
        </div>

        {/* Tipping Settings */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Tipping Settings
          </h3>
          <div className='space-y-4'>
            <p className='text-secondary-token'>
              Tipping functionality is coming soon. You&apos;ll be able to
              customize your tipping experience and manage payment methods here.
            </p>
          </div>
        </div>

        {/* Recent Tips */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Recent Tips
          </h3>
          <div className='space-y-4'>
            <p className='text-secondary-token'>
              No tips received yet. When you receive tips, they&apos;ll appear
              here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
