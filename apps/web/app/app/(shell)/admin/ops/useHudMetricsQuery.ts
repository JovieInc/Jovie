'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { HudMetrics } from '@/types/hud';

const HUD_POLL_INTERVAL_MS = 30_000;
const HUD_QUERY_GC_MS = HUD_POLL_INTERVAL_MS * 2;
const HUD_REQUEST_DEADLINE_MS = 15_000;

/**
 * Structural validation for the HUD metrics payload (JOV-6185).
 * Asserts the required top-level contract so malformed responses are
 * classified as decode failures (never retried, never cached).
 */
const hudMetricsResponseSchema = z.looseObject({
  accessMode: z.enum(['admin', 'kiosk']),
  branding: z.looseObject({}),
  overview: z.looseObject({}),
  operations: z.looseObject({}),
  reliability: z.looseObject({}),
  testing: z.looseObject({}),
  deployments: z.looseObject({}),
  aiOps: z.looseObject({}),
  agentRuns: z.array(z.unknown()),
  sources: z.record(z.string(), z.unknown()),
  generatedAtIso: z.string(),
});

const hudMetricsSchema = {
  parse(data: unknown): HudMetrics {
    return hudMetricsResponseSchema.parse(data) as unknown as HudMetrics;
  },
};

/**
 * Nonsecret access scope for the query key. The raw kiosk token is a
 * credential — it is sent on the request but never embedded in cache keys,
 * logs, or diagnostics.
 */
function hudScope(kioskToken: string | null): 'admin' | 'kiosk' {
  return kioskToken ? 'kiosk' : 'admin';
}

async function fetchHudMetrics(
  kioskToken: string | null,
  signal: AbortSignal
): Promise<HudMetrics> {
  const url = new URL('/api/hud/metrics', globalThis.location.origin);
  if (kioskToken) {
    url.searchParams.set('kiosk', kioskToken);
  }

  return fetchWithTimeout<HudMetrics>(url.toString(), {
    signal,
    timeout: HUD_REQUEST_DEADLINE_MS,
    schema: hudMetricsSchema,
  });
}

export function useHudMetricsQuery(
  initialData: HudMetrics,
  kioskToken: string | null
) {
  // Initial data freshness: the payload's server-side generation time.
  const initialDataUpdatedAt = Date.parse(initialData.generatedAtIso);

  return useQuery<HudMetrics>({
    queryKey: queryKeys.hud.metrics(hudScope(kioskToken)),
    queryFn: ({ signal }) => fetchHudMetrics(kioskToken, signal),
    initialData,
    ...(Number.isNaN(initialDataUpdatedAt) ? {} : { initialDataUpdatedAt }),
    gcTime: HUD_QUERY_GC_MS,
    refetchInterval: HUD_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    // The route already responds with Cache-Control: no-store, so the client
    // can rely on the polling cadence instead of forcing an extra no-store fetch.
    staleTime: HUD_POLL_INTERVAL_MS,
  });
}
