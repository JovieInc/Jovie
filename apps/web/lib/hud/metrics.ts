import 'server-only';

import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { checkDbHealth } from '@/lib/db';
import { getHudDeployments } from '@/lib/deployments/github';
import { env } from '@/lib/env-server';
import type { HudAccessMode, HudMetrics } from '@/types/hud';

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

export async function getHudMetrics(mode: HudAccessMode): Promise<HudMetrics> {
  const generatedAt = new Date();

  const branding = {
    startupName: env.HUD_STARTUP_NAME ?? 'Jovie',
    logoUrl: env.HUD_STARTUP_LOGO_URL ?? null,
  };

  const [
    stripeMetrics,
    mercuryMetrics,
    reliabilitySummary,
    dbHealth,
    deployments,
  ] = await Promise.all([
    getAdminStripeOverviewMetrics(),
    getAdminMercuryMetrics(),
    getAdminReliabilitySummary(),
    checkDbHealth(),
    getHudDeployments(),
  ]);

  const financialStatus = calculateFinancialStatus(
    stripeMetrics,
    mercuryMetrics
  );

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

  return {
    accessMode: mode,
    branding,
    overview: {
      mrrUsd: stripeMetrics.mrrUsd,
      activeSubscribers: stripeMetrics.activeSubscribers,
      balanceUsd: mercuryMetrics.balanceUsd,
      burnRateUsd: mercuryMetrics.burnRateUsd,
      runwayMonths: financialStatus.runwayMonths,
      defaultStatus: financialStatus.isDefaultAlive ? 'alive' : 'dead',
      defaultStatusDetail: financialStatus.defaultStatusDetail,
    },
    operations: operationsStatus,
    reliability: {
      errorRatePercent: reliabilitySummary.errorRatePercent,
      p95LatencyMs: reliabilitySummary.p95LatencyMs,
      incidents24h: reliabilitySummary.incidents24h,
      lastIncidentAtIso,
    },
    deployments,
    generatedAtIso: generatedAt.toISOString(),
  };
}
