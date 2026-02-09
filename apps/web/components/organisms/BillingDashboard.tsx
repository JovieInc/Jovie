'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  type BillingHistoryEntry,
  queryKeys,
  useBillingHistoryQuery,
  useBillingStatusQuery,
  useCancelSubscriptionMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';

const EVENT_TYPE_LABELS: Record<string, string> = {
  'subscription.created': 'Subscription started',
  'subscription.updated': 'Subscription updated',
  'subscription.deleted': 'Subscription cancelled',
  'checkout.session.completed': 'Payment completed',
  'payment_intent.succeeded': 'Payment succeeded',
  'payment_intent.payment_failed': 'Payment failed',
  reconciliation: 'Billing reconciled',
};

function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replace(/[._]/g, ' ');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const BillingDashboard = memo(function BillingDashboard() {
  const { error: notifyError, success: notifySuccess } = useNotifications();
  const queryClient = useQueryClient();
  const notifyErrorRef = useRef(notifyError);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const billingQuery = useBillingStatusQuery();
  const pricingQuery = usePricingOptionsQuery();
  const historyQuery = useBillingHistoryQuery();
  const cancelMutation = useCancelSubscriptionMutation();

  const isLoading = billingQuery.isLoading || pricingQuery.isLoading;
  const hasError = Boolean(billingQuery.error || pricingQuery.error);

  useEffect(() => {
    notifyErrorRef.current = notifyError;
  }, [notifyError]);

  // Show error notification when queries fail
  useEffect(() => {
    if (hasError && !isLoading) {
      notifyErrorRef.current('Billing is temporarily unavailable.');
    }
  }, [hasError, isLoading]);

  const defaultPriceId = useMemo(() => {
    const pricingData = pricingQuery.data;
    if (!pricingData) return undefined;
    return (
      pricingData.pricingOptions?.[0]?.priceId ||
      pricingData.options?.[0]?.priceId
    );
  }, [pricingQuery.data]);

  // Refresh handler for error state
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

  if (isLoading) {
    return (
      <div className='animate-pulse motion-reduce:animate-none'>
        <div className='mb-4 h-8 rounded bg-muted'></div>
        <div className='mb-4 h-32 rounded bg-muted'></div>
        <div className='h-10 rounded bg-muted'></div>
      </div>
    );
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

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-3xl font-bold text-foreground'>
          Billing & Subscription
        </h1>
        <p className='mt-2 text-muted-foreground'>
          Manage your subscription and billing information
        </p>
      </div>

      {/* Subscription Status Card */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <div className='flex items-center'>
          <div className='shrink-0'>
            {billingInfo?.isPro ? (
              <CheckCircle className='h-8 w-8 text-emerald-500' />
            ) : (
              <AlertTriangle className='h-8 w-8 text-amber-500' />
            )}
          </div>
          <div className='ml-4'>
            <h3 className='text-lg font-medium text-foreground'>
              {billingInfo?.isPro
                ? 'Standard Subscription Active'
                : 'Free Plan'}
            </h3>
            <p className='text-sm text-muted-foreground'>
              {billingInfo?.isPro
                ? 'Branding is removed from your profile'
                : 'Upgrade to Standard to remove branding'}
            </p>
            {billingInfo?.stripeSubscriptionId && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Subscription ID: {billingInfo.stripeSubscriptionId}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <h3 className='mb-4 text-lg font-medium text-foreground'>
          Billing Actions
        </h3>

        <div className='space-y-4'>
          {billingInfo?.isPro ? (
            <>
              <div>
                <h4 className='mb-2 text-sm font-medium text-foreground'>
                  Manage Subscription
                </h4>
                <p className='mb-3 text-sm text-muted-foreground'>
                  Update payment methods or view invoices
                </p>
                <BillingPortalLink />
              </div>

              <div className='border-t border-border pt-4'>
                <h4 className='mb-2 text-sm font-medium text-foreground'>
                  Cancel Subscription
                </h4>
                <p className='mb-3 text-sm text-muted-foreground'>
                  Cancel your subscription. This action takes effect
                  immediately.
                </p>
                <AlertDialog
                  open={cancelDialogOpen}
                  onOpenChange={setCancelDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      variant='outline'
                      className='text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950 dark:hover:text-red-300'
                      onClick={() => {
                        track('subscription_cancel_clicked', {
                          source: 'billing_dashboard',
                        });
                      }}
                    >
                      <XCircle className='mr-2 h-4 w-4' />
                      Cancel Subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Cancel your subscription?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className='space-y-3'>
                          <p>
                            If you cancel, you will immediately lose access to
                            these features:
                          </p>
                          <ul className='space-y-2 text-sm'>
                            <li className='flex items-start gap-2'>
                              <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                              <span>
                                <strong>Branding removal</strong> &mdash; Jovie
                                branding will reappear on your profile
                              </span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                              <span>
                                <strong>Advanced analytics</strong> &mdash;
                                Retention drops from 90 days to 7 days
                              </span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                              <span>
                                <strong>Contact export</strong> &mdash; You
                                won&apos;t be able to export audience contacts
                              </span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                              <span>
                                <strong>Unlimited contacts</strong> &mdash;
                                Contact limit drops to 100
                              </span>
                            </li>
                            <li className='flex items-start gap-2'>
                              <XCircle className='mt-0.5 h-4 w-4 shrink-0 text-red-500' />
                              <span>
                                <strong>Self-filtering</strong> &mdash; Your own
                                visits will count in analytics
                              </span>
                            </li>
                          </ul>
                          <p className='text-muted-foreground'>
                            This takes effect immediately. You can re-subscribe
                            at any time.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancelSubscription}
                        disabled={cancelMutation.isPending}
                        className='bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                      >
                        {cancelMutation.isPending
                          ? 'Cancelling...'
                          : 'Yes, Cancel'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          ) : (
            <div>
              <h4 className='mb-2 text-sm font-medium text-foreground'>
                Upgrade to Standard
              </h4>
              <p className='mb-3 text-sm text-muted-foreground'>
                Remove Jovie branding from your profile
              </p>
              <UpgradeButton priceId={defaultPriceId} />
            </div>
          )}
        </div>
      </div>

      {/* Features Overview */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <h3 className='mb-4 text-lg font-medium text-foreground'>
          {billingInfo?.isPro ? 'Your Current Features' : 'Standard Features'}
        </h3>
        <ul className='space-y-2 text-sm text-muted-foreground'>
          <li className='flex items-center'>
            <CheckCircle className='mr-2 h-4 w-4 text-emerald-500' />
            Remove Jovie branding
          </li>
          <li className='flex items-center'>
            <CheckCircle className='mr-2 h-4 w-4 text-emerald-500' />
            90-day analytics retention
          </li>
          <li className='flex items-center'>
            <CheckCircle className='mr-2 h-4 w-4 text-emerald-500' />
            Export audience contacts
          </li>
          <li className='flex items-center'>
            <CheckCircle className='mr-2 h-4 w-4 text-emerald-500' />
            Unlimited contacts
          </li>
          <li className='flex items-center'>
            <CheckCircle className='mr-2 h-4 w-4 text-emerald-500' />
            Filter your own visits from analytics
          </li>
        </ul>
      </div>

      {/* Billing History */}
      <div className='rounded-lg border border-border bg-muted/30 p-6'>
        <h3 className='mb-4 text-lg font-medium text-foreground'>
          Billing History
        </h3>
        {historyQuery.isLoading ? (
          <div className='animate-pulse motion-reduce:animate-none space-y-3'>
            <div className='h-10 rounded bg-muted'></div>
            <div className='h-10 rounded bg-muted'></div>
            <div className='h-10 rounded bg-muted'></div>
          </div>
        ) : historyQuery.data?.entries &&
          historyQuery.data.entries.length > 0 ? (
          <div className='space-y-3'>
            {historyQuery.data.entries.map((entry: BillingHistoryEntry) => (
              <div
                key={entry.id}
                className='flex items-start justify-between border-b border-border pb-3 last:border-0 last:pb-0'
              >
                <div className='flex items-start gap-3'>
                  <Clock className='mt-0.5 h-4 w-4 shrink-0 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium text-foreground'>
                      {formatEventType(entry.eventType)}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {entry.source === 'webhook' ? 'Via Stripe' : entry.source}
                    </p>
                  </div>
                </div>
                <p className='shrink-0 text-xs text-muted-foreground'>
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>
            No billing history yet.
          </p>
        )}
      </div>
    </div>
  );
});
