'use client';

import { Button } from '@jovie/ui';

import { useRouter } from 'next/navigation';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';
import { APP_ROUTES } from '@/constants/routes';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';

const SETTINGS_BUTTON_CLASS = 'w-full sm:w-auto';

export function SettingsBillingSection() {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const portalMutation = usePortalMutation();

  const isPro = billingData?.isPro ?? false;

  const handleBilling = () => {
    if (isPro) {
      portalMutation.mutate(undefined, {
        onSuccess: data => {
          globalThis.location.href = data.url;
        },
      });
    } else {
      router.push(APP_ROUTES.PRICING);
    }
  };

  return (
    <DashboardCard variant='settings' padding='none'>
      <div className='flex items-center justify-between px-4 py-3'>
        <p className='text-sm text-secondary-token'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={handleBilling}
          loading={portalMutation.isPending || billingLoading}
          className={SETTINGS_BUTTON_CLASS}
          variant='primary'
          size='sm'
        >
          {isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
        </Button>
        {portalMutation.error && (
          <p className='text-sm text-destructive'>
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : 'Failed to open billing portal'}
          </p>
        )}
      </div>
    </DashboardCard>
  );
}
