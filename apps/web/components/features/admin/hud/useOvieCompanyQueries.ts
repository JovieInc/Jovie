'use client';

import { useQuery } from '@tanstack/react-query';
import type { CompanyFunnelInput } from '@/lib/ovie/home/company-hud';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import type { HudMetrics } from '@/types/hud';

const METRICS_POLL_MS = 30_000;
const FUNNEL_POLL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The company numbers Home shows besides shipping and decisions: Stripe and
 * Mercury through the existing HUD metrics route, and the founder funnel for
 * the last 7 days. Both are existing, authorized routes; this adds no endpoint
 * and polls no faster than Ops already does.
 */
export function useOvieCompanyQueries() {
  const metrics = useQuery<HudMetrics>({
    queryKey: ['ovie', 'home', 'hud-metrics'],
    queryFn: ({ signal }) =>
      fetchWithTimeout<HudMetrics>('/api/hud/metrics', {
        signal,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    refetchInterval: METRICS_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: METRICS_POLL_MS,
    retry: false,
  });
  const funnel = useQuery<CompanyFunnelInput>({
    queryKey: ['ovie', 'home', 'funnel-7d'],
    queryFn: ({ signal }) =>
      fetchWithTimeout<CompanyFunnelInput>(
        '/api/admin/hud/founder-funnel?range=7d',
        { signal, timeout: REQUEST_TIMEOUT_MS }
      ),
    refetchInterval: FUNNEL_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: FUNNEL_POLL_MS,
    retry: false,
  });
  return { metrics, funnel };
}
