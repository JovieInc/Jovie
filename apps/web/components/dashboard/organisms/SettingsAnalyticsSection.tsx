'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
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

  const handleOptimisticUpdate = useCallback(
    (enabled: boolean) => {
      onArtistUpdate?.({
        ...artist,
        settings: {
          ...artist.settings,
          exclude_self_from_analytics: enabled,
        },
      });
    },
    [artist, onArtistUpdate]
  );

  const {
    checked: excludeSelf,
    handleToggle,
    isPending,
    saveStatus,
  } = useOptimisticToggle({
    initialValue: artist.settings?.exclude_self_from_analytics ?? false,
    mutateAsync: updateAnalyticsFilterAsync,
    onOptimisticUpdate: handleOptimisticUpdate,
    errorMessage: 'Failed to update analytics filter.',
  });

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <SettingsStatusPill status={saveStatus} className='px-4 pt-3' />
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
          <div className='flex items-start gap-3'>
            <BarChart3 className='h-4 w-4 text-secondary-token mt-0.5 shrink-0' />
            <div>
              <p className='text-sm font-medium text-primary-token'>
                Self-Filtering Active
              </p>
              <p className='text-xs text-secondary-token mt-1'>
                Your own profile views and link clicks are being excluded from
                your analytics.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
