'use client';

import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';

export function ContactsContent() {
  const { artist } = useSettingsContext();

  if (!artist) {
    return (
      <PageErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <SettingsSection id='contacts' title='Contacts'>
      <SettingsContactsSection artist={artist} />
    </SettingsSection>
  );
}
