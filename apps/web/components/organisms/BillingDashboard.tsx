'use client';

import { useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
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

export const BillingDashboard = memo(function BillingDashboard() {
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
      { label: 'Contact support', href: '/support' },
    ],
    [handleRefresh]
  );

  const handleCancelSubscription = useCallback(() => {
    track('subscription_cancel_confirmed', {
      source: 'billing_dashboard',
    });
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        notifySuccess('Your subscription has been cancelled.');
        setCancelDialogOpen(false);
        track('subscription_cancelled', {
          source: 'billing_dashboard',
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
