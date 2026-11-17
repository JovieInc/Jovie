'use client';

/** Reads the signed-in person's price lock for client pricing surfaces. */

import type { PriceLockView } from '@/lib/billing/price-lock-view';
import { FetchError, fetchWithTimeout } from './fetch';

export { applyPriceLockToOptions } from '@/lib/billing/price-lock-view';

/** Null when there is no lock to apply; any outage fails the query. */
export async function fetchPriceLock({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<PriceLockView | null> {
  try {
    const data = await fetchWithTimeout<{ readonly priceLock: PriceLockView }>(
      '/api/billing/price-lock',
      { signal, cache: 'no-store' }
    );
    return data?.priceLock ?? null;
  } catch (error) {
    // 401: signed out. 404: this deployment has no lock endpoint yet, and its
    // checkout has no lock either. Every other failure fails the query.
    if (
      error instanceof FetchError &&
      error.kind === 'http' &&
      (error.status === 401 || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
}
