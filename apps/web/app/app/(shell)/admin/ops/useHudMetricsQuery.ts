'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { fetchWithTimeout } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import type { HudMetrics } from '@/types/hud';

const HUD_POLL_INTERVAL_MS = 30_000;
const HUD_QUERY_GC_MS = HUD_POLL_INTERVAL_MS * 2;
const HUD_METRICS_FETCH_TIMEOUT_MS = 15_000;

const hudMetricSourceTrustSchema = z
  .object({
    key: z.enum(['stripe', 'mercury', 'database', 'sentry', 'github']),
    label: z.string(),
    state: z.enum([
      'ok',
      'degraded',
      'unauthorized',
      'unavailable',
      'not_configured',
      'no_data',
    ]),
    fetchedAtIso: z.string(),
    errorMessage: z.string().nullable(),
    dashboardUrl: z.string().nullable(),
    configureUrl: z.string().nullable(),
    nextStep: z.string().nullable(),
  })
  .passthrough();

/**
 * Domain schema for `/api/hud/metrics`. Validates the structural spine so a
 * malformed payload fails as a decode error (never retried, never cached as
 * success) while additive server fields pass through.
 */
const hudMetricsSchema = z
  .object({
    accessMode: z.enum(['admin', 'kiosk']),
    branding: z
      .object({
        startupName: z.string(),
        logoUrl: z.string().nullable(),
      })
      .passthrough(),
    overview: z
      .object({
        mrrUsd: z.number(),
        activeSubscribers: z.number(),
        balanceUsd: z.number(),
        burnRateUsd: z.number(),
        runwayMonths: z.number().nullable(),
        defaultStatus: z.enum(['alive', 'dead', 'unknown']),
        defaultStatusDetail: z.string(),
        financialDataAvailable: z.boolean(),
      })
      .passthrough(),
    operations: z
      .object({
        status: z.enum(['ok', 'degraded']),
        dbLatencyMs: z.number().nullable(),
        checkedAtIso: z.string(),
      })
      .passthrough(),
    reliability: z
      .object({
        errorRatePercent: z.number(),
        reliabilityScorePercent: z.number(),
        p95LatencyMs: z.number().nullable(),
        incidents24h: z.number(),
        lastIncidentAtIso: z.string().nullable(),
        unresolvedSentryIssues24h: z.number(),
      })
      .passthrough(),
    testing: z
      .object({
        quarantine: z.object({ isValid: z.boolean() }).passthrough(),
      })
      .passthrough(),
    deployments: z
      .object({
        availability: z.enum(['available', 'not_configured', 'error']),
        current: z.unknown(),
        recent: z.array(z.unknown()),
      })
      .passthrough(),
    aiOps: z.object({ availability: z.string() }).passthrough(),
    agentRuns: z.array(z.unknown()),
    sources: z.record(z.string(), hudMetricSourceTrustSchema),
    generatedAtIso: z.string(),
  })
  .passthrough();

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
    timeout: HUD_METRICS_FETCH_TIMEOUT_MS,
    schema: {
      parse: (data: unknown) =>
        hudMetricsSchema.parse(data) as unknown as HudMetrics,
    },
  });
}

export function useHudMetricsQuery(
  initialData: HudMetrics,
  kioskToken: string | null
) {
  return useQuery<HudMetrics>({
    // Nonsecret scope: the access mode, never the raw kiosk token.
    queryKey: queryKeys.hud.metrics(kioskToken ? 'kiosk' : 'admin'),
    queryFn: ({ signal }) => fetchHudMetrics(kioskToken, signal),
    initialData,
    // Server-side generation timestamp defines initial-data freshness so the
    // poll cadence (not SSR render time) decides when the payload is stale.
    // Guard with isFinite — an epoch-0 timestamp is falsy but still valid.
    initialDataUpdatedAt: (() => {
      const parsed = Date.parse(initialData.generatedAtIso);
      return Number.isFinite(parsed) ? parsed : undefined;
    })(),
    gcTime: HUD_QUERY_GC_MS,
    refetchInterval: HUD_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    // The route already responds with Cache-Control: no-store, so the client
    // can rely on the polling cadence instead of forcing an extra no-store fetch.
    staleTime: HUD_POLL_INTERVAL_MS,
  });
}
