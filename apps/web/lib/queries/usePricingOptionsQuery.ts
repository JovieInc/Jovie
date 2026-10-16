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
import { createClassifiedRetry } from './retry-policy';

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
/**
 * Pricing is the failure the billing recovery banner exists for. The shared
 * client retry (3 more attempts, each bounded by the 10s fetch deadline)
 * keeps that banner behind the skeleton for longer than the page can show
 * it. The banner's Retry action is the retry owner, so this query does not
 * retry on its own.
 */
export const pricingOptionsQueryOptions = {
  queryFn: fetchPricingOptions,
  ...STABLE_CACHE,
  retry: createClassifiedRetry(0),
} as const;

export function usePricingOptionsQuery(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery<PricingOptionsResponse, Error>({
    ...pricingOptionsQueryOptions,
    queryKey: queryKeys.billing.pricingOptions(),
    enabled,
  });
}
