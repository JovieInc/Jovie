'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback } from 'react';
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
      <div className='px-4 py-4 sm:px-5'>
        {isPro ? (
          <SettingsToggleRow
            icon={<BarChart3 className='h-4 w-4' aria-hidden />}
            title='Traffic Quality Filtering'
            description={excludeSelf ? 'High quality only' : 'All traffic'}
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
            description='All traffic'
            gateFeatureContext='Traffic Quality Filtering'
          />
        )}
      </div>
    </SettingsPanel>
  );
}
