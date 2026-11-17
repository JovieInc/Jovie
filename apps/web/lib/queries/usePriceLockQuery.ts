'use client';
import {
  applyPriceLockToOptions,
  type PriceLockView,
} from '@/lib/billing/price-lock-view';
import { createQueryFn, FetchError, fetchWithTimeout } from './fetch';
import type {
  PricingOptionsRawResponse,
  PricingOptionsResponse,
} from './usePricingOptionsQuery';

type PricingFetchContext = { signal?: AbortSignal };
/** Null when there is no lock to apply; any outage fails the query. */
export async function fetchPriceLock({
  signal,
}: PricingFetchContext): Promise<PriceLockView | null> {
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
const fetchPricingOptionsRaw = createQueryFn<PricingOptionsRawResponse>(
  '/api/stripe/pricing-options'
);

export async function fetchPricingOptions({
  signal,
}: PricingFetchContext): Promise<PricingOptionsResponse> {
  const [raw, priceLock] = await Promise.all([
    fetchPricingOptionsRaw({ signal }),
    fetchPriceLock({ signal }),
  ]);
  return {
    options: applyPriceLockToOptions(
      [...(raw.pricingOptions ?? []), ...(raw.options ?? [])],
      priceLock
    ),
    priceLock,
  };
}
