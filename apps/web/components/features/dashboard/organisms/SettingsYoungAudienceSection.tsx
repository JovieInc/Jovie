'use client';

import { Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { useUpdateSettingsMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

export function SettingsYoungAudienceSection({
  artist,
  onArtistUpdate,
}: {
  readonly artist: Artist;
  readonly onArtistUpdate?: (artist: Artist) => void;
}) {
  const router = useRouter();
  const mutation = useUpdateSettingsMutation({
    profileId: artist.id,
    silentSuccess: true,
  });
  const save = useCallback(
    async (youngAudience: boolean) => {
      await mutation.mutateAsync({ updates: { youngAudience } });
      router.refresh();
    },
    [mutation, router]
  );
  const update = useCallback(
    (youngAudience: boolean) => {
      onArtistUpdate?.({ ...artist, young_audience: youngAudience });
    },
    [artist, onArtistUpdate]
  );
  const { checked, handleToggle, isPending, saveStatus } = useOptimisticToggle({
    initialValue: artist.young_audience === true,
    syncKey: artist.id,
    mutateAsync: save,
    onOptimisticUpdate: update,
    errorMessage: 'Could not save audience preference. Try again.',
    showErrorToast: false,
  });
  return (
    <SettingsPanel
      actions={<SettingsStatusPill status={saveStatus} />}
      bodyClassName='px-4 py-4 sm:px-5'
    >
      <SettingsToggleRow
        icon={<Shield className='h-4 w-4' aria-hidden />}
        title='Young audience'
        description='Turn off third-party advertising and analytics tracking on your public pages.'
        checked={checked}
        onCheckedChange={handleToggle}
        busy={isPending}
        ariaLabel='Young audience'
      />
    </SettingsPanel>
  );
}
