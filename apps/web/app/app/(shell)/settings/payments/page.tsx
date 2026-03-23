'use client';

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';

export default function SettingsPaymentsPage() {
  const isStripeConnectEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.STRIPE_CONNECT_ENABLED
  );

  if (!isStripeConnectEnabled) {
    redirect(APP_ROUTES.SETTINGS_BILLING);
  }

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
