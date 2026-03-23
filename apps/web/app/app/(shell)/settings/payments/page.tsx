'use client';

import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';

export default function SettingsPaymentsPage() {
  return (
    <SettingsSection
      id='payments'
      title='Payments'
      description='Connect Stripe to receive payments from fans.'
    >
      <SettingsPaymentsSection />
    </SettingsSection>
  );
}
