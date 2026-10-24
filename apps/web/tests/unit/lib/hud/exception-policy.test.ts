import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { deriveOpsExceptions } from '@/lib/hud/cockpit';
import { HUD_SOURCE_STALE_AFTER_MS } from '@/lib/hud/source-trust';
import type { HudMetricSourceTrust, HudMetrics } from '@/types/hud';

const GENERATED_AT = '2026-09-28T12:00:00.000Z';
const GENERATED_AT_MS = Date.parse(GENERATED_AT);

function okSource(
  key: string,
  label: string,
  overrides: Record<string, unknown> = {}
): HudMetricSourceTrust {
  return {
    key,
    label,
    state: 'ok',
    fetchedAtIso: GENERATED_AT,
    errorMessage: null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
    ...overrides,
  } as HudMetricSourceTrust;
}

function healthyMetrics(overrides: Record<string, unknown> = {}): HudMetrics {
  return {
    overview: { financialDataAvailable: true },
    operations: { status: 'ok', dbLatencyMs: 12 },
    reliability: {
      unresolvedSentryIssues24h: 0,
      p95LatencyMs: 40,
      errorRatePercent: 0.1,
      reliabilityScorePercent: 99.9,
      incidents24h: 0,
      lastIncidentAtIso: null,
    },
    testing: {
      quarantine: { isValid: true, withinRetryBudget: true, activeCount: 0 },
    },
    deployments: {
      availability: 'available',
      current: { status: 'success', branch: 'main', url: null },
      recent: [],
    },
    aiOps: {
      availability: 'available',
      counts: {
        queued: 0,
        running: 1,
        blocked: 0,
        review: 0,
        done: 0,
        failed: 0,
        stale: 0,
      },
      mergeQueue: {
        openAgentPrs: 0,
        openAgentPrThreshold: 8,
        pressure: 'normal',
      },
      blockers: [],
    },
    gbrain: { status: 'ok', version: '1.0.0' },
    sources: {
      stripe: okSource('stripe', 'Stripe'),
      mercury: okSource('mercury', 'Mercury'),
      database: okSource('database', 'PostgreSQL'),
      sentry: okSource('sentry', 'Sentry'),
      github: okSource('github', 'GitHub'),
    },
    generatedAtIso: GENERATED_AT,
    ...overrides,
  } as unknown as HudMetrics;
}

function labels(metrics: HudMetrics): string[] {
  return deriveOpsExceptions(metrics).map(entry => entry.label);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(GENERATED_AT_MS);
});
afterEach(() => vi.useRealTimers());

describe('Hud exception policy', () => {
  it.each([
    ['degraded', 'Sentry is degraded'],
    ['unauthorized', 'Sentry is needs re-authorization'],
    ['unavailable', 'Sentry is unreachable'],
    ['not_configured', 'Sentry is not connected'],
    ['no_data', 'Sentry is reporting no data'],
  ])(
    'source state %s surfaces as "%s" with its next step and dashboard',
    (state, label) => {
      const metrics = healthyMetrics();
      metrics.sources.sentry = okSource('sentry', 'Sentry', {
        state,
        nextStep: 'Rotate the token.',
        errorMessage: 'HTTP 500',
        dashboardUrl: 'https://sentry.example',
      });
      expect(deriveOpsExceptions(metrics)).toEqual([
        {
          id: 'source-sentry',
          label,
          detail: 'Rotate the token.',
          href: 'https://sentry.example',
        },
      ]);
    }
  );

  it('falls back to the source error message when there is no next step', () => {
    const metrics = healthyMetrics();
    metrics.sources.github = okSource('github', 'GitHub', {
      state: 'unavailable',
      errorMessage: 'HTTP 502',
    });
    expect(deriveOpsExceptions(metrics)).toEqual([
      {
        id: 'source-github',
        label: 'GitHub is unreachable',
        detail: 'HTTP 502',
        href: null,
      },
    ]);
  });

  it('describes a stale ok source by its observation age unless a next step exists', () => {
    const metrics = healthyMetrics();
    metrics.sources.sentry = okSource('sentry', 'Sentry', {
      fetchedAtIso: new Date(GENERATED_AT_MS - 6 * 60_000).toISOString(),
      dashboardUrl: 'https://sentry.example',
    });
    metrics.sources.github = okSource('github', 'GitHub', {
      fetchedAtIso: new Date(GENERATED_AT_MS - 2 * 60 * 60_000).toISOString(),
      nextStep: 'Re-run the GitHub sync.',
    });
    expect(deriveOpsExceptions(metrics)).toEqual([
      {
        id: 'source-stale-sentry',
        label: 'Sentry data is stale',
        detail: 'Last observed 6 min ago',
        href: 'https://sentry.example',
      },
      {
        id: 'source-stale-github',
        label: 'GitHub data is stale',
        detail: 'Re-run the GitHub sync.',
        href: null,
      },
    ]);
  });

  it('keeps an ok source fresh exactly at the staleness budget', () => {
    const metrics = healthyMetrics();
    metrics.sources.sentry = okSource('sentry', 'Sentry', {
      fetchedAtIso: new Date(
        GENERATED_AT_MS - HUD_SOURCE_STALE_AFTER_MS
      ).toISOString(),
    });
    expect(deriveOpsExceptions(metrics)).toEqual([]);
  });

  it('does not report a future-dated observation as stale', () => {
    const metrics = healthyMetrics();
    metrics.sources.sentry = okSource('sentry', 'Sentry', {
      fetchedAtIso: new Date(GENERATED_AT_MS + 60_000).toISOString(),
    });
    expect(deriveOpsExceptions(metrics)).toEqual([]);
  });

  it('uses wall-clock age and reports stale money observations without claiming contradiction', () => {
    const metrics = healthyMetrics({
      overview: { financialDataAvailable: false },
    });
    vi.setSystemTime(GENERATED_AT_MS + HUD_SOURCE_STALE_AFTER_MS + 1);
    const ids = deriveOpsExceptions(metrics).map(entry => entry.id);
    expect(ids).toContain('source-stale-stripe');
    expect(ids).toContain('source-stale-mercury');
    expect(ids).not.toContain('money-sources-contradiction');
  });
  it('false-green: an ok-but-stale source still surfaces instead of passing as healthy', () => {
    const metrics = healthyMetrics();
    metrics.sources.stripe = okSource('stripe', 'Stripe', {
      fetchedAtIso: new Date(
        GENERATED_AT_MS - HUD_SOURCE_STALE_AFTER_MS - 60_000
      ).toISOString(),
    });

    const exceptions = deriveOpsExceptions(metrics);
    expect(exceptions.map(entry => entry.id)).toContain('source-stale-stripe');
    expect(labels(metrics)).not.toHaveLength(0);
  });

  it('stale: reports when the observation aged past the freshness budget', () => {
    const metrics = healthyMetrics();
    metrics.sources.sentry = okSource('sentry', 'Sentry', {
      fetchedAtIso: new Date(
        GENERATED_AT_MS - HUD_SOURCE_STALE_AFTER_MS - 1
      ).toISOString(),
    });

    const stale = deriveOpsExceptions(metrics).find(
      entry => entry.id === 'source-stale-sentry'
    );
    expect(stale?.label).toBe('Sentry data is stale');
    expect(stale?.detail).toContain('Last observed');
  });

  it('unauthorized: a source needing re-authorization is an exception', () => {
    const metrics = healthyMetrics();
    metrics.sources.github = okSource('github', 'GitHub', {
      state: 'unauthorized',
      nextStep: 'Check GitHub API credentials and retry.',
    });

    expect(labels(metrics)).toContain('GitHub is needs re-authorization');
  });

  it('disconnected: a not-configured source is an exception, not a green card', () => {
    const metrics = healthyMetrics();
    metrics.sources.mercury = okSource('mercury', 'Mercury', {
      state: 'not_configured',
      nextStep: 'Add MERCURY_API_TOKEN to load runway.',
    });

    expect(labels(metrics)).toContain('Mercury is not connected');
  });

  it('degraded: degraded operations and sources surface in plain language', () => {
    const metrics = healthyMetrics({
      operations: { status: 'degraded', dbLatencyMs: 240 },
    });
    metrics.sources.sentry = okSource('sentry', 'Sentry', {
      state: 'degraded',
    });

    const result = labels(metrics);
    expect(result).toContain('Database is degraded');
    expect(result).toContain('Sentry is degraded');
  });

  it('contradiction: sources claiming ok while financial data is unavailable are flagged', () => {
    const metrics = healthyMetrics({
      overview: { financialDataAvailable: false },
    });

    const contradiction = deriveOpsExceptions(metrics).find(
      entry => entry.id === 'money-sources-contradiction'
    );
    expect(contradiction).toEqual({
      id: 'money-sources-contradiction',
      label: 'Revenue sources disagree',
      detail:
        'Stripe and Mercury report healthy but financial data is unavailable',
      href: APP_ROUTES.ADMIN_OPERATIONS,
    });
  });

  it('does not claim a contradiction when financial availability is unknown', () => {
    const metrics = healthyMetrics({ overview: undefined });
    expect(deriveOpsExceptions(metrics)).toEqual([]);
  });

  it('does not claim a contradiction unless both money sources are fresh', () => {
    const metrics = healthyMetrics({
      overview: { financialDataAvailable: false },
    });
    metrics.sources.mercury = okSource('mercury', 'Mercury', {
      fetchedAtIso: new Date(GENERATED_AT_MS + 60_000).toISOString(),
    });
    expect(deriveOpsExceptions(metrics)).toEqual([]);
  });

  it('does not flag contradiction when a money source is already honest about failure', () => {
    const metrics = healthyMetrics({
      overview: { financialDataAvailable: false },
    });
    metrics.sources.stripe = okSource('stripe', 'Stripe', {
      state: 'unavailable',
    });

    const ids = deriveOpsExceptions(metrics).map(entry => entry.id);
    expect(ids).not.toContain('money-sources-contradiction');
    expect(ids).toContain('source-stripe');
  });

  it('recovery: exceptions clear once sources report fresh healthy observations', () => {
    const degraded = healthyMetrics({
      operations: { status: 'degraded', dbLatencyMs: 240 },
    });
    degraded.sources.stripe = okSource('stripe', 'Stripe', {
      state: 'unauthorized',
    });
    expect(deriveOpsExceptions(degraded).length).toBeGreaterThan(0);

    const recovered = healthyMetrics();
    expect(deriveOpsExceptions(recovered)).toEqual([]);
  });
});
