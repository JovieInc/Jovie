'use client';

// @coverage-via apps/web/tests/unit/dashboard/SettingsSearchabilitySection.test.tsx

import { Search } from 'lucide-react';
import { useCallback } from 'react';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { isProfileSearchable } from '@/lib/profile/public-profile-access';
import { useUpdateSettingsMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

interface SettingsSearchabilitySectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (artist: Artist) => void;
}

export function SettingsSearchabilitySection({
  artist,
  onArtistUpdate,
}: SettingsSearchabilitySectionProps) {
  const mutation = useUpdateSettingsMutation({
    profileId: artist.id,
    silentSuccess: true,
  });
  const save = useCallback(
    (searchable: boolean) =>
      mutation.mutateAsync({ updates: { settings: { searchable } } }),
    [mutation]
  );
  const update = useCallback(
    (searchable: boolean) => {
      onArtistUpdate?.({
        ...artist,
        settings: { ...artist.settings, searchable },
      });
    },
    [artist, onArtistUpdate]
  );
  const { checked, handleToggle, isPending, saveStatus } = useOptimisticToggle({
    initialValue: isProfileSearchable(artist.settings),
    syncKey: artist.id,
    mutateAsync: save,
    onOptimisticUpdate: update,
    errorMessage: 'Could not save discovery preference. Try again.',
    showErrorToast: false,
  });

  return (
    <SettingsPanel
      actions={<SettingsStatusPill status={saveStatus} />}
      bodyClassName='px-4 py-4 sm:px-5'
    >
      <SettingsToggleRow
        icon={<Search className='h-4 w-4' aria-hidden />}
        title='Show in Jovie discovery'
        description='Allow your public profile in Jovie search, directories, and featured lists. When off, anyone with your public URL can still view it, including bots.'
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={isPending}
        ariaLabel='Show in Jovie discovery'
      />
    </SettingsPanel>
  );
}
