import { useQuery } from '@tanstack/react-query';
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
  return useQuery<BillingStatusData>({
    queryKey: queryKeys.billing.status(),
    queryFn: fetchBillingStatus,
    // STANDARD_CACHE values inlined for type compatibility
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 30 * 60 * 1000, // 30 min
    refetchOnMount: true,
    refetchOnWindowFocus: process.env.NODE_ENV === 'production',
  });
}
