'use client';

import { Badge, Button } from '@jovie/ui';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { useBillingStatusQuery, usePortalMutation } from '@/lib/queries';

function resolvePlanLabel(plan: string | null | undefined): string {
  return getPlanDisplayName(plan);
}

function resolveBadgeLabel(ctx: {
  billingLoading: boolean;
  billingUnavailable: boolean;
  isStale: boolean;
  isPro: boolean;
  canOpenPortal: boolean;
}): string {
  if (ctx.billingUnavailable) return 'Unavailable';
  if (ctx.billingLoading) return 'Syncing';
  if (ctx.isStale) return 'Cached';
  if (ctx.isPro) return 'Active';
  if (ctx.canOpenPortal) return 'Manageable';
  return 'Free';
}

function resolveBadgeVariant(ctx: {
  billingLoading: boolean;
  billingUnavailable: boolean;
  isStale: boolean;
  isPro: boolean;
}): 'secondary' | 'warning' | 'success' {
  if (ctx.billingUnavailable) return 'warning';
  if (ctx.billingLoading) return 'secondary';
  if (ctx.isStale) return 'warning';
  if (ctx.isPro) return 'success';
  return 'secondary';
}

function resolveSummaryDescription(ctx: {
  billingLoading: boolean;
  billingUnavailable: boolean;
  isPro: boolean;
  canOpenPortal: boolean;
}): string {
  if (ctx.billingUnavailable) return "We couldn't load your plan. Try again.";
  if (ctx.billingLoading)
    return 'Checking your subscription and billing access.';
  if (ctx.isPro)
    return 'Open Stripe to manage invoices, payment methods, and subscription details.';
  if (ctx.canOpenPortal)
    return 'Open Stripe to review invoices, payment details, or reactivate your plan.';
  return 'Compare plans and upgrade when you are ready.';
}

export function SettingsBillingSection() {
  const router = useRouter();
  const {
    data: billingData,
    isLoading: billingLoading,
    isError: billingError,
    isFetching: billingFetching,
    refetch: refetchBilling,
  } = useBillingStatusQuery();
  const portalMutation = usePortalMutation();
  const [retrying, setRetrying] = useState(false);

  const billingUnavailable =
    retrying || billingError || (!billingLoading && !billingData);
  const retryPending = retrying || (billingUnavailable && billingFetching);
  const isPro = billingData?.isPro ?? false;
  const hasStripeCustomer = billingData?.hasStripeCustomer ?? false;
  const isStale = billingData?.stale ?? false;
  const planLabel = resolvePlanLabel(billingData?.plan);
  const canOpenPortal = hasStripeCustomer;
  const badgeLabel = resolveBadgeLabel({
    billingLoading,
    billingUnavailable,
    isStale,
    isPro,
    canOpenPortal,
  });
  const badgeVariant = resolveBadgeVariant({
    billingLoading,
    billingUnavailable,
    isStale,
    isPro,
  });
  const summaryTitle = billingUnavailable
    ? 'Billing unavailable'
    : billingLoading
      ? 'Loading billing'
      : `${planLabel} plan`;
  const summaryDescription = resolveSummaryDescription({
    billingLoading,
    billingUnavailable,
    isPro,
    canOpenPortal,
  });
  const primaryActionLabel = billingUnavailable
    ? 'Retry billing'
    : canOpenPortal
      ? 'Manage in Stripe'
      : 'Compare plans';

  const handleBilling = async () => {
    if (billingLoading || retryPending) {
      return;
    }

    if (billingUnavailable) {
      setRetrying(true);
      try {
        await refetchBilling();
      } finally {
        setRetrying(false);
      }
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
    <SettingsPanel bodyClassName='px-4 sm:px-5'>
      <SettingsActionRow
        icon={
          canOpenPortal ? (
            <CreditCard className='h-4 w-4' aria-hidden />
          ) : (
            <Sparkles className='h-4 w-4' aria-hidden />
          )
        }
        title={
          // Reserve the longest states so async recovery cannot move this row.
          <span className='grid'>
            <span
              aria-hidden
              className='invisible col-start-1 row-start-1 flex flex-wrap items-center gap-1.5'
            >
              Billing unavailable
              <Badge variant='warning' size='sm'>
                Unavailable
              </Badge>
            </span>
            <span className='col-start-1 row-start-1 flex flex-wrap items-start gap-1.5'>
              <span>{summaryTitle}</span>
              <Badge variant={badgeVariant} size='sm'>
                {retryPending ? 'Syncing' : badgeLabel}
              </Badge>
            </span>
          </span>
        }
        description={
          <span className='grid'>
            <span aria-hidden className='invisible col-start-1 row-start-1'>
              Open Stripe to manage your invoices, payment methods, and
              subscription details.
            </span>
            <span className='col-start-1 row-start-1'>
              {retryPending
                ? 'Checking your subscription and billing access.'
                : summaryDescription}
            </span>
          </span>
        }
        action={
          <Button
            onClick={handleBilling}
            loading={
              portalMutation.isPending ||
              (billingLoading && !retryPending) ||
              undefined
            }
            aria-disabled={retryPending || undefined}
            aria-busy={retryPending || undefined}
            variant='secondary'
            size='sm'
          >
            <span className='grid'>
              <span
                aria-hidden
                className='invisible col-start-1 row-start-1 inline-flex items-center gap-1.5'
              >
                Manage in Stripe
                <ArrowUpRight className='h-3.5 w-3.5' />
              </span>
              <span className='col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5'>
                {primaryActionLabel}
                {billingLoading || billingUnavailable ? null : (
                  <ArrowUpRight className='h-3.5 w-3.5' aria-hidden />
                )}
              </span>
            </span>
          </Button>
        }
      />

      {isStale && billingData?.staleReason ? (
        <div className='-mx-4 border-t border-subtle px-4 py-3.5 sm:-mx-5 sm:px-5'>
          <div className='flex items-start gap-2 text-warning'>
            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' aria-hidden />
            <p className='text-app leading-[18px]'>{billingData.staleReason}</p>
          </div>
        </div>
      ) : null}

      {portalMutation.error ? (
        <div className='-mx-4 border-t border-subtle px-4 py-3.5 sm:-mx-5 sm:px-5'>
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
