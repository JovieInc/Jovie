'use client';

/**
 * Pricing options query hook for fetching available Stripe pricing.
 *
 * Uses STABLE_CACHE since pricing options rarely change during a session.
 * Normalizes the dual-field API response (`pricingOptions` / `options`)
 * into a single `options` array so consumers don't need to merge.
 */

import { useQuery } from '@tanstack/react-query';
import { STABLE_CACHE } from './cache-strategies';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

/**
 * Individual pricing option from the API.
 */
export interface PricingOption {
  priceId: string;
  amount: number;
  currency: string;
  interval: string;
  description: string;
}

/**
 * Raw response from the pricing options API.
 * The API returns both fields for backwards compatibility.
 */
interface PricingOptionsRawResponse {
  pricingOptions?: PricingOption[];
  options?: PricingOption[];
}

/**
 * Normalized response with a single `options` array.
 */
export interface PricingOptionsResponse {
  options: PricingOption[];
}

const fetchPricingOptionsRaw = createQueryFn<PricingOptionsRawResponse>(
  '/api/stripe/pricing-options'
);

async function fetchPricingOptions({
  signal,
}: {
  signal?: AbortSignal;
}): Promise<PricingOptionsResponse> {
  const raw = await fetchPricingOptionsRaw({ signal });
  return {
    options: [...(raw.pricingOptions ?? []), ...(raw.options ?? [])],
  };
}

/**
 * Query hook for fetching available pricing options.
 *
 * Uses STABLE_CACHE (15 min stale) since pricing rarely changes.
 * Returns normalized `data.options` array.
 */
export function usePricingOptionsQuery() {
  return useQuery<PricingOptionsResponse, Error>({
    queryKey: queryKeys.billing.pricingOptions(),
    queryFn: fetchPricingOptions,
    ...STABLE_CACHE,
  });
}
