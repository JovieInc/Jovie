import { describe, expect, it } from 'vitest';
import { deriveOvieCompanyOverview } from '@/lib/ovie/company-operations';
import type { HudMetrics } from '@/types/hud';

const NOW = Date.parse('2026-08-22T18:01:00.000Z');

function buildMetrics(
  overrides: Partial<HudMetrics['overview']> = {}
): HudMetrics {
  return {
    overview: {
      mrrUsd: 5200,
      activeSubscribers: 42,
      balanceUsd: 100_000,
      burnRateUsd: 30_000,
      runwayMonths: 4,
      defaultStatus: 'alive',
      defaultStatusDetail: 'Runway covers the profitability horizon.',
      financialDataAvailable: true,
      ...overrides,
    },
    sources: {
      stripe: {
        key: 'stripe',
        label: 'Stripe',
        state: 'ok',
        fetchedAtIso: '2026-08-22T18:00:00.000Z',
        errorMessage: null,
        dashboardUrl: 'https://dashboard.stripe.com/',
        configureUrl: null,
        nextStep: null,
      },
      mercury: {
        key: 'mercury',
        label: 'Mercury',
        state: 'ok',
        fetchedAtIso: '2026-08-22T18:00:00.000Z',
        errorMessage: null,
        dashboardUrl: 'https://app.mercury.com/',
        configureUrl: null,
        nextStep: null,
      },
    },
    aiOps: {
      counts: {
        blocked: 0,
        failed: 0,
      },
    },
    generatedAtIso: '2026-08-22T18:00:00.000Z',
  } as HudMetrics;
}

describe('deriveOvieCompanyOverview', () => {
  it('returns exactly the three default CEO answers in invariant order', () => {
    const overview = deriveOvieCompanyOverview(buildMetrics(), NOW);

    expect(overview.metrics.map(metric => metric.id)).toEqual([
      'company-survival',
      'primary-outcome',
      'dogfood-receipts',
    ]);
    expect(overview.metrics[0]).toMatchObject({
      value: 'Alive',
      state: 'fresh',
      owner: 'Summer',
    });
    expect(overview.metrics[0].detail).toContain('7-day outflow pace');
    expect(overview.metrics[0].detail).toContain(
      'weekly recurring revenue run rate'
    );
  });

  it('does not invent a week-over-week result or count merges as dogfood', () => {
    const overview = deriveOvieCompanyOverview(buildMetrics(), NOW);

    expect(overview.metrics[1]).toMatchObject({
      value: 'Not Measured',
      state: 'disconnected',
      observedAt: 'Not observed',
    });
    expect(overview.metrics[2]).toMatchObject({
      value: 'Not Measured',
      state: 'disconnected',
    });
    expect(overview.metrics[2].detail).toContain(
      'Merges, green CI, and deploys do not count'
    );
  });

  it('fails closed when Mercury burn is degraded instead of displaying zero', () => {
    const metrics = buildMetrics({
      burnRateUsd: 0,
      runwayMonths: null,
      defaultStatus: 'unknown',
      financialDataAvailable: false,
      defaultStatusDetail:
        'Cannot calculate status: Mercury transaction window unavailable.',
    });
    metrics.sources.mercury = {
      ...metrics.sources.mercury,
      state: 'degraded',
      errorMessage: 'Mercury transaction window timed out.',
    };

    const overview = deriveOvieCompanyOverview(metrics, NOW);

    expect(overview.metrics[0]).toMatchObject({
      value: 'Unknown',
      state: 'degraded',
    });
    expect(overview.metrics[0].detail).not.toContain('$0 7-day outflow');
  });

  it('surfaces source authorization failures explicitly', () => {
    const metrics = buildMetrics({
      financialDataAvailable: false,
      defaultStatus: 'unknown',
    });
    metrics.sources.stripe = {
      ...metrics.sources.stripe,
      state: 'unavailable',
      errorMessage: 'Stripe API error (401): unauthorized',
    };

    expect(deriveOvieCompanyOverview(metrics, NOW).metrics[0].state).toBe(
      'unauthorized'
    );
  });

  it('keeps stale last-known financials visibly stale', () => {
    const metrics = buildMetrics();
    metrics.sources.stripe = {
      ...metrics.sources.stripe,
      fetchedAtIso: '2026-08-22T17:50:00.000Z',
    };

    const survival = deriveOvieCompanyOverview(metrics, NOW).metrics[0];
    expect(survival.value).toBe('Alive');
    expect(survival.state).toBe('stale');
  });
});
