'use client';

import { useQuery } from '@tanstack/react-query';
import { FREQUENT_BACKGROUND_CACHE } from './cache-strategies';
import { createQueryFn, FetchError } from './fetch';
import { queryKeys } from './keys';

export interface BillingStatusData {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
  stripeSubscriptionId: string | null;
  stale: boolean;
  staleReason: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialNotificationsSent: number;
}

interface BillingStatusResponse {
  isPro?: boolean;
  plan?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialNotificationsSent?: number;
  _stale?: boolean;
  _staleReason?: string;
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
    stale: Boolean(payload?._stale),
    staleReason: payload?._staleReason ?? null,
    trialStartedAt: payload?.trialStartedAt ?? null,
    trialEndsAt: payload?.trialEndsAt ?? null,
    trialNotificationsSent: payload?.trialNotificationsSent ?? 0,
  };
}

// Shared query options for billing status queries
// Exported for SSR prefetching in app shell layout
export const billingStatusQueryOptions = {
  queryKey: queryKeys.billing.status(),
  queryFn: fetchBillingStatus,
  // FREQUENT_BACKGROUND_CACHE (refetchOnMount:false + no focus) for shell chrome.
  // Prevents duplicate /api/billing/status calls on dashboard route transitions
  // while keeping 1m stale for freshness (JOV-2201).
  ...FREQUENT_BACKGROUND_CACHE,
  // Billing endpoint can return 503 when billing systems are transiently down.
  // Allow 1 retry with backoff for transient failures (5xx/429/408).
  // Don't retry 4xx client errors — they won't self-heal.
  retry: (failureCount: number, error: Error) => {
    if (error instanceof FetchError && !error.isRetryable()) {
      return false;
    }
    return failureCount < 1;
  },
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
} as const;

/**
 * Query hook for fetching user billing status.
 *
 * Replaces the manual useBillingStatus hook with TanStack Query benefits:
 * - Automatic caching (1 min stale via FREQUENT_BACKGROUND_CACHE for shell)
 * - Background refetching (no mount/focus spam on route transitions)
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
export function useBillingStatusQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery<BillingStatusData, Error>({
    ...billingStatusQueryOptions,
    enabled,
  });
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
