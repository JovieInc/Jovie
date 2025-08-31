'use client';

import { useState } from 'react';
import type { DashboardData } from '@/app/dashboard/actions';
import { AnalyticsCards } from '@/components/dashboard/molecules/AnalyticsCards';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

interface DashboardAnalyticsProps {
  initialData: DashboardData;
}

export function DashboardAnalytics({ initialData }: DashboardAnalyticsProps) {
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
        <h1 className='text-2xl font-bold text-primary-token'>Analytics</h1>
        <p className='text-secondary-token mt-1'>
          Track your performance and audience engagement
        </p>
      </div>

      {/* Analytics content */}
      <div className='space-y-6'>
        {/* Quick stats */}
        <div className='mt-8'>
          <h2 className='text-xl font-semibold text-primary-token mb-4'>
            Performance Overview
          </h2>
          <AnalyticsCards />
        </div>

        {/* Demographics Section */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Demographics
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <h4 className='text-sm font-medium text-primary-token mb-3'>
                Age Groups
              </h4>
              <div className='space-y-2'>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>18-24</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-16 h-2 bg-surface-2 rounded-full'>
                      <div className='w-3/4 h-full bg-blue-500 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token'>
                      35%
                    </span>
                  </div>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>25-34</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-16 h-2 bg-surface-2 rounded-full'>
                      <div className='w-1/2 h-full bg-green-500 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token'>
                      28%
                    </span>
                  </div>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>35-44</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-16 h-2 bg-surface-2 rounded-full'>
                      <div className='w-1/4 h-full bg-purple-500 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token'>
                      22%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className='text-sm font-medium text-primary-token mb-3'>
                Top Countries
              </h4>
              <div className='space-y-2'>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>
                    🇺🇸 United States
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    45%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>
                    🇬🇧 United Kingdom
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    18%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>
                    🇨🇦 Canada
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    12%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>
                    🇦🇺 Australia
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    8%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
