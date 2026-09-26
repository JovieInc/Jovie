'use client';

import { useQuery } from '@tanstack/react-query';
import { hudMetricsResponseSchema } from '@/lib/hud/metrics-schema';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { HudMetrics } from '@/types/hud';

const HUD_POLL_INTERVAL_MS = 30_000;
const HUD_QUERY_GC_MS = HUD_POLL_INTERVAL_MS * 2;
// Metrics aggregation can span several upstream sources; give the request a
// slightly longer per-attempt deadline than the 10s transport default.
const HUD_REQUEST_TIMEOUT_MS = 15_000;

async function fetchHudMetrics(
  kioskToken: string | null,
  signal: AbortSignal
): Promise<HudMetrics> {
  const url = new URL('/api/hud/metrics', globalThis.location.origin);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }

  // Canonical transport (JOV-6184): end-to-end deadline through body decode,
  // classified FetchError kinds, and schema validation before cache writes.
  return fetchWithTimeout<HudMetrics>(url.toString(), {
    signal,
    timeout: HUD_REQUEST_TIMEOUT_MS,
    schema: hudMetricsResponseSchema,
  });
}

export function useHudMetricsQuery(
  initialData: HudMetrics,
  kioskToken: string | null
) {
  return useQuery<HudMetrics>({
    // Scoped by access mode only; the raw kiosk token is a secret and never
    // appears in the query key, cache, or devtools.
    queryKey: queryKeys.hud.metrics(kioskToken ? 'kiosk' : 'admin'),
    queryFn: ({ signal }) => fetchHudMetrics(kioskToken, signal),
    initialData,
    // initialData arrives from the same server render, so freshness is
    // measured from hydration; the poll interval below defines staleness.
    initialDataUpdatedAt: Date.now(),
    gcTime: HUD_QUERY_GC_MS,
    refetchInterval: HUD_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    // The route already responds with Cache-Control: no-store, so the client
    // can rely on the polling cadence instead of forcing an extra no-store fetch.
    staleTime: HUD_POLL_INTERVAL_MS,
    // Retry classification comes from the provider defaults (JOV-6185):
    // this hook is the only retry owner for the HUD metrics operation.
  });
}
