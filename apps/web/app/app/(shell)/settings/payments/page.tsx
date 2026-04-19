'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { SettingsPaymentsSection } from '@/features/dashboard/organisms/SettingsPaymentsSection';
import { SettingsSection } from '@/features/dashboard/organisms/SettingsSection';
import { useAppFlag } from '@/lib/flags/client';

export default function SettingsPaymentsPage() {
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');
  const router = useRouter();

  useEffect(() => {
    if (!isStripeConnectEnabled) {
      router.replace(APP_ROUTES.SETTINGS_BILLING);
    }
  }, [isStripeConnectEnabled, router]);

  if (!isStripeConnectEnabled) return null;

  return (
    <SettingsSection
      id='payments'
      title='Payments'
      description='Stripe payouts from fans.'
    >
      <SettingsPaymentsSection />
    </SettingsSection>
  );
}
