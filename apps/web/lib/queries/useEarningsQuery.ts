'use client';

/**
 * TanStack Query hook for fetching earnings / tipping data.
 *
 * Fetches tip statistics and the recent tippers list from the
 * `/api/dashboard/earnings` endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { FREQUENT_CACHE } from './cache-strategies';
import { createQueryFn } from './fetch';
import { queryKeys } from './keys';

export interface EarningsStats {
  totalRevenueCents: number;
  totalTips: number;
  averageTipCents: number;
}

export interface TipperRow {
  id: string;
  tipperName: string | null;
  contactEmail: string | null;
  amountCents: number;
  createdAt: string;
}

export interface EarningsResponse {
  stats: EarningsStats;
  tippers: TipperRow[];
}

const fetchEarnings = createQueryFn<EarningsResponse>(
  '/api/dashboard/earnings'
);

export function useEarningsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.earnings.stats(),
    queryFn: fetchEarnings,
    enabled,
    ...FREQUENT_CACHE,
    refetchOnMount: false,
  });
}
