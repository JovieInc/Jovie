'use client';

import { useQuery } from '@tanstack/react-query';
import { STANDARD_CACHE } from './cache-strategies';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

export interface BillingHistoryEntry {
  id: string;
  eventType: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  stripeEventId: string | null;
  source: string;
  createdAt: string;
}

interface BillingHistoryResponse {
  entries: BillingHistoryEntry[];
}

const fetchBillingHistory = createQueryFn<BillingHistoryResponse>(
  '/api/billing/history'
);

/**
 * Query hook for fetching user billing history (audit log).
 *
 * Returns billing state change entries ordered by most recent first.
 * Uses STANDARD_CACHE (5 min stale) since history changes infrequently.
 */
export function useBillingHistoryQuery(enabled = true) {
  return useQuery<BillingHistoryResponse, Error>({
    queryKey: queryKeys.billing.invoices(),
    queryFn: fetchBillingHistory,
    ...STANDARD_CACHE,
    enabled,
  });
}
