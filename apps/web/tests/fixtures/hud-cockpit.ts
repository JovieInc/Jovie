import type { ShippingStateView } from '@/lib/ovie/shipping-state-client';
import type { HudMetrics } from '@/types/hud';

const okSource = {
  key: 'stripe',
  label: 'Stripe',
  state: 'ok' as const,
  fetchedAtIso: '2026-09-28T12:00:00.000Z',
  errorMessage: null,
  dashboardUrl: null,
  configureUrl: null,
  nextStep: null,
};

/** Healthy-company HudMetrics for cockpit stories and unit tests. */
export function cockpitMetrics(
  overrides: Record<string, unknown> = {}
): HudMetrics {
  return {
    operations: { status: 'ok', dbLatencyMs: 12 },
    reliability: { unresolvedSentryIssues24h: 0, p95LatencyMs: 40 },
    testing: {
      quarantine: { isValid: true, withinRetryBudget: true, activeCount: 0 },
    },
    deployments: { current: { status: 'success' } },
    aiOps: {
      counts: { blocked: 0, failed: 0 },
      mergeQueue: { openAgentPrs: 1 },
      blockers: [],
    },
    gbrain: { status: 'ok' },
    sources: { stripe: okSource, mercury: { ...okSource } },
    overview: {
      financialDataAvailable: true,
      defaultStatusDetail: 'Nominal',
      runwayMonths: 18,
      balanceUsd: 1_200_000,
      mrrUsd: 42_000,
      activeSubscribers: 900,
      weekAgo: null,
    },
    branding: { startupName: 'Jovie' },
    generatedAtIso: '2026-09-28T12:00:00.000Z',
    ...overrides,
  } as unknown as HudMetrics;
}

export const cockpitShipping = {
  delivery: {
    mergeQueueDepth: { value: 2 },
    inFlight: { value: 1 },
    merges: { last7Days: { value: 12 }, prior7Days: { value: 10 } },
    production: { behindMain: { value: 3 } },
  },
  ciGreen: { value: true },
} as unknown as ShippingStateView;
