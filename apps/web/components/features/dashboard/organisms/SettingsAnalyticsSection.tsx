'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
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
        <SettingsToggleRow
          icon={<BarChart3 className='h-4 w-4' aria-hidden />}
          title='Exclude your own visits'
          description='Keep your own profile views and link clicks out of analytics so the numbers reflect your audience, not your testing.'
          checked={excludeSelf}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Exclude yourself from analytics'
          gated={!isPro}
          gateFeatureContext='Filter your own visits'
        />
        {isPro && excludeSelf ? (
          <ContentSurfaceCard className='flex items-start gap-3 bg-surface-0 p-3.5'>
            <BarChart3 className='mt-0.5 h-4 w-4 shrink-0 text-secondary-token' />
            <div>
              <p className='text-[13px] font-[560] tracking-[-0.02em] text-primary-token'>
                Self-filtering active
              </p>
              <p className='mt-1 text-[13px] text-secondary-token'>
                Your own profile views and link clicks are being excluded from
                your analytics.
              </p>
            </div>
          </ContentSurfaceCard>
        ) : null}
      </div>
    </SettingsPanel>
  );
}
