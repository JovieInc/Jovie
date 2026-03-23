'use client';

import { SettingsAdminSection } from '@/features/dashboard/organisms/SettingsAdminSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsAdminPage() {
  return (
    <SettingsSection
      id='admin'
      title='General'
      description='Dev toolbar, waitlist controls, campaign targeting, and admin quick links.'
    >
      <SettingsAdminSection />
    </SettingsSection>
  );
}
