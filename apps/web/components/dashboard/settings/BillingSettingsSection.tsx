'use client';

import { CreditCardIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { useBillingStatus } from '@/hooks/use-billing-status';

const BUTTON_CLASS = 'w-full sm:w-auto';

export function BillingSettingsSection() {
  const router = useRouter();
  const billingStatus = useBillingStatus();
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  const handleBilling = async () => {
    setIsBillingLoading(true);
    await router.push('/app/settings/billing');
  };

  return (
    <DashboardCard variant='settings'>
      <div className='text-center py-4'>
        <CreditCardIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
        <h3 className='text-lg font-medium text-primary mb-2'>
          Manage your plan
        </h3>
        <p className='text-sm text-secondary mb-4'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={() => void handleBilling()}
          loading={isBillingLoading || billingStatus.loading}
          className={BUTTON_CLASS}
          variant='primary'
        >
          {billingStatus.isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );
}
