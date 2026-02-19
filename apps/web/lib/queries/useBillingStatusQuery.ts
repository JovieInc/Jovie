'use client';

import { useQuery } from '@tanstack/react-query';
import { FREQUENT_CACHE } from './cache-strategies';
import { createQueryFn, FetchError } from './fetch';
import { queryKeys } from './keys';

export interface BillingStatusData {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
  stripeSubscriptionId: string | null;
}

interface BillingStatusResponse {
  isPro?: boolean;
  plan?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

// Create the base fetch function using createQueryFn for consistent error handling
const fetchBillingStatusRaw = createQueryFn<BillingStatusResponse>(
  '/api/billing/status'
);

// Transform raw response to normalized data
async function fetchBillingStatus({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<BillingStatusData> {
  const payload = await fetchBillingStatusRaw({ signal });

  return {
    isPro: Boolean(payload?.isPro),
    plan: payload?.plan ?? null,
    hasStripeCustomer: Boolean(payload?.stripeCustomerId),
    stripeSubscriptionId: payload?.stripeSubscriptionId ?? null,
  };
}

// Shared query options for billing status queries
// Exported for SSR prefetching in app shell layout
export const billingStatusQueryOptions = {
  queryKey: queryKeys.billing.status(),
  queryFn: fetchBillingStatus,
  // FREQUENT_CACHE: 1 min stale, 10 min gc - appropriate for billing data
  ...FREQUENT_CACHE,
  // Billing endpoint can return 503 when billing systems are transiently down.
  // Avoid aggressive retries/refetch loops that spam logs and backend.
  retry: (failureCount: number, error: Error) => {
    if (error instanceof FetchError && error.status === 503) {
      return false;
    }
    return failureCount < 1;
  },
  refetchOnWindowFocus: false,
} as const;

/**
 * Query hook for fetching user billing status.
 *
 * Replaces the manual useBillingStatus hook with TanStack Query benefits:
 * - Automatic caching (1 min stale time via FREQUENT_CACHE)
 * - Background refetching
 * - Deduplication of concurrent requests
 * - Optimistic UI support via queryClient
 *
 * @example
 * function BillingBadge() {
 *   const { data, isLoading, error } = useBillingStatusQuery();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage />;
 *
 *   return data?.isPro ? <ProBadge /> : null;
 * }
 */
export function useBillingStatusQuery() {
  return useQuery<BillingStatusData, Error>(billingStatusQueryOptions);
}

/**
 * Lightweight hook that only subscribes to the isPro status.
 * Components using this will only re-render when isPro changes,
 * not when other billing fields change.
 *
 * @example
 * function UpgradeButton() {
 *   const { data: isPro, isLoading } = useIsPro();
 *   if (isLoading || isPro) return null;
 *   return <Button>Upgrade to Pro</Button>;
 * }
 */
export function useIsPro() {
  return useQuery({
    ...billingStatusQueryOptions,
    select: data => data.isPro,
  });
}
