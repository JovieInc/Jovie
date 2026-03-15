'use client';

import { Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/components/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useBrandingSettingsMutation } from '@/lib/queries';
import type { Artist } from '@/types/db';

export interface SettingsBrandingSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (updatedArtist: Artist) => void;
  readonly isPro?: boolean;
}

export function SettingsBrandingSection({
  artist,
  onArtistUpdate,
  isPro = true,
}: SettingsBrandingSectionProps) {
  const { updateBrandingAsync } = useBrandingSettingsMutation();

  const handleOptimisticUpdate = useCallback(
    (enabled: boolean) => {
      onArtistUpdate?.({
        ...artist,
        settings: {
          ...artist.settings,
          hide_branding: enabled,
        },
      });
    },
    [artist, onArtistUpdate]
  );

  const {
    checked: hideBranding,
    handleToggle,
    isPending,
    saveStatus,
  } = useOptimisticToggle({
    initialValue: artist.settings?.hide_branding ?? false,
    mutateAsync: updateBrandingAsync,
    onOptimisticUpdate: handleOptimisticUpdate,
    errorMessage: 'Failed to update branding settings.',
  });

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Branding'
        subtitle='Control whether Jovie branding appears on your profile page.'
        className='min-h-0 px-4 py-3'
        actions={<SettingsStatusPill status={saveStatus} />}
        actionsClassName='w-auto shrink-0'
      />
      <div className='space-y-3 px-4 py-3'>
        <SettingsToggleRow
          title='Hide Jovie Branding'
          description='Remove Jovie branding from your profile page for a fully custom experience.'
          checked={hideBranding}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Hide Jovie branding'
          gated={!isPro}
        />
        {isPro && hideBranding ? (
          <ContentSurfaceCard className='flex items-center gap-3 bg-(--linear-bg-surface-0) p-3.5'>
            <Sparkles
              className='h-4 w-4 shrink-0 text-emerald-500'
              aria-hidden
            />
            <p className='text-[13px] text-emerald-600 dark:text-emerald-400'>
              Branding is hidden on your profile.
            </p>
          </ContentSurfaceCard>
        ) : null}
      </div>
    </DashboardCard>
  );
}
