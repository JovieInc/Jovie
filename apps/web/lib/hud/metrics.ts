import 'server-only';

import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';
import { getAdminSentryMetrics } from '@/lib/admin/sentry-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { checkDbHealth } from '@/lib/db';
import { getHudDeployments } from '@/lib/deployments/github';
import { env } from '@/lib/env-server';
import { getHermesDispatchAvailability } from '@/lib/hermes/dispatch';
import { ServerFetchTimeoutError } from '@/lib/http/server-fetch';
import { getHudAiOpsSummary } from '@/lib/hud/ai-ops';
import { mapHermesEventsToAgentRunArtifacts } from '@/lib/hud/hermes-events';
import { getHermesEventsPayload } from '@/lib/hud/hermes-events-store';
import { buildHudMetricSources } from '@/lib/hud/source-trust';
import { getHudQuarantineMetrics } from '@/lib/testing/quarantine-ledger.server';
import { logger } from '@/lib/utils/logger';
import type { HudAccessMode, HudMetrics } from '@/types/hud';

function buildHudAgentRuns(): HudMetrics['agentRuns'] {
  const { events } = getHermesEventsPayload();
  return mapHermesEventsToAgentRunArtifacts(events);
}

function buildHudTestingMetrics(): HudMetrics['testing'] {
  const quarantine = getHudQuarantineMetrics();

  return {
    quarantine: {
      activeCount: quarantine.summary.activeCount,
      expiredCount: quarantine.summary.expiredCount,
      expiringSoonCount: quarantine.summary.expiringSoonCount,
      unitCount: quarantine.summary.unitCount,
      e2eCount: quarantine.summary.e2eCount,
      estimatedRetryAttemptsPerRun:
        quarantine.summary.estimatedRetryAttemptsPerRun,
      retryBudgetCap: quarantine.summary.retryBudgetCap,
      retryBudgetUsagePercent: quarantine.summary.retryBudgetUsagePercent,
      withinRetryBudget: quarantine.summary.withinRetryBudget,
      unitDefaultRetries: quarantine.retryBudget.unitDefaultRetries,
      quarantineUnitRetries: quarantine.retryBudget.quarantineUnitRetries,
      quarantineE2eRetries: quarantine.retryBudget.quarantineE2eRetries,
      isValid: quarantine.isValid,
      ledgerPath: quarantine.ledgerPath,
    },
  };
}
export interface BuildDegradedHudMetricsOptions {
  context?: string;
  timeoutMs?: number;
}

function normalizeIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed)
      ? new Date().toISOString()
      : new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Result of financial status calculation.
 */
interface FinancialStatus {
  runwayMonths: number | null;
  isDefaultAlive: boolean;
  defaultStatusDetail: string;
}

/**
 * Determines the default status detail message based on financial metrics.
 */
function getDefaultStatusDetail(
  netBurn: number,
  monthsToProfitability: number | null,
  runwayMonths: number | null,
  isDefaultAlive: boolean
): string {
  if (netBurn <= 0) {
    return 'Revenue already exceeds spend at the current run rate.';
  }
  if (monthsToProfitability == null) {
    return 'Revenue growth is not yet outpacing burn at the current trajectory.';
  }
  if (runwayMonths == null) {
    return 'Runway is currently unlimited based on cash flow.';
  }
  if (isDefaultAlive) {
    return `Runway covers roughly ${monthsToProfitability.toFixed(1)} months to profitability.`;
  }
  return 'At the current growth rate, runway ends before profitability.';
}

/**
 * Gets the service availability status string for a service.
 */
function getServiceStatus(
  name: string,
  isConfigured: boolean,
  isAvailable: boolean
): string | null {
  if (!isConfigured) return `${name} (not configured)`;
  if (!isAvailable) return `${name} (unavailable)`;
  return null;
}

/**
 * Calculates financial status from Stripe and Mercury metrics.
 */
function calculateFinancialStatus(
  stripeMetrics: Awaited<ReturnType<typeof getAdminStripeOverviewMetrics>>,
  mercuryMetrics: Awaited<ReturnType<typeof getAdminMercuryMetrics>>
): FinancialStatus {
  const canCalculate = stripeMetrics.isAvailable && mercuryMetrics.isAvailable;

  if (!canCalculate) {
    const missingServices = [
      getServiceStatus(
        'Stripe',
        stripeMetrics.isConfigured,
        stripeMetrics.isAvailable
      ),
      getServiceStatus(
        'Mercury',
        mercuryMetrics.isConfigured,
        mercuryMetrics.isAvailable
      ),
    ].filter((s): s is string => s !== null);

    return {
      runwayMonths: null,
      isDefaultAlive: false,
      defaultStatusDetail:
        missingServices.length > 0
          ? `Cannot calculate status: ${missingServices.join(', ')}`
          : 'Financial data sources unavailable.',
    };
  }

  const monthlyRevenue = stripeMetrics.mrrUsd;
  const monthlyExpense = mercuryMetrics.burnRateUsd;
  const netBurn = monthlyExpense - monthlyRevenue;
  const runwayMonths = netBurn > 0 ? mercuryMetrics.balanceUsd / netBurn : null;

  const revenueGrowth30d = stripeMetrics.mrrGrowth30dUsd;
  const monthsToProfitability =
    netBurn > 0 && revenueGrowth30d > 0 ? netBurn / revenueGrowth30d : null;

  const isDefaultAlive =
    netBurn <= 0 ||
    (monthsToProfitability != null &&
      runwayMonths != null &&
      monthsToProfitability <= runwayMonths);

  return {
    runwayMonths,
    isDefaultAlive,
    defaultStatusDetail: getDefaultStatusDetail(
      netBurn,
      monthsToProfitability,
      runwayMonths,
      isDefaultAlive
    ),
  };
}

export function buildDegradedHudMetrics(
  mode: HudAccessMode,
  options: BuildDegradedHudMetricsOptions = {}
): HudMetrics {
  const generatedAt = new Date();
  const fetchedAtIso = generatedAt.toISOString();
  const timeoutDetail =
    options.context != null
      ? `${options.context} timed out after ${options.timeoutMs ?? 'unknown'}ms`
      : 'HUD metrics request timed out';

  const branding = {
    startupName: env.HUD_STARTUP_NAME ?? 'Jovie',
    logoUrl: env.HUD_STARTUP_LOGO_URL ?? null,
  };

  const stripeMetrics = {
    mrrUsd: 0,
    activeSubscribers: 0,
    mrrUsd30dAgo: 0,
    mrrGrowth30dUsd: 0,
    isConfigured: true,
    isAvailable: false,
    errorMessage: timeoutDetail,
  };

  const mercuryMetrics = {
    balanceUsd: 0,
    burnRateUsd: 0,
    burnWindowDays: 30,
    isConfigured: true,
    isAvailable: false,
    defaultStatus: 'unknown' as const,
    errorMessage: timeoutDetail,
  };

  const sentryMetrics = {
    unresolvedIssues24h: 0,
    totalEvents24h: 0,
    impactedUsers24h: 0,
    criticalIssues24h: 0,
    topIssueTitle: null,
    topIssueShortId: null,
    isConfigured: true,
    isAvailable: false,
    errorMessage: timeoutDetail,
  };

  const operationsStatus: HudMetrics['operations'] = {
    status: 'degraded',
    dbLatencyMs: null,
    checkedAtIso: fetchedAtIso,
  };

  const deployments: HudMetrics['deployments'] = {
    availability: 'error',
    current: null,
    recent: [],
    errorMessage: timeoutDetail,
  };

  const dispatch = getHermesDispatchAvailability();

  return {
    accessMode: mode,
    branding,
    overview: {
      mrrUsd: 0,
      activeSubscribers: 0,
      balanceUsd: 0,
      burnRateUsd: 0,
      runwayMonths: null,
      defaultStatus: 'unknown',
      defaultStatusDetail:
        'Metrics temporarily unavailable due to upstream timeout.',
      financialDataAvailable: false,
    },
    operations: operationsStatus,
    reliability: {
      errorRatePercent: 0,
      reliabilityScorePercent: 0,
      p95LatencyMs: null,
      incidents24h: 0,
      lastIncidentAtIso: null,
      unresolvedSentryIssues24h: 0,
    },
    testing: buildHudTestingMetrics(),
    deployments,
    aiOps: {
      availability: 'error',
      generatedAtIso: fetchedAtIso,
      counts: {
        queued: 0,
        running: 0,
        blocked: 0,
        review: 0,
        done: 0,
        failed: 0,
        stale: 0,
      },
      dispatch,
      mergeQueue: {
        openAgentPrs: 0,
        openAgentPrThreshold: 10,
        pressure: 'normal',
      },
      runs: [],
      blockers: [],
      recommendations: [],
      sources: {
        github: {
          availability: 'error',
          configured: true,
          itemCount: 0,
          errorMessage: timeoutDetail,
        },
        linear: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        sentry: {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        hermes: {
          availability: 'available',
          configured: true,
          itemCount: 0,
        },
        'hermes-air': {
          availability: 'not_configured',
          configured: false,
          itemCount: 0,
        },
        ci: {
          availability: 'error',
          configured: true,
          itemCount: 0,
          errorMessage: timeoutDetail,
        },
      },
      errorMessage: timeoutDetail,
    },
    sources: buildHudMetricSources({
      stripe: stripeMetrics,
      mercury: mercuryMetrics,
      sentry: sentryMetrics,
      operations: operationsStatus,
      deployments,
      fetchedAtIso,
      sentryOrgSlug: env.SENTRY_ORG_SLUG,
      githubOwner: env.HUD_GITHUB_OWNER,
      githubRepo: env.HUD_GITHUB_REPO,
    }),
    agentRuns: buildHudAgentRuns(),
    generatedAtIso: fetchedAtIso,
  };
}

async function fetchHudMetrics(mode: HudAccessMode): Promise<HudMetrics> {
  const generatedAt = new Date();

  const branding = {
    startupName: env.HUD_STARTUP_NAME ?? 'Jovie',
    logoUrl: env.HUD_STARTUP_LOGO_URL ?? null,
  };

  const [
    stripeMetrics,
    mercuryMetrics,
    reliabilitySummary,
    sentryMetrics,
    dbHealth,
    deployments,
    aiOps,
  ] = await Promise.all([
    getAdminStripeOverviewMetrics(),
    getAdminMercuryMetrics(),
    getAdminReliabilitySummary(),
    getAdminSentryMetrics(),
    checkDbHealth(),
    getHudDeployments(),
    getHudAiOpsSummary(generatedAt),
  ]);

  const financialStatus = calculateFinancialStatus(
    stripeMetrics,
    mercuryMetrics
  );
  const financialDataAvailable =
    stripeMetrics.isAvailable && mercuryMetrics.isAvailable;

  const operationsStatus: HudMetrics['operations'] = {
    status: dbHealth.healthy ? 'ok' : 'degraded',
    dbLatencyMs: dbHealth.latency ?? null,
    checkedAtIso: generatedAt.toISOString(),
  };

  const lastIncidentAtIso = (() => {
    if (reliabilitySummary.lastIncidentAt instanceof Date) {
      return reliabilitySummary.lastIncidentAt.toISOString();
    }
    if (reliabilitySummary.lastIncidentAt != null) {
      return normalizeIso(reliabilitySummary.lastIncidentAt);
    }
    return null;
  })();

  const fetchedAtIso = generatedAt.toISOString();
  const sources = buildHudMetricSources({
    stripe: stripeMetrics,
    mercury: mercuryMetrics,
    sentry: sentryMetrics,
    operations: {
      status: dbHealth.healthy ? 'ok' : 'degraded',
      dbLatencyMs: dbHealth.latency ?? null,
      checkedAtIso: fetchedAtIso,
    },
    deployments,
    fetchedAtIso,
    sentryOrgSlug: env.SENTRY_ORG_SLUG,
    githubOwner: env.HUD_GITHUB_OWNER,
    githubRepo: env.HUD_GITHUB_REPO,
  });

  return {
    accessMode: mode,
    branding,
    overview: {
      mrrUsd: stripeMetrics.mrrUsd,
      activeSubscribers: stripeMetrics.activeSubscribers,
      balanceUsd: mercuryMetrics.isAvailable ? mercuryMetrics.balanceUsd : 0,
      burnRateUsd: mercuryMetrics.isAvailable ? mercuryMetrics.burnRateUsd : 0,
      runwayMonths: financialDataAvailable
        ? financialStatus.runwayMonths
        : null,
      defaultStatus: financialDataAvailable
        ? financialStatus.isDefaultAlive
          ? 'alive'
          : 'dead'
        : 'unknown',
      defaultStatusDetail: financialStatus.defaultStatusDetail,
      financialDataAvailable,
    },
    operations: operationsStatus,
    reliability: {
      errorRatePercent: reliabilitySummary.errorRatePercent,
      reliabilityScorePercent: reliabilitySummary.reliabilityScorePercent,
      p95LatencyMs: reliabilitySummary.p95LatencyMs,
      incidents24h: reliabilitySummary.incidents24h,
      lastIncidentAtIso,
      unresolvedSentryIssues24h: reliabilitySummary.unresolvedSentryIssues24h,
    },
    testing: buildHudTestingMetrics(),
    deployments,
    aiOps,
    sources,
    agentRuns: buildHudAgentRuns(),
    generatedAtIso: fetchedAtIso,
  };
}

export async function getHudMetrics(mode: HudAccessMode): Promise<HudMetrics> {
  try {
    return await fetchHudMetrics(mode);
  } catch (error) {
    if (error instanceof ServerFetchTimeoutError) {
      logger.warn('HUD metrics fetch timed out; returning degraded payload', {
        context: error.context,
        timeoutMs: error.timeoutMs,
      });
      return buildDegradedHudMetrics(mode, {
        context: error.context,
        timeoutMs: error.timeoutMs,
      });
    }

    throw error;
  }
}
