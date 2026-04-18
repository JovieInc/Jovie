'use client';

import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { SettingsTouringSection } from '@/features/dashboard/organisms/SettingsTouringSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';

export function TouringContent() {
  const { artist } = useSettingsContext();

  if (!artist) {
    return (
      <PageErrorState message='Unable to load your profile settings. Please refresh the page.' />
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
