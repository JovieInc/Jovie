'use client';

import { Badge, Button } from '@jovie/ui';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';
import { cn } from '@/lib/utils';

function resolvePlanLabel(plan: string | null | undefined): string {
  if (plan === 'max' || plan === 'growth') return 'Max';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function resolveBadgeLabel(ctx: {
  billingLoading: boolean;
  isStale: boolean;
  isPro: boolean;
  canOpenPortal: boolean;
}): string {
  if (ctx.billingLoading) return 'Syncing';
  if (ctx.isStale) return 'Cached';
  if (ctx.isPro) return 'Active';
  if (ctx.canOpenPortal) return 'Manageable';
  return 'Free';
}

function resolveBadgeVariant(ctx: {
  billingLoading: boolean;
  isStale: boolean;
  isPro: boolean;
}): 'secondary' | 'warning' | 'success' {
  if (ctx.billingLoading) return 'secondary';
  if (ctx.isStale) return 'warning';
  if (ctx.isPro) return 'success';
  return 'secondary';
}

function resolveSummaryDescription(ctx: {
  billingLoading: boolean;
  isPro: boolean;
  canOpenPortal: boolean;
}): string {
  if (ctx.billingLoading)
    return 'Checking your subscription and billing access.';
  if (ctx.isPro)
    return 'Manage invoices, payment methods, and subscription details without leaving the app.';
  if (ctx.canOpenPortal)
    return 'Open Stripe to review invoices, payment details, or reactivate your plan.';
  return 'Compare plans and upgrade when you are ready.';
}

export function SettingsBillingSection() {
  const router = useRouter();
  const { data: billingData, isLoading: billingLoading } =
    useBillingStatusQuery();
  const portalMutation = usePortalMutation();

  const isPro = billingData?.isPro ?? false;
  const hasStripeCustomer = billingData?.hasStripeCustomer ?? false;
  const isStale = billingData?.stale ?? false;
  const planLabel = resolvePlanLabel(billingData?.plan);
  const canOpenPortal = hasStripeCustomer;
  const badgeLabel = resolveBadgeLabel({
    billingLoading,
    isStale,
    isPro,
    canOpenPortal,
  });
  const badgeVariant = resolveBadgeVariant({
    billingLoading,
    isStale,
    isPro,
  });
  const summaryTitle = billingLoading ? 'Loading billing' : `${planLabel} plan`;
  const summaryDescription = resolveSummaryDescription({
    billingLoading,
    isPro,
    canOpenPortal,
  });
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
              <CreditCard className='h-4 w-4' aria-hidden />
            ) : (
              <Sparkles className='h-4 w-4' aria-hidden />
            )
          }
          title={
            <span className='flex flex-wrap items-center gap-1.5'>
              <span>{summaryTitle}</span>
              <Badge
                variant={badgeVariant}
                size='sm'
                className={cn(
                  'rounded-md px-1.5 text-3xs',
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
            <p className='text-app leading-[18px]'>{billingData.staleReason}</p>
          </div>
        </div>
      ) : null}

      {portalMutation.error ? (
        <div className='border-t border-(--linear-app-frame-seam) px-4 py-3.5 sm:px-5'>
          <p className='text-app leading-[18px] text-destructive'>
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : 'Failed to open billing portal'}
          </p>
        </div>
      ) : null}
    </SettingsPanel>
  );
}
