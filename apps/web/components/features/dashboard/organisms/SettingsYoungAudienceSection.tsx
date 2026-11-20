'use client';

// @coverage-via apps/web/components/features/dashboard/organisms/SettingsYoungAudienceSection.test.tsx

import { Shield } from 'lucide-react';
import { useCallback, useContext } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';
import { useOptimisticToggle } from '@/features/dashboard/hooks/useOptimisticToggle';
import { SettingsStatusPill } from '@/features/dashboard/molecules/SettingsStatusPill';
import { isYoungAudienceProfile } from '@/lib/profile/public-profile-access';
import { useUpdateSettingsMutation } from '@/lib/queries/useSettingsMutation';
import type { Artist } from '@/types/db';

interface SettingsYoungAudienceSectionProps {
  readonly artist: Artist;
  readonly onArtistUpdate?: (artist: Artist) => void;
}

export function SettingsYoungAudienceSection({
  artist,
  onArtistUpdate,
}: SettingsYoungAudienceSectionProps) {
  const updateSelectedProfileSettings =
    useContext(DashboardDataContext)?.updateSelectedProfileSettings;
  const mutation = useUpdateSettingsMutation({
    profileId: artist.id,
    silentSuccess: true,
  });
  const save = useCallback(
    async (youngAudience: boolean) => {
      await mutation.mutateAsync({ updates: { settings: { youngAudience } } });
      updateSelectedProfileSettings?.(artist.id, { youngAudience });
    },
    [artist.id, mutation, updateSelectedProfileSettings]
  );
  const update = useCallback(
    (youngAudience: boolean) => {
      onArtistUpdate?.({
        ...artist,
        settings: { ...artist.settings, youngAudience },
      });
    },
    [artist, onArtistUpdate]
  );
  const { checked, handleToggle, isPending, saveStatus } = useOptimisticToggle({
    initialValue: isYoungAudienceProfile(artist.settings),
    syncKey: artist.id,
    mutateAsync: save,
    onOptimisticUpdate: update,
    errorMessage: 'Could not save young-audience preference. Try again.',
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
        description='Turn off advertising pixels and retargeting on your public profile. Use this when your audience is primarily under 16.'
        checked={checked}
        onCheckedChange={handleToggle}
        busy={isPending}
        ariaLabel='Young audience'
      />
    </SettingsPanel>
  );
}
