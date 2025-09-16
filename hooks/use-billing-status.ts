/**
 * Hook to get a user's billing status on the client side.
 *
 * The status is cached for a short period to avoid refetching on every menu open
 * which previously surfaced a distracting "Checking plan…" message. The cache
 * is refreshed silently in the background once it becomes stale.
 */

import { useEffect, useMemo, useState } from 'react';

export interface BillingStatus {
  isPro: boolean;
  plan: string | null;
  hasStripeCustomer: boolean;
  loading: boolean;
  error: string | null;
}

interface BillingStatusResponse {
  isPro?: boolean;
  plan?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

type CachedBillingStatus = {
  data: Omit<BillingStatus, 'loading' | 'error'>;
  error: string | null;
  fetchedAt: number;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cachedStatus: CachedBillingStatus | null = null;

const defaultData: Omit<BillingStatus, 'loading' | 'error'> = {
  isPro: false,
  plan: null,
  hasStripeCustomer: false,
};

const defaultState: BillingStatus = {
  ...defaultData,
  loading: true,
  error: null,
};

const mapResponseToState = (
  payload: BillingStatusResponse | null | undefined
): Omit<BillingStatus, 'loading' | 'error'> => ({
  isPro: Boolean(payload?.isPro),
  plan: payload?.plan ?? null,
  hasStripeCustomer: Boolean(payload?.stripeCustomerId),
});

const isCacheFresh = (cache: CachedBillingStatus | null) => {
  if (!cache) return false;
  return Date.now() - cache.fetchedAt < CACHE_TTL;
};

export const resetBillingStatusCache = () => {
  cachedStatus = null;
};

export function useBillingStatus(): BillingStatus {
  const initialState = useMemo<BillingStatus>(() => {
    if (!cachedStatus) {
      return defaultState;
    }

    return {
      ...cachedStatus.data,
      loading: false,
      error: cachedStatus.error,
    };
  }, []);

  const [status, setStatus] = useState<BillingStatus>(initialState);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const performFetch = async (showLoader: boolean) => {
      if (showLoader) {
        setStatus(prev => ({ ...prev, loading: true, error: null }));
      }

      const previousData = cachedStatus?.data ?? defaultData;

      try {
        const response = await fetch('/api/billing/status', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch billing status');
        }

        const payload = (await response.json()) as BillingStatusResponse;
        const nextData = mapResponseToState(payload);

        if (isMounted) {
          cachedStatus = {
            data: nextData,
            error: null,
            fetchedAt: Date.now(),
          };

          setStatus({
            ...nextData,
            loading: false,
            error: null,
          });
        }
      } catch (error) {
        if (controller.signal.aborted || !isMounted) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Unable to verify your plan right now.';

        cachedStatus = {
          data: previousData,
          error: message,
          fetchedAt: Date.now(),
        };

        setStatus({
          ...previousData,
          loading: false,
          error: message,
        });
      }
    };

    if (!cachedStatus) {
      void performFetch(true);
    } else if (!isCacheFresh(cachedStatus)) {
      void performFetch(false);
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  return status;
}
