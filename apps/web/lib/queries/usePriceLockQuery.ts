'use client';

/**
 * The signed-in person's price lock. Every client price surface reads the
 * price from here (directly or through usePricingOptionsQuery), never from
 * the list price constants.
 */

import { useQuery } from '@tanstack/react-query';
import type { PriceLockView } from '@/lib/billing/price-lock-view';
import { STABLE_CACHE } from './cache-strategies';
import { FetchHttpError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { createClassifiedRetry } from './retry-policy';

interface PriceLockResponse {
  readonly priceLock: PriceLockView;
}

/** Null for a signed-out visitor (401); anything else fails the query. */
export async function fetchPriceLock({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<PriceLockView | null> {
  try {
    const data = await fetchWithTimeout<PriceLockResponse>(
      '/api/billing/price-lock',
      { signal, cache: 'no-store' }
    );
    return data.priceLock;
  } catch (error) {
    if (error instanceof FetchHttpError && error.status === 401) return null;
    throw error;
  }
}

export const priceLockQueryOptions = {
  get queryKey() {
    return queryKeys.billing.priceLock();
  },
  queryFn: fetchPriceLock,
  ...STABLE_CACHE,
  retry: createClassifiedRetry(0),
};

export function usePriceLockQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  return useQuery<PriceLockView | null, Error>({
    ...priceLockQueryOptions,
    enabled,
  });
}
