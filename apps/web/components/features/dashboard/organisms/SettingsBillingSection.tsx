'use client';

import { Badge, Button } from '@jovie/ui';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface BillingDetailRowProps {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'default' | 'warning' | 'error';
}

function BillingDetailRow({
  label,
  value,
  tone = 'default',
}: Readonly<BillingDetailRowProps>) {
  return (
    <div
      className={cn(
        'px-4 py-3 sm:px-5',
        tone === 'warning' && 'bg-amber-500/5',
        tone === 'error' && 'bg-destructive/5'
      )}
    >
      <p className='text-[11px] font-[560] uppercase tracking-[0.08em] text-tertiary-token'>
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-[13px] leading-[18px] text-secondary-token',
          tone === 'warning' && 'text-amber-700 dark:text-amber-300',
          tone === 'error' && 'text-destructive'
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SettingsBillingSection() {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const portalMutation = usePortalMutation();

  const isPro = billingData?.isPro ?? false;
  const hasStripeCustomer = billingData?.hasStripeCustomer ?? false;
  const isStale = billingData?.stale ?? false;
  const planLabel =
    billingData?.plan === 'growth'
      ? 'Growth'
      : billingData?.plan === 'pro'
        ? 'Pro'
        : 'Free';
  const canOpenPortal = hasStripeCustomer;
  const badgeLabel = billingLoading
    ? 'Syncing'
    : isStale
      ? 'Cached'
      : isPro
        ? 'Active'
        : canOpenPortal
          ? 'Manageable'
          : 'Free';
  const badgeVariant = billingLoading
    ? 'secondary'
    : isStale
      ? 'warning'
      : isPro
        ? 'success'
        : 'secondary';
  const summaryTitle = billingLoading ? 'Loading billing' : `${planLabel} plan`;
  const summaryDescription = billingLoading
    ? 'Checking your subscription and billing access.'
    : isPro
      ? 'Manage invoices, payment methods, and subscription details without leaving the app.'
      : canOpenPortal
        ? 'Open Stripe to review invoices, payment details, or reactivate your plan.'
        : 'Compare plans and upgrade when you are ready.';
  const primaryActionLabel = canOpenPortal
    ? 'Manage in Stripe'
    : 'Compare plans';
  const statusDescription = billingLoading
    ? 'We are verifying your current plan.'
    : isPro
      ? 'Your subscription is active and your billing profile is connected.'
      : canOpenPortal
        ? 'You have a billing profile on file and can manage it in Stripe.'
        : 'You are on the free plan and have not started a billing profile yet.';
  const portalDescription = billingLoading
    ? 'Checking portal availability.'
    : canOpenPortal
      ? 'Open payment methods, invoices, and subscription settings in Stripe.'
      : 'Plan comparison and upgrade checkout live in the billing dashboard.';

  const handleBilling = () => {
    if (billingLoading) {
      return;
    }

    if (canOpenPortal) {
      portalMutation.mutate(undefined, {
        onSuccess: data => {
          globalThis.location.href = data.url;
        },
      });
    } else {
      router.push(APP_ROUTES.BILLING);
    }
  };

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <div className='flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5'>
        <div className='flex min-w-0 items-start gap-3'>
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
            {canOpenPortal ? (
              <CreditCard
                className='h-4.5 w-4.5 text-secondary-token'
                aria-hidden
              />
            ) : (
              <Sparkles
                className='h-4.5 w-4.5 text-secondary-token'
                aria-hidden
              />
            )}
          </div>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-1.5'>
              <p className='text-[14px] font-[560] tracking-[-0.02em] text-primary-token'>
                {summaryTitle}
              </p>
              <Badge
                variant={badgeVariant}
                size='sm'
                className={cn(
                  'rounded-[6px] px-1.5 text-[10px]',
                  badgeVariant === 'secondary' &&
                    'border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token',
                  badgeVariant === 'warning' &&
                    'border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  badgeVariant === 'success' &&
                    'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                )}
              >
                {badgeLabel}
              </Badge>
            </div>
            <p className='mt-1 max-w-[46ch] text-[13px] leading-[18px] text-secondary-token'>
              {summaryDescription}
            </p>
          </div>
        </div>
        <div className='flex w-full shrink-0 sm:w-auto'>
          <Button
            onClick={handleBilling}
            loading={portalMutation.isPending || billingLoading || undefined}
            className='h-7 w-full rounded-[8px] px-2.5 text-[11px] font-[510] sm:w-auto'
            variant='secondary'
            size='sm'
          >
            {primaryActionLabel}
            {billingLoading ? null : (
              <ArrowUpRight className='h-3.5 w-3.5' aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <div className='divide-y divide-subtle/60 border-t border-(--linear-app-frame-seam)'>
        <BillingDetailRow
          label='Subscription status'
          value={statusDescription}
        />
        <BillingDetailRow label='Billing portal' value={portalDescription} />
        {isStale && billingData?.staleReason ? (
          <div className='flex items-start gap-2 px-4 py-3 text-amber-700 dark:text-amber-300 sm:px-5'>
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <div className='min-w-0'>
              <p className='text-[11px] font-[560] uppercase tracking-[0.08em] text-tertiary-token'>
                Billing status
              </p>
              <p className='mt-1 text-[13px] leading-[18px]'>
                {billingData.staleReason}
              </p>
            </div>
          </div>
        ) : null}
        {portalMutation.error ? (
          <BillingDetailRow
            label='Portal error'
            tone='error'
            value={
              portalMutation.error instanceof Error
                ? portalMutation.error.message
                : 'Failed to open billing portal'
            }
          />
        ) : null}
      </div>
    </DashboardCard>
  );
}
