'use client';

import { SettingsErrorState } from '@/features/dashboard/molecules/SettingsErrorState';
import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useSettingsContext } from '@/features/dashboard/organisms/useSettingsContext';

export function ContactsContent() {
  const { artist } = useSettingsContext();

  if (!artist) {
    return (
      <SettingsErrorState message='Unable to load your profile settings. Please refresh the page.' />
    );
  }

  return (
    <SettingsSection
      id='contacts'
      title='Contacts'
      description='Manage bookings, management, and press contacts.'
    >
      <SettingsContactsSection artist={artist} />
    </SettingsSection>
  );
}
