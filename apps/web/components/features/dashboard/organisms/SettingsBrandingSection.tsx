'use client';

import { Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { SettingsToggleRow } from '@/features/dashboard/molecules/SettingsToggleRow';
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
    <SettingsPanel
      title='Branding'
      description='Control whether Jovie branding appears on your public profile.'
      actions={<SettingsStatusPill status={saveStatus} />}
    >
      <div className='space-y-3 px-4 py-4 sm:px-5'>
        {isPro ? (
          <SettingsToggleRow
            icon={<Sparkles className='h-4 w-4' aria-hidden />}
            title='Hide Jovie branding'
            description='Remove Jovie branding from your public profile for a more custom presentation.'
            checked={hideBranding}
            onCheckedChange={handleToggle}
            disabled={isPending}
            ariaLabel='Hide Jovie branding'
          />
        ) : (
          <SettingsToggleRow
            gated
            icon={<Sparkles className='h-4 w-4' aria-hidden />}
            title='Hide Jovie branding'
            description='Remove Jovie branding from your public profile for a more custom presentation.'
            gateFeatureContext='Remove branding'
          />
        )}
        {isPro && hideBranding ? (
          <ContentSurfaceCard className='flex items-center gap-3 bg-surface-0 p-3.5'>
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
    </SettingsPanel>
  );
}
