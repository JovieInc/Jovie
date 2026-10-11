import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-28T12:00:00.000Z'));
});
afterEach(() => vi.restoreAllMocks());

describe('Hud exception policy', () => {
  it('uses wall-clock age and reports stale money observations without claiming contradiction', () => {
    const metrics = healthyMetrics({
      overview: { financialDataAvailable: false },
    });
    vi.mocked(Date.now).mockReturnValue(
      GENERATED_AT_MS + HUD_SOURCE_STALE_AFTER_MS + 1
    );
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
    expect(contradiction?.label).toBe('Revenue sources disagree');
    expect(contradiction?.href).toBeTruthy();
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
