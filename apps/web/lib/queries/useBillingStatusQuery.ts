import { useQuery } from '@tanstack/react-query';
import { STANDARD_CACHE } from './cache-strategies';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

export interface BillingStatusData {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
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
  };
}

/**
 * Query hook for fetching user billing status.
 *
 * Replaces the manual useBillingStatus hook with TanStack Query benefits:
 * - Automatic caching (5 min stale time)
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
  return useQuery({
    queryKey: queryKeys.billing.status(),
    queryFn: fetchBillingStatus,
    // Use STANDARD_CACHE preset (5 min stale time) for consistent caching behavior
    ...STANDARD_CACHE,
  });
}
