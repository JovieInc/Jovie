'use client';

import { useQuery } from '@tanstack/react-query';
import type { HudMetrics } from '@/types/hud';

const HUD_METRICS_KEY = ['hud', 'metrics'] as const;
const HUD_POLL_INTERVAL_MS = 30_000;
const HUD_QUERY_GC_MS = HUD_POLL_INTERVAL_MS * 2;

async function fetchHudMetrics(
  kioskToken: string | null,
  signal: AbortSignal
): Promise<HudMetrics> {
  const url = new URL('/api/hud/metrics', globalThis.location.origin);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HUD metrics fetch failed (${response.status})`);
  }
  return response.json();
}

export function useHudMetricsQuery(
  initialData: HudMetrics,
  kioskToken: string | null
) {
  return useQuery<HudMetrics>({
    queryKey: [...HUD_METRICS_KEY, kioskToken],
    queryFn: ({ signal }) => fetchHudMetrics(kioskToken, signal),
    initialData,
    gcTime: HUD_QUERY_GC_MS,
    refetchInterval: HUD_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    // The route already responds with Cache-Control: no-store, so the client
    // can rely on the polling cadence instead of forcing an extra no-store fetch.
    staleTime: HUD_POLL_INTERVAL_MS,
  });
}
