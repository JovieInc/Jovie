'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useBrandingSettingsMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

export interface SettingsBrandingSectionProps {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
}

export function SettingsBrandingSection({
  artist,
  onArtistUpdate,
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
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Hide Jovie Branding'
        description='When enabled, Jovie branding will be removed from your profile page, giving your fans a fully custom experience.'
        checked={hideBranding}
        onCheckedChange={handleBrandingToggle}
        disabled={isPending}
        ariaLabel='Hide Jovie branding'
      />

      {hideBranding && (
        <div className='mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
          <div className='flex items-start gap-3'>
            <Sparkles className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0' />
            <div>
              <p className='text-sm font-medium text-green-800 dark:text-green-200'>
                Branding Hidden
              </p>
              <p className='text-xs text-green-600 dark:text-green-400 mt-1'>
                Your profile now shows a completely custom experience without
                Jovie branding.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
