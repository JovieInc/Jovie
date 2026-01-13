'use client';

import { Button } from '@jovie/ui';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useBillingStatusQuery } from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsBillingSection() {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push('/app/settings/billing');
  };

  return (
    <DashboardCard variant='settings'>
      <div className='text-center py-4'>
        <CreditCard className='mx-auto h-12 w-12 text-secondary mb-4' />
        <h3 className='text-lg font-medium text-primary mb-2'>
          Manage your plan
        </h3>
        <p className='text-sm text-secondary mb-4'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={handleBilling}
          loading={isBillingLoading || billingLoading}
          className={SETTINGS_BUTTON_CLASS}
          variant='primary'
        >
          {billingData?.isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );
}
