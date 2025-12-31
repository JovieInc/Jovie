'use client';

import { SparklesIcon } from '@heroicons/react/24/outline';
import { useRef, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { SettingsToggleRow } from '@/components/dashboard/molecules/SettingsToggleRow';
import { useOptimisticMutation } from '@/lib/hooks/useOptimisticMutation';
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

  // Capture original value before optimistic update for accurate rollback
  const originalValueRef = useRef(hideBranding);

  const { mutate: updateBrandingPreference, isLoading } =
    useOptimisticMutation({
      mutationFn: async (enabled: boolean, signal) => {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              settings: {
                hide_branding: enabled,
              },
            },
          }),
          signal,
        });

        if (!response.ok) {
          throw new Error('Failed to update branding settings');
        }

        return response.json();
      },
      onOptimisticUpdate: enabled => {
        // Capture the current value before updating
        originalValueRef.current = hideBranding;

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
      },
      onRollback: () => {
        // Restore the captured original value
        const original = originalValueRef.current;
        setHideBranding(original);

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            settings: {
              ...artist.settings,
              hide_branding: original,
            },
          });
        }
      },
      successMessage: 'Branding settings updated',
      errorMessage: 'Failed to update branding. Please try again.',
    });

  return (
    <DashboardCard variant='settings'>
      <SettingsToggleRow
        title='Hide Jovie Branding'
        description='When enabled, Jovie branding will be removed from your profile page, giving your fans a fully custom experience.'
        checked={hideBranding}
        onCheckedChange={enabled => {
          void updateBrandingPreference(enabled);
        }}
        disabled={isLoading}
        ariaLabel='Hide Jovie branding'
      />

      {hideBranding && (
        <div className='mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
          <div className='flex items-start gap-3'>
            <SparklesIcon className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0' />
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
