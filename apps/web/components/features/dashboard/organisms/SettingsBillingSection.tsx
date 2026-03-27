'use client';

import { Badge, Button } from '@jovie/ui';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SettingsActionRow } from '@/components/features/dashboard/molecules/SettingsActionRow';
import { SettingsPanel } from '@/components/features/dashboard/molecules/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
    <SettingsPanel>
      <div className='px-4 sm:px-5'>
        <SettingsActionRow
          icon={
            canOpenPortal ? (
              <CreditCard className='h-4.5 w-4.5' aria-hidden />
            ) : (
              <Sparkles className='h-4.5 w-4.5' aria-hidden />
            )
          }
          title={
            <span className='flex flex-wrap items-center gap-1.5'>
              <span>{summaryTitle}</span>
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
            </span>
          }
          description={summaryDescription}
          action={
            <Button
              onClick={handleBilling}
              loading={portalMutation.isPending || billingLoading || undefined}
              className='h-7 rounded-[8px] px-2.5 text-[11px] font-[510]'
              variant='secondary'
              size='sm'
            >
              {primaryActionLabel}
              {billingLoading ? null : (
                <ArrowUpRight className='h-3.5 w-3.5' aria-hidden />
              )}
            </Button>
          }
        />
      </div>

      {isStale && billingData?.staleReason ? (
        <div className='border-t border-(--linear-app-frame-seam) px-4 py-3.5 sm:px-5'>
          <div className='flex items-start gap-2 text-amber-700 dark:text-amber-300'>
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <p className='text-[13px] leading-[18px]'>
              {billingData.staleReason}
            </p>
          </div>
        </div>
      ) : null}

      {portalMutation.error ? (
        <div className='border-t border-(--linear-app-frame-seam) px-4 py-3.5 sm:px-5'>
          <p className='text-[13px] leading-[18px] text-destructive'>
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : 'Failed to open billing portal'}
          </p>
        </div>
      ) : null}
    </SettingsPanel>
  );
}
