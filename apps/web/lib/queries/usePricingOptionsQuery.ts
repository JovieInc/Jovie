'use client';

/**
 * Pricing options query hook for fetching available Stripe pricing.
 *
 * Uses STABLE_CACHE since pricing options rarely change during a session.
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
 * Response from the pricing options API.
 */
export interface PricingOptionsResponse {
  pricingOptions: PricingOption[];
  options: PricingOption[];
}

// Create the fetch function using createQueryFn for consistent error handling
const fetchPricingOptions = createQueryFn<PricingOptionsResponse>(
  '/api/stripe/pricing-options'
);

/**
 * Query hook for fetching available pricing options.
 *
 * Uses STABLE_CACHE (15 min stale) since pricing rarely changes.
 *
 * @example
 * ```tsx
 * function PricingDisplay() {
 *   const { data, isLoading, error } = usePricingOptionsQuery();
 *
 *   if (isLoading) return <Spinner />;
 *   if (error) return <ErrorMessage />;
 *
 *   return (
 *     <ul>
 *       {data?.pricingOptions.map(option => (
 *         <li key={option.priceId}>{option.description}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
export function usePricingOptionsQuery() {
  return useQuery<PricingOptionsResponse, Error>({
    queryKey: queryKeys.billing.pricingOptions(),
    queryFn: fetchPricingOptions,
    // STABLE_CACHE: 15 min stale, 1 hour gc - pricing rarely changes
    ...STABLE_CACHE,
  });
}
