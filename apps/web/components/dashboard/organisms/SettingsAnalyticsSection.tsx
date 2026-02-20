'use client';

import { BarChart3 } from 'lucide-react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useAnalyticsFilterMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

export interface SettingsAnalyticsSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly isPro?: boolean;
}

export function SettingsAnalyticsSection({
  artist,
  onArtistUpdate,
  isPro = true,
}: SettingsAnalyticsSectionProps) {
  const { updateAnalyticsFilterAsync } = useAnalyticsFilterMutation();

  const {
    checked: excludeSelf,
    handleToggle,
    isPending,
  } = useOptimisticToggle({
    initialValue: artist.settings?.exclude_self_from_analytics ?? false,
    mutateAsync: updateAnalyticsFilterAsync,
    onOptimisticUpdate: onArtistUpdate
      ? enabled => {
          onArtistUpdate({
            ...artist,
            settings: {
              ...artist.settings,
              exclude_self_from_analytics: enabled,
            },
          });
        }
      : undefined,
  });

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='Exclude Yourself from Analytics'
          description='When enabled, your own visits to your profile page will not be counted in your analytics data.'
          checked={excludeSelf}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Exclude yourself from analytics'
          gated={!isPro}
        />
      </div>

      {isPro && excludeSelf && (
        <div className='px-4 py-3'>
          <div className='p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
            <div className='flex items-start gap-3'>
              <BarChart3 className='h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0' />
              <div>
                <p className='text-sm font-medium text-blue-800 dark:text-blue-200'>
                  Self-Filtering Active
                </p>
                <p className='text-xs text-blue-600 dark:text-blue-400 mt-1'>
                  Your own profile views and link clicks are being excluded from
                  your analytics.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
