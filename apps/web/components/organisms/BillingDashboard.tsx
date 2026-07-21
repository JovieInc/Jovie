'use client';

import { QueryClientContext, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ErrorBanner } from '@/features/feedback/ErrorBanner';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  queryKeys,
  useBillingHistoryQuery,
  useBillingStatusQuery,
  useCancelSubscriptionMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';
import { BillingActionsSection } from './billing/BillingActionsSection';
import { BillingHeader } from './billing/BillingHeader';
import { BillingHistorySection } from './billing/BillingHistorySection';
import { BillingLoadingSkeleton } from './billing/BillingLoadingSkeleton';
import { CurrentPlanCard } from './billing/CurrentPlanCard';
import { PlanComparisonSection } from './billing/PlanComparisonSection';

const BillingDashboardContent = memo(function BillingDashboardContent() {
  const { error: notifyError, success: notifySuccess } = useNotifications();
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const billingQuery = useBillingStatusQuery();
  const pricingQuery = usePricingOptionsQuery();
  const historyQuery = useBillingHistoryQuery();
  const cancelMutation = useCancelSubscriptionMutation();

  const isLoading = billingQuery.isLoading || pricingQuery.isLoading;
  const hasError = Boolean(billingQuery.error || pricingQuery.error);

  useEffect(() => {
    if (hasError && !isLoading) {
      notifyError('Billing is temporarily unavailable.');
    }
  }, [hasError, isLoading, notifyError]);

  const defaultPriceId = pricingQuery.data?.options[0]?.priceId;

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
  }, [queryClient]);

  const errorActions = useMemo(
    () => [
      { label: 'Retry', onClick: handleRefresh },
      { label: 'Contact Support', href: '/support' },
    ],
    [handleRefresh]
  );

  const handleCancelSubscription = useCallback(() => {
    track('subscription_cancel_confirmed', {
      source: 'billing_dashboard',
    });
    cancelMutation.mutate(undefined, {
      onSuccess: response => {
        // Cancellation is scheduled at end of current billing period (JOV-2180).
        // Surface the cancel-on date when Stripe returns it; otherwise fall
        // back to a generic period-end message.
        const cancelAtMs = response?.cancelAt
          ? Date.parse(response.cancelAt)
          : Number.NaN;
        const message = Number.isFinite(cancelAtMs)
          ? `Pro access continues until ${new Date(
              cancelAtMs
            ).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })} — cancellation scheduled.`
          : 'Pro access continues until the end of your billing period — cancellation scheduled.';
        notifySuccess(message);
        setCancelDialogOpen(false);
        track('subscription_cancelled', {
          source: 'billing_dashboard',
          cancelAtPeriodEnd: response?.cancelAtPeriodEnd === true,
        });
      },
    });
  }, [cancelMutation, notifySuccess]);

  const pricingOptions = pricingQuery.data?.options ?? [];

  if (isLoading) {
    return <BillingLoadingSkeleton />;
  }

  if (hasError) {
    return (
      <ErrorBanner
        title='Billing is temporarily unavailable'
        description='We could not load your billing details. Please retry or visit the portal once the connection is restored.'
        actions={errorActions}
        testId='billing-error-state'
      />
    );
  }

  const billingInfo = billingQuery.data;
  const currentPlan = billingInfo?.plan ?? 'free';

  return (
    <div className='space-y-8'>
      {billingInfo?.stale && (
        <ContentSurfaceCard
          className='flex items-start gap-2 border-[color-mix(in_oklab,var(--linear-warning)_32%,var(--app-shell-frame-seam))] bg-[color-mix(in_oklab,var(--linear-warning)_10%,var(--app-shell-content-surface))] px-4 py-3 text-app text-primary-token'
          surface='nested'
        >
          <AlertCircle
            className='mt-0.5 h-4 w-4 shrink-0 text-(--linear-warning)'
            aria-hidden='true'
          />
          <p>
            {billingInfo.staleReason ??
              'Billing details are temporarily unavailable. Displaying your latest saved status.'}
          </p>
        </ContentSurfaceCard>
      )}

      <BillingHeader plan={currentPlan} />

      {billingInfo && (
        <CurrentPlanCard
          billingInfo={billingInfo}
          defaultPriceId={defaultPriceId}
        />
      )}

      <PlanComparisonSection
        pricingOptions={pricingOptions}
        currentPlan={currentPlan}
        defaultPriceId={defaultPriceId}
      />

      {billingInfo?.isPro && (
        <BillingActionsSection
          cancelDialogOpen={cancelDialogOpen}
          setCancelDialogOpen={setCancelDialogOpen}
          handleCancelSubscription={handleCancelSubscription}
          cancelMutationPending={cancelMutation.isPending}
        />
      )}

      <BillingHistorySection historyQuery={historyQuery} />
    </div>
  );
});

export const BillingDashboard = memo(function BillingDashboard() {
  const queryClient = useContext(QueryClientContext);

  if (!queryClient) {
    return (
      <QueryProvider>
        <BillingDashboardContent />
      </QueryProvider>
    );
  }

  return <BillingDashboardContent />;
});
