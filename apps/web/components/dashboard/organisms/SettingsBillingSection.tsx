'use client';

import { Button } from '@jovie/ui';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { APP_ROUTES } from '@/constants/routes';
import { useBillingStatusQuery } from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsBillingSection() {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push(APP_ROUTES.SETTINGS_BILLING);
  };

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='flex items-center justify-between px-5 py-4'>
        <p className='text-sm text-secondary-token'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={handleBilling}
          loading={isBillingLoading || billingLoading}
          className={SETTINGS_BUTTON_CLASS}
          variant='primary'
          size='sm'
        >
          {billingData?.isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );
}
