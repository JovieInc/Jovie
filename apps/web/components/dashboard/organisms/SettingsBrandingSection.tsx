'use client';

import { Sparkles } from 'lucide-react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useOptimisticToggle } from '@/components/dashboard/hooks/useOptimisticToggle';
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
  const { updateBrandingAsync } = useBrandingSettingsMutation();

  const {
    checked: hideBranding,
    handleToggle,
    isPending,
  } = useOptimisticToggle({
    initialValue: artist.settings?.hide_branding ?? false,
    mutateAsync: updateBrandingAsync,
    onOptimisticUpdate: onArtistUpdate
      ? enabled => {
          onArtistUpdate({
            ...artist,
            settings: {
              ...artist.settings,
              hide_branding: enabled,
            },
          });
        }
      : undefined,
  });

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      <div className='px-4 py-3'>
        <SettingsToggleRow
          title='Hide Jovie Branding'
          description='Remove Jovie branding from your profile page for a fully custom experience.'
          checked={hideBranding}
          onCheckedChange={handleToggle}
          disabled={isPending}
          ariaLabel='Hide Jovie branding'
          gated={!isPro}
        />
      </div>

      {isPro && hideBranding && (
        <div className='px-4 py-3 flex items-center gap-3'>
          <Sparkles className='h-4 w-4 text-emerald-500 shrink-0' />
          <p className='text-sm text-emerald-600 dark:text-emerald-400'>
            Branding is hidden on your profile.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}
