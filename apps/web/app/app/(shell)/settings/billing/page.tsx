'use client';

import { SettingsBillingSection } from '@/features/dashboard/organisms/SettingsBillingSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsBillingPage() {
  return (
    <SettingsSection
      id='billing'
      title='Billing'
      description='Manage your plan, payment methods, and invoices.'
    >
      <SettingsBillingSection />
    </SettingsSection>
  );
}
