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
  Badge,
  Button,
  Card,
  CardContent,
  LoadingSkeleton,
  SegmentControl,
  Separator,
  Skeleton,
} from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  Crown,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';
import { BillingPortalLink } from '@/components/molecules/BillingPortalLink';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  type BillingHistoryEntry,
  type BillingStatusData,
  type PricingOption,
  queryKeys,
  useBillingHistoryQuery,
  useBillingStatusQuery,
  useCancelSubscriptionMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINEAR_EASE = [0.16, 1, 0.3, 1] as const;

const PLAN_FEATURES = {
  free: {
    name: 'Free',
    tagline: 'Get started',
    features: [
      { label: 'Basic analytics', detail: '7-day retention' },
      { label: 'Up to 100 contacts' },
      { label: 'AI assistant', detail: '5 messages/day' },
      { label: 'Smart deep links' },
      { label: 'Auto-sync from Spotify' },
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'For growing artists',
    features: [
      { label: 'Extended analytics', detail: '90-day retention' },
      { label: 'Unlimited contacts' },
      { label: 'Remove Jovie branding' },
      { label: 'Contact export' },
      { label: 'Filter your own visits' },
      { label: 'Geographic insights' },
      { label: 'AI assistant', detail: '100 messages/day' },
    ],
  },
  growth: {
    name: 'Growth',
    tagline: 'For serious artists',
    features: [
      { label: 'Full analytics', detail: '1-year retention' },
      { label: 'Everything in Pro' },
      { label: 'AI assistant', detail: '500 messages/day' },
      { label: 'A/B testing', detail: 'Coming soon' },
      { label: 'Meta pixel integration', detail: 'Coming soon' },
      { label: 'Custom domain', detail: 'Coming soon' },
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_FEATURES;

const PLAN_KEYS: PlanKey[] = ['free', 'pro', 'growth'];

const EVENT_TYPE_LABELS: Record<string, string> = {
  'subscription.created': 'Subscription started',
  'subscription.updated': 'Subscription updated',
  'subscription.deleted': 'Subscription cancelled',
  'checkout.session.completed': 'Payment completed',
  'payment_intent.succeeded': 'Payment succeeded',
  'payment_intent.payment_failed': 'Payment failed',
  reconciliation: 'Billing reconciled',
};

const EVENT_BADGE_CONFIG: Record<
  string,
  { variant: 'success' | 'error' | 'secondary'; icon: typeof CheckCircle }
> = {
  'subscription.created': { variant: 'success', icon: CheckCircle },
  'subscription.updated': { variant: 'secondary', icon: RefreshCw },
  'subscription.deleted': { variant: 'error', icon: XCircle },
  'checkout.session.completed': { variant: 'success', icon: CheckCircle },
  'payment_intent.succeeded': { variant: 'success', icon: CheckCircle },
  'payment_intent.payment_failed': { variant: 'error', icon: AlertTriangle },
  reconciliation: { variant: 'secondary', icon: RefreshCw },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType.replaceAll(/[._]/g, ' ');
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

function getPlanDisplayName(plan: string | null): string {
  if (plan === 'growth') return 'Growth';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function findPriceForPlan(
  options: PricingOption[],
  planKey: PlanKey,
  interval: 'month' | 'year'
): PricingOption | undefined {
  return options.find(
    o =>
      o.description.toLowerCase().includes(planKey) && o.interval === interval
  );
}

// ---------------------------------------------------------------------------
// Sub-components (module-scope)
// ---------------------------------------------------------------------------

function BillingLoadingSkeleton() {
  return (
    <div className='space-y-8'>
      <div className='space-y-3'>
        <Skeleton className='h-9 w-48' rounded='md' />
        <Skeleton className='h-5 w-80' rounded='sm' />
      </div>
      <Skeleton className='h-36 w-full' rounded='lg' />
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <Skeleton className='h-80 w-full' rounded='lg' />
        <Skeleton className='h-80 w-full' rounded='lg' />
        <Skeleton className='h-80 w-full' rounded='lg' />
      </div>
      <Skeleton className='h-20 w-full' rounded='lg' />
      <div className='space-y-3'>
        <Skeleton className='h-6 w-36' rounded='sm' />
        <LoadingSkeleton lines={3} height='h-14' rounded='md' />
      </div>
    </div>
  );
}

// -- Header ----------------------------------------------------------------

function BillingHeader({ plan }: { readonly plan: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: LINEAR_EASE }}
    >
      <h1 className='text-3xl font-bold tracking-tight text-primary-token'>
        Billing
      </h1>
      <p className='mt-2 text-secondary-token'>
        Manage your {getPlanDisplayName(plan)} plan, compare options, and review
        billing history.
      </p>
    </motion.div>
  );
}

// -- Current Plan Card -----------------------------------------------------

function CurrentPlanCard({
  billingInfo,
  defaultPriceId,
}: {
  readonly billingInfo: BillingStatusData;
  readonly defaultPriceId: string | undefined;
}) {
  const isPro = billingInfo.isPro;
  const planName = getPlanDisplayName(billingInfo.plan);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05, ease: LINEAR_EASE }}
    >
      <Card
        className={cn(
          'relative overflow-hidden border-l-4',
          isPro
            ? 'border-l-emerald-500 dark:border-l-emerald-400'
            : 'border-l-amber-500 dark:border-l-amber-400'
        )}
      >
        <CardContent className='p-6'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex items-start gap-4'>
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                  isPro
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                    : 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                )}
              >
                {isPro ? (
                  <Crown className='h-6 w-6' />
                ) : (
                  <Sparkles className='h-6 w-6' />
                )}
              </div>
              <div>
                <div className='flex items-center gap-2.5'>
                  <h2 className='text-xl font-semibold text-primary-token'>
                    {planName} Plan
                  </h2>
                  <Badge variant={isPro ? 'success' : 'warning'} size='sm'>
                    {isPro ? 'Active' : 'Limited'}
                  </Badge>
                </div>
                <p className='mt-1 text-sm text-secondary-token'>
                  {isPro
                    ? 'Full access to all features. Branding removed from your profile.'
                    : 'Upgrade to unlock branding removal, extended analytics, and more.'}
                </p>
              </div>
            </div>
            <div className='shrink-0'>
              {isPro ? (
                <BillingPortalLink variant='secondary' size='sm' />
              ) : (
                <UpgradeButton priceId={defaultPriceId} size='sm' />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// -- Plan Comparison Section -----------------------------------------------

function PlanComparisonSection({
  pricingOptions,
  currentPlan,
  defaultPriceId,
}: {
  readonly pricingOptions: PricingOption[];
  readonly currentPlan: string | null;
  readonly defaultPriceId: string | undefined;
}) {
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    'month'
  );
  const activePlan = currentPlan ?? 'free';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: LINEAR_EASE }}
      className='space-y-5'
    >
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-xl font-semibold text-primary-token'>
            Compare Plans
          </h2>
          <p className='text-sm text-secondary-token'>
            Choose the plan that fits your needs
          </p>
        </div>
        <SegmentControl
          value={billingInterval}
          onValueChange={setBillingInterval}
          options={[
            { value: 'month' as const, label: 'Monthly' },
            {
              value: 'year' as const,
              label: (
                <span className='flex items-center gap-1.5'>
                  Yearly
                  <Badge variant='success' size='sm'>
                    Save 17%
                  </Badge>
                </span>
              ),
            },
          ]}
          aria-label='Billing interval'
          size='md'
        />
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {PLAN_KEYS.map(planKey => {
          const planData = PLAN_FEATURES[planKey];
          const isCurrentPlan = activePlan === planKey;
          const priceOption = findPriceForPlan(
            pricingOptions,
            planKey,
            billingInterval
          );

          const priceDisplay =
            planKey === 'free'
              ? '$0'
              : priceOption
                ? `$${(priceOption.amount / 100).toFixed(0)}`
                : null;

          const intervalLabel =
            planKey === 'free'
              ? 'forever'
              : billingInterval === 'month'
                ? '/mo'
                : '/yr';

          const hasAvailablePrice = planKey === 'free' || Boolean(priceOption);

          return (
            <Card
              key={planKey}
              className={cn(
                'relative flex flex-col transition-shadow duration-200',
                isCurrentPlan && 'ring-2 ring-[var(--color-accent)] shadow-md'
              )}
            >
              {isCurrentPlan && (
                <div className='absolute -top-3 left-1/2 z-10 -translate-x-1/2'>
                  <Badge variant='primary' size='sm'>
                    Current Plan
                  </Badge>
                </div>
              )}

              <CardContent className='flex flex-1 flex-col p-6'>
                {/* Plan header */}
                <div>
                  <h3 className='text-lg font-semibold text-primary-token'>
                    {planData.name}
                  </h3>
                  <p className='text-sm text-tertiary-token'>
                    {planData.tagline}
                  </p>
                </div>

                {/* Price */}
                <div className='mt-4 flex items-baseline gap-1'>
                  {priceDisplay !== null ? (
                    <>
                      <span className='text-3xl font-bold text-primary-token'>
                        {priceDisplay}
                      </span>
                      <span className='text-sm text-secondary-token'>
                        {intervalLabel}
                      </span>
                    </>
                  ) : (
                    <span className='text-sm font-medium text-tertiary-token'>
                      Coming soon
                    </span>
                  )}
                </div>

                {/* CTA */}
                <div className='mt-5'>
                  {isCurrentPlan ? (
                    <Button variant='secondary' className='w-full' disabled>
                      <Check className='mr-2 h-4 w-4' />
                      Current Plan
                    </Button>
                  ) : planKey !== 'free' && hasAvailablePrice ? (
                    <UpgradeButton
                      priceId={priceOption?.priceId ?? defaultPriceId}
                      className='w-full'
                      variant={planKey === 'pro' ? 'primary' : 'secondary'}
                    >
                      Upgrade to {planData.name}
                    </UpgradeButton>
                  ) : planKey !== 'free' && !hasAvailablePrice ? (
                    <Button variant='secondary' className='w-full' disabled>
                      Coming Soon
                    </Button>
                  ) : null}
                </div>

                {/* Feature list */}
                <Separator className='my-5' />
                <ul className='flex-1 space-y-3'>
                  {planData.features.map(feature => (
                    <li
                      key={feature.label}
                      className='flex items-start gap-2.5 text-sm'
                    >
                      <Check className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400' />
                      <span className='text-secondary-token'>
                        {feature.label}
                        {'detail' in feature && feature.detail && (
                          <span className='ml-1 text-tertiary-token'>
                            ({feature.detail})
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}

// -- Billing Actions (Pro users only) --------------------------------------

function BillingActionsSection({
  cancelDialogOpen,
  setCancelDialogOpen,
  handleCancelSubscription,
  cancelMutationPending,
}: {
  readonly cancelDialogOpen: boolean;
  readonly setCancelDialogOpen: (open: boolean) => void;
  readonly handleCancelSubscription: () => void;
  readonly cancelMutationPending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: LINEAR_EASE }}
    >
      <Card>
        <CardContent className='p-6'>
          <h2 className='mb-4 text-lg font-semibold text-primary-token'>
            Manage Subscription
          </h2>
          <div className='flex flex-col gap-3 sm:flex-row'>
            <BillingPortalLink variant='secondary' size='sm'>
              <CreditCard className='mr-2 h-4 w-4' />
              Payment &amp; Invoices
            </BillingPortalLink>

            <AlertDialog
              open={cancelDialogOpen}
              onOpenChange={setCancelDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/10'
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
                  <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className='space-y-3'>
                      <p>
                        If you cancel, you will immediately lose access to these
                        features:
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
                            <strong>Unlimited contacts</strong> &mdash; Contact
                            limit drops to 100
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
                      <p className='text-secondary-token'>
                        This takes effect immediately. You can re-subscribe at
                        any time.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelSubscription}
                    disabled={cancelMutationPending}
                    className='bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
                  >
                    {cancelMutationPending ? 'Cancelling...' : 'Yes, Cancel'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// -- Billing History -------------------------------------------------------

function BillingHistorySection({
  historyQuery,
}: {
  readonly historyQuery: ReturnType<typeof useBillingHistoryQuery>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2, ease: LINEAR_EASE }}
      className='space-y-4'
    >
      <h2 className='text-lg font-semibold text-primary-token'>
        Billing History
      </h2>

      {historyQuery.isLoading && (
        <Card>
          <CardContent className='p-6'>
            <LoadingSkeleton lines={4} height='h-12' rounded='md' />
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading && historyQuery.error && (
        <Card>
          <CardContent className='p-6'>
            <p className='text-sm text-tertiary-token'>
              Unable to load billing history.
            </p>
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading &&
        !historyQuery.error &&
        (historyQuery.data?.entries && historyQuery.data.entries.length > 0 ? (
          <Card>
            <CardContent className='p-0'>
              <div className='divide-y divide-[var(--color-border-subtle)]'>
                {historyQuery.data.entries.map((entry: BillingHistoryEntry) => {
                  const config = EVENT_BADGE_CONFIG[entry.eventType];
                  const IconComponent = config?.icon ?? Clock;
                  const badgeVariant = config?.variant ?? 'secondary';

                  return (
                    <div
                      key={entry.id}
                      className='flex items-center justify-between px-6 py-4 transition-colors hover:bg-[var(--color-interactive-hover)]'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2'>
                          <IconComponent className='h-4 w-4 text-secondary-token' />
                        </div>
                        <div>
                          <p className='text-sm font-medium text-primary-token'>
                            {formatEventType(entry.eventType)}
                          </p>
                          <Badge
                            variant={badgeVariant}
                            size='sm'
                            className='mt-0.5'
                          >
                            {entry.source === 'webhook'
                              ? 'Stripe'
                              : entry.source}
                          </Badge>
                        </div>
                      </div>
                      <time className='shrink-0 text-xs text-tertiary-token'>
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className='p-8 text-center'>
              <Clock className='mx-auto h-8 w-8 text-tertiary-token' />
              <p className='mt-3 text-sm text-secondary-token'>
                No billing events yet.
              </p>
              <p className='mt-1 text-xs text-tertiary-token'>
                Events will appear here as your subscription activity changes.
              </p>
            </CardContent>
          </Card>
        ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

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

  const pricingOptions = useMemo(() => {
    const data = pricingQuery.data;
    if (!data) return [];
    return [...(data.pricingOptions ?? []), ...(data.options ?? [])];
  }, [pricingQuery.data]);

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
