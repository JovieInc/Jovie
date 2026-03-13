'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Analytics filtering'
        subtitle='Control whether your own visits are excluded from profile analytics.'
        className='min-h-0 px-4 py-3'
        actions={<SettingsStatusPill status={saveStatus} />}
        actionsClassName='w-auto shrink-0'
      />
      <div className='space-y-3 px-4 py-3'>
        <SettingsToggleRow
          title='Exclude Yourself from Analytics'
          description='When enabled, your own visits to your profile page will not be counted in your analytics data.'
          checked={excludeSelf}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Exclude yourself from analytics'
          gated={!isPro}
        />
        {isPro && excludeSelf ? (
          <ContentSurfaceCard className='flex items-start gap-3 bg-(--linear-bg-surface-0) p-3.5'>
            <BarChart3 className='h-4 w-4 text-secondary-token mt-0.5 shrink-0' />
            <div>
              <p className='text-[13px] font-[510] text-primary-token'>
                Self-Filtering Active
              </p>
              <p className='text-[13px] text-secondary-token mt-1'>
                Your own profile views and link clicks are being excluded from
                your analytics.
              </p>
            </div>
          </ContentSurfaceCard>
        ) : null}
      </div>
    </DashboardCard>
  );
}
