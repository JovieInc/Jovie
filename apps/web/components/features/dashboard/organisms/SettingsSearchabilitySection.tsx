'use client';

// @coverage-via apps/web/tests/unit/dashboard/SettingsSearchabilitySection.test.tsx

import { Search, Shield } from 'lucide-react';
import { useCallback, useContext } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import {
  isProfileSearchable,
  isYoungAudienceProfile,
} from '@/lib/profile/public-profile-access';
import { useUpdateSettingsMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

function useFlag(
  artist: Artist,
  key: 'searchable' | 'youngAudience',
  initial: boolean,
  onArtistUpdate: ((artist: Artist) => void) | undefined,
  errorMessage: string
) {
  const updateSelectedProfileSettings =
    useContext(DashboardDataContext)?.updateSelectedProfileSettings;
  const mutation = useUpdateSettingsMutation({
    profileId: artist.id,
    silentSuccess: true,
  });
  const save = useCallback(
    async (value: boolean) => {
      await mutation.mutateAsync({ updates: { settings: { [key]: value } } });
      updateSelectedProfileSettings?.(artist.id, { [key]: value });
    },
    [artist.id, key, mutation, updateSelectedProfileSettings]
  );
  const update = useCallback(
    (value: boolean) => {
      onArtistUpdate?.({
        ...artist,
        settings: { ...artist.settings, [key]: value },
      });
    },
    [artist, key, onArtistUpdate]
  );
  return useOptimisticToggle({
    initialValue: initial,
    syncKey: `${artist.id}:${key}`,
    mutateAsync: save,
    onOptimisticUpdate: update,
    errorMessage,
    showErrorToast: false,
  });
}

export function SettingsSearchabilitySection({
  artist,
  onArtistUpdate,
}: {
  readonly artist: Artist;
  readonly onArtistUpdate?: (artist: Artist) => void;
}) {
  const discovery = useFlag(
    artist,
    'searchable',
    isProfileSearchable(artist.settings),
    onArtistUpdate,
    'Could not save discovery preference. Try again.'
  );
  const young = useFlag(
    artist,
    'youngAudience',
    isYoungAudienceProfile(artist.settings),
    onArtistUpdate,
    'Could not save young-audience preference. Try again.'
  );

  return (
    <>
      <SettingsPanel
        actions={<SettingsStatusPill status={discovery.saveStatus} />}
        bodyClassName='px-4 py-4 sm:px-5'
      >
        <SettingsToggleRow
          icon={<Search className='h-4 w-4' aria-hidden />}
          title='Show in Jovie discovery'
          description='Allow your public profile in Jovie search, directories, and featured lists. When off, anyone with your public URL can still view it, including bots.'
          checked={discovery.checked}
          onCheckedChange={discovery.handleToggle}
          busy={discovery.isPending}
          ariaLabel='Show in Jovie discovery'
        />
      </SettingsPanel>
      <SettingsPanel
        actions={<SettingsStatusPill status={young.saveStatus} />}
        bodyClassName='px-4 py-4 sm:px-5'
      >
        <SettingsToggleRow
          icon={<Shield className='h-4 w-4' aria-hidden />}
          title='Young audience'
          description='Turn off advertising pixels and retargeting on your public profile. Use this when your audience is primarily under 16.'
          checked={young.checked}
          onCheckedChange={young.handleToggle}
          busy={young.isPending}
          ariaLabel='Young audience'
        />
      </SettingsPanel>
    </>
  );
}
