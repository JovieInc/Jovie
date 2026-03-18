'use client';

import { Button } from '@jovie/ui';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';

interface BillingStateCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly detail?: string | null;
}

function BillingStateCard({
  icon,
  title,
  description,
  detail,
}: Readonly<BillingStateCardProps>) {
  return (
    <ContentSurfaceCard className='flex items-start gap-3 bg-surface-0 p-3.5'>
      <div className='mt-0.5 shrink-0'>{icon}</div>
      <div className='min-w-0 flex-1'>
        <p className='text-[13px] font-[510] text-primary-token'>{title}</p>
        <p className='mt-1 text-[13px] leading-[18px] text-secondary-token'>
          {description}
        </p>
        {detail ? (
          <p className='mt-1 text-[13px] leading-[18px] text-secondary-token'>
            {detail}
          </p>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

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
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Billing & subscription'
        subtitle='Update payment details, manage your plan, and view invoices.'
        className='min-h-0 px-4 py-3'
      />
      <div className='space-y-3 px-4 py-3'>
        <BillingStateCard
          icon={
            <CreditCard className='h-4 w-4 text-secondary-token' aria-hidden />
          }
          title={isPro ? 'Pro plan active' : 'Upgrade available'}
          description={
            isPro
              ? 'Open your Stripe billing portal to manage invoices and payment methods.'
              : 'Upgrade to Pro to unlock premium profile controls, analytics, and growth tools.'
          }
        />
        <div className='flex flex-wrap gap-2'>
          <Button
            onClick={handleBilling}
            loading={portalMutation.isPending || billingLoading || undefined}
            className='w-full sm:w-auto'
            variant='primary'
            size='sm'
          >
            {isPro ? 'Open Billing Portal' : 'Upgrade to Pro'}
          </Button>
        </div>
        {portalMutation.error && (
          <p className='text-[13px] text-destructive' role='alert'>
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : 'Failed to open billing portal'}
          </p>
        )}
      </div>
    </DashboardCard>
  );
}
