'use client';

import { SettingsBillingSection } from '@/features/dashboard/organisms/SettingsBillingSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsBillingPage() {
  return (
    <SettingsSection id='billing' title='Billing'>
      <SettingsBillingSection />
    </SettingsSection>
  );
}
