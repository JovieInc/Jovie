'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useBrandingSettingsMutation } from '@/lib/queries/useSettingsMutation';
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
  const [hideBranding, setHideBranding] = useState(
    artist.settings?.hide_branding ?? false
  );

  const { updateBrandingAsync, isPending } = useBrandingSettingsMutation();

  const handleBrandingToggle = async (enabled: boolean) => {
    // Save previous value for rollback on error
    const previousValue = hideBranding;
    const previousArtistSettings = artist.settings?.hide_branding;

    // Optimistic update
    setHideBranding(enabled);
    if (onArtistUpdate) {
      onArtistUpdate({
        ...artist,
        settings: {
          ...artist.settings,
          hide_branding: enabled,
        },
      });
    }

    try {
      await updateBrandingAsync(enabled);
    } catch {
      // Rollback on error - the hook already shows an error toast
      setHideBranding(previousValue);
      if (onArtistUpdate) {
        onArtistUpdate({
          ...artist,
          settings: {
            ...artist.settings,
            hide_branding: previousArtistSettings,
          },
        });
      }
    }
  };

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <div className='px-5 py-4'>
        <SettingsToggleRow
          title='Hide Jovie Branding'
          description='Remove Jovie branding from your profile page for a fully custom experience.'
          checked={hideBranding}
          onCheckedChange={handleBrandingToggle}
          disabled={isPending}
          ariaLabel='Hide Jovie branding'
          gated={!isPro}
        />
      </div>

      {isPro && hideBranding && (
        <div className='px-5 py-4 flex items-center gap-3'>
          <Sparkles className='h-4 w-4 text-emerald-500 shrink-0' />
          <p className='text-sm text-emerald-600 dark:text-emerald-400'>
            Branding is hidden on your profile.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}
