'use client';

import { DataPrivacySection } from '@/features/dashboard/organisms/DataPrivacySection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsDataPrivacyPage() {
  return (
    <SettingsSection
      id='data-privacy'
      title='Data & Privacy'
      description='Data export and account deletion.'
    >
      <DataPrivacySection />
    </SettingsSection>
  );
}
