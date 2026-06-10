import { describe, expect, it } from 'vitest';
import {
  buildHudMetricSources,
  formatSourceFreshness,
  HUD_SOURCE_STALE_AFTER_MS,
  isHudMetricValueAvailable,
  isSourceStale,
} from '@/lib/hud/source-trust';

const fetchedAtIso = '2026-06-08T12:00:00.000Z';

function buildInput(
  overrides: Partial<Parameters<typeof buildHudMetricSources>[0]> = {}
) {
  return {
    stripe: {
      mrrUsd: 1000,
      activeSubscribers: 10,
      mrrUsd30dAgo: 900,
      mrrGrowth30dUsd: 100,
      isConfigured: true,
      isAvailable: true,
    },
    mercury: {
      balanceUsd: 5000,
      burnRateUsd: 2000,
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: true,
      defaultStatus: 'alive' as const,
    },
    sentry: {
      unresolvedIssues24h: 2,
      totalEvents24h: 10,
      impactedUsers24h: 1,
      criticalIssues24h: 0,
      topIssueTitle: null,
      topIssueShortId: null,
      isConfigured: true,
      isAvailable: true,
    },
    operations: {
      status: 'ok' as const,
      dbLatencyMs: 12,
      checkedAtIso: fetchedAtIso,
    },
    deployments: {
      availability: 'available' as const,
      current: null,
      recent: [
        {
          id: 1,
          runNumber: 42,
          status: 'success' as const,
          createdAtIso: fetchedAtIso,
          branch: 'main',
          url: 'https://github.com/JovieInc/Jovie/actions/runs/1',
        },
      ],
    },
    fetchedAtIso,
    sentryOrgSlug: 'jovie',
    githubOwner: 'JovieInc',
    githubRepo: 'Jovie',
    ...overrides,
  };
}

describe('source-trust freshness helpers', () => {
  it('formats sub-minute freshness as just now', () => {
    const now = Date.parse(fetchedAtIso) + 30_000;
    expect(formatSourceFreshness(fetchedAtIso, now)).toBe('just now');
  });

  it('marks sources stale after the configured threshold', () => {
    const now = Date.parse(fetchedAtIso) + HUD_SOURCE_STALE_AFTER_MS + 1;
    expect(isSourceStale(fetchedAtIso, now)).toBe(true);
  });
});

describe('buildHudMetricSources', () => {
  it('builds ok states with outbound dashboard links', () => {
    const sources = buildHudMetricSources(buildInput());

    expect(sources.stripe.state).toBe('ok');
    expect(sources.stripe.dashboardUrl).toBe('https://dashboard.stripe.com/');
    expect(sources.mercury.dashboardUrl).toBe('https://app.mercury.com/');
    expect(sources.sentry.dashboardUrl).toBe(
      'https://jovie.sentry.io/issues/?query=is%3Aunresolved'
    );
    expect(sources.github.dashboardUrl).toBe(
      'https://github.com/JovieInc/Jovie/actions'
    );
  });

  it('distinguishes unavailable Stripe from not configured Mercury', () => {
    const sources = buildHudMetricSources(
      buildInput({
        stripe: {
          mrrUsd: 0,
          activeSubscribers: 0,
          mrrUsd30dAgo: 0,
          mrrGrowth30dUsd: 0,
          isConfigured: true,
          isAvailable: false,
          errorMessage: 'Stripe API error: timeout',
        },
        mercury: {
          balanceUsd: 0,
          burnRateUsd: 0,
          burnWindowDays: 30,
          isConfigured: false,
          isAvailable: false,
          defaultStatus: 'unknown',
          errorMessage:
            'Mercury credentials not configured (MERCURY_API_TOKEN required)',
        },
      })
    );

    expect(sources.stripe.state).toBe('unavailable');
    expect(sources.stripe.errorMessage).toContain('Stripe API error');
    expect(sources.mercury.state).toBe('not_configured');
    expect(sources.mercury.nextStep).toContain('MERCURY_API_TOKEN');
  });

  it('marks GitHub as no_data when configured but empty', () => {
    const sources = buildHudMetricSources(
      buildInput({
        deployments: {
          availability: 'available',
          current: null,
          recent: [],
        },
      })
    );

    expect(sources.github.state).toBe('no_data');
    expect(sources.github.nextStep).toContain('No workflow runs yet');
  });
});

describe('isHudMetricValueAvailable', () => {
  it('treats ok and no_data as displayable values', () => {
    expect(
      isHudMetricValueAvailable({
        key: 'github',
        label: 'GitHub',
        state: 'no_data',
        fetchedAtIso,
        errorMessage: null,
        dashboardUrl: null,
        configureUrl: null,
        nextStep: null,
      })
    ).toBe(true);

    expect(
      isHudMetricValueAvailable({
        key: 'stripe',
        label: 'Stripe',
        state: 'unavailable',
        fetchedAtIso,
        errorMessage: 'failed',
        dashboardUrl: null,
        configureUrl: null,
        nextStep: null,
      })
    ).toBe(false);
  });
});
