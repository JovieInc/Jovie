'use client';

import { CreditCardIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import * as React from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface BillingSectionProps {
  isPro: boolean;
  isLoading?: boolean;
  onBillingAction: () => void;
  className?: string;
}

export function BillingSection({
  isPro,
  isLoading = false,
  onBillingAction,
  className,
}: BillingSectionProps) {
  return (
    <DashboardCard variant='settings' className={className}>
      <div className='text-center py-4'>
        <CreditCardIcon className='mx-auto h-12 w-12 text-secondary mb-4' />
        <h3 className='text-lg font-medium text-primary mb-2'>
          Manage your plan
        </h3>
        <p className='text-sm text-secondary mb-4'>
          Update payment details, change plans, or view invoices.
        </p>
        <Button
          onClick={onBillingAction}
          disabled={isLoading}
          variant='primary'
        >
          {isLoading
            ? 'Loading...'
            : isPro
              ? 'Open Billing Portal'
              : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );
}
