'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { useAnalyticsFilterMutation } from '@/lib/queries';
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
    <SettingsPanel actions={<SettingsStatusPill status={saveStatus} />}>
      <div className='space-y-3 px-4 py-4 sm:px-5'>
        {isPro ? (
          <SettingsToggleRow
            icon={<BarChart3 className='h-4 w-4' aria-hidden />}
            title='Traffic Quality Filtering'
            description='Keep your own profile views and link clicks out of analytics so your numbers reflect real audience behavior. Likely bot traffic stays visible in Audience and is labeled for review.'
            checked={excludeSelf}
            onCheckedChange={handleToggle}
            disabled={isPending}
            ariaLabel='Toggle Traffic Quality Filtering'
          />
        ) : (
          <SettingsToggleRow
            gated
            icon={<BarChart3 className='h-4 w-4' aria-hidden />}
            title='Traffic Quality Filtering'
            description='Keep your own profile views and link clicks out of analytics so your numbers reflect real audience behavior. Likely bot traffic stays visible in Audience and is labeled for review.'
            gateFeatureContext='Traffic Quality Filtering'
          />
        )}
        {isPro && excludeSelf ? (
          <ContentSurfaceCard className='flex items-start gap-3 bg-surface-0 p-3.5'>
            <BarChart3 className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token' />
            <div>
              <p className='text-[13px] font-semibold tracking-[-0.02em] text-primary-token'>
                Traffic Quality Filtering Active
              </p>
              <p className='mt-1 text-[13px] text-secondary-token'>
                Your own profile views and link clicks are being excluded from
                your analytics. Likely bot traffic remains visible in Audience
                with a bot label so you can review it without polluting clean
                traffic decisions.
              </p>
            </div>
          </ContentSurfaceCard>
        ) : null}
      </div>
    </SettingsPanel>
  );
}
