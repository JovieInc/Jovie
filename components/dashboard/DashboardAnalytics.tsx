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

        {/* Conversion Funnel Section */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <div className='flex items-center justify-between mb-6'>
            <div>
              <h3 className='text-lg font-medium text-primary-token'>
                Fan Conversion Funnel
              </h3>
              <p className='text-sm text-secondary-token mt-1'>
                Track how fans discover and engage with your music
              </p>
            </div>
            <div className='text-xs text-secondary-token bg-surface-2 px-2 py-1 rounded-full'>
              Last 30 days
            </div>
          </div>

          <div className='space-y-4'>
            {/* Profile Views */}
            <div className='flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 rounded-lg border border-blue-200/20'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>1</span>
                </div>
                <div>
                  <div className='font-semibold text-primary-token'>
                    Profile Views
                  </div>
                  <div className='text-xs text-secondary-token'>
                    Fans discover your page
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='text-xl font-bold text-primary-token'>
                  2,847
                </div>
                <div className='text-xs text-secondary-token'>
                  +12% vs last month
                </div>
              </div>
            </div>

            {/* Link Clicks */}
            <div className='flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 rounded-lg border border-green-200/20'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-green-500 rounded-full flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>2</span>
                </div>
                <div>
                  <div className='font-semibold text-primary-token'>
                    Link Clicks
                  </div>
                  <div className='text-xs text-secondary-token'>
                    Fans engage with your content
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='text-xl font-bold text-primary-token'>
                  1,924
                </div>
                <div className='text-xs text-secondary-token'>
                  67.6% conversion rate
                </div>
              </div>
            </div>

            {/* Music Streams */}
            <div className='flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 rounded-lg border border-purple-200/20'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>3</span>
                </div>
                <div>
                  <div className='font-semibold text-primary-token'>
                    Music Streams
                  </div>
                  <div className='text-xs text-secondary-token'>
                    Fans stream your music
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='text-xl font-bold text-primary-token'>
                  1,247
                </div>
                <div className='text-xs text-secondary-token'>
                  64.8% stream rate
                </div>
              </div>
            </div>
          </div>

          <div className='mt-6 p-4 bg-surface-2/50 rounded-lg'>
            <h4 className='text-sm font-medium text-primary-token mb-2'>
              Conversion Insights
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-xs'>
              <div className='text-center'>
                <div className='font-bold text-lg text-green-600 dark:text-green-400'>
                  67.6%
                </div>
                <div className='text-secondary-token'>View → Click Rate</div>
              </div>
              <div className='text-center'>
                <div className='font-bold text-lg text-purple-600 dark:text-purple-400'>
                  64.8%
                </div>
                <div className='text-secondary-token'>Click → Stream Rate</div>
              </div>
              <div className='text-center'>
                <div className='font-bold text-lg text-blue-600 dark:text-blue-400'>
                  43.8%
                </div>
                <div className='text-secondary-token'>Overall Conversion</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Performing Links */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Top Performing Links
          </h3>
          <div className='space-y-3'>
            <div className='flex items-center justify-between p-3 bg-surface-2/50 rounded-lg'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>🎵</span>
                </div>
                <div>
                  <div className='font-medium text-primary-token'>Spotify</div>
                  <div className='text-xs text-secondary-token'>
                    Music streaming
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='font-bold text-primary-token'>847 clicks</div>
                <div className='text-xs text-secondary-token'>
                  +15% this week
                </div>
              </div>
            </div>

            <div className='flex items-center justify-between p-3 bg-surface-2/50 rounded-lg'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>📷</span>
                </div>
                <div>
                  <div className='font-medium text-primary-token'>
                    Instagram
                  </div>
                  <div className='text-xs text-secondary-token'>
                    Social media
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='font-bold text-primary-token'>523 clicks</div>
                <div className='text-xs text-secondary-token'>
                  +8% this week
                </div>
              </div>
            </div>

            <div className='flex items-center justify-between p-3 bg-surface-2/50 rounded-lg'>
              <div className='flex items-center gap-3'>
                <div className='w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center'>
                  <span className='text-xs font-bold text-white'>📺</span>
                </div>
                <div>
                  <div className='font-medium text-primary-token'>YouTube</div>
                  <div className='text-xs text-secondary-token'>
                    Video content
                  </div>
                </div>
              </div>
              <div className='text-right'>
                <div className='font-bold text-primary-token'>392 clicks</div>
                <div className='text-xs text-secondary-token'>
                  +22% this week
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Demographics Section */}
        <div className='bg-surface-1 backdrop-blur-sm rounded-lg border border-subtle p-6 hover:shadow-lg hover:border-accent/10 transition-all duration-300 relative z-10'>
          <h3 className='text-lg font-medium text-primary-token mb-4'>
            Fan Demographics
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div>
              <h4 className='text-sm font-medium text-primary-token mb-3'>
                Age Groups
              </h4>
              <div className='space-y-3'>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>18-24</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-20 h-2 bg-surface-2 rounded-full'>
                      <div className='w-3/4 h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token w-8'>
                      35%
                    </span>
                  </div>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>25-34</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-20 h-2 bg-surface-2 rounded-full'>
                      <div className='w-3/5 h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token w-8'>
                      28%
                    </span>
                  </div>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>35-44</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-20 h-2 bg-surface-2 rounded-full'>
                      <div className='w-1/4 h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token w-8'>
                      22%
                    </span>
                  </div>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token'>45+</span>
                  <div className='flex items-center gap-2'>
                    <div className='w-20 h-2 bg-surface-2 rounded-full'>
                      <div className='w-1/6 h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full'></div>
                    </div>
                    <span className='text-sm font-medium text-primary-token w-8'>
                      15%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className='text-sm font-medium text-primary-token mb-3'>
                Top Countries
              </h4>
              <div className='space-y-3'>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token flex items-center gap-2'>
                    🇺🇸 United States
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    45%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token flex items-center gap-2'>
                    🇬🇧 United Kingdom
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    18%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token flex items-center gap-2'>
                    🇨🇦 Canada
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    12%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token flex items-center gap-2'>
                    🇦🇺 Australia
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    8%
                  </span>
                </div>
                <div className='flex justify-between items-center'>
                  <span className='text-sm text-secondary-token flex items-center gap-2'>
                    🇩🇪 Germany
                  </span>
                  <span className='text-sm font-medium text-primary-token'>
                    6%
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
