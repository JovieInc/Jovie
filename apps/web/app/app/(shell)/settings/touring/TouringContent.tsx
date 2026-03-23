'use client';

import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

export function TouringContent() {
  const { artist } = useSettingsContext();

  if (!artist) {
    return (
      <SettingsErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <SettingsSection
      id='touring'
      title='Touring'
      description='Connect Bandsintown to display tour dates on your profile.'
    >
      <SettingsTouringSection profileId={artist.id} />
    </SettingsSection>
  );
}
