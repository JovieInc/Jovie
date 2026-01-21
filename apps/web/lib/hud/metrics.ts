import 'server-only';

import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { checkDbHealth } from '@/lib/db';
import { env } from '@/lib/env-server';
import type {
  HudAccessMode,
  HudDeploymentRun,
  HudDeploymentState,
  HudDeployments,
  HudMetrics,
} from '@/types/hud';

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
 * Map of status values to their deployment state.
 */
const STATUS_TO_DEPLOYMENT_STATE: Record<string, HudDeploymentState> = {
  in_progress: 'in_progress',
  queued: 'in_progress',
};

/**
 * Map of conclusion values to their deployment state (when status is 'completed').
 */
const CONCLUSION_TO_DEPLOYMENT_STATE: Record<string, HudDeploymentState> = {
  success: 'success',
  failure: 'failure',
  cancelled: 'failure',
  timed_out: 'failure',
};

function formatDeploymentState(
  status: unknown,
  conclusion: unknown
): HudDeploymentState {
  const statusStr = String(status);
  const conclusionStr = String(conclusion);

  // Check status-based states first
  const statusState = STATUS_TO_DEPLOYMENT_STATE[statusStr];
  if (statusState) return statusState;

  // For completed status, check conclusion
  if (statusStr === 'completed') {
    return CONCLUSION_TO_DEPLOYMENT_STATE[conclusionStr] ?? 'unknown';
  }

  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function getHudDeployments(): Promise<HudDeployments> {
  const token = env.HUD_GITHUB_TOKEN;
  const owner = env.HUD_GITHUB_OWNER;
  const repo = env.HUD_GITHUB_REPO;
  const workflow = env.HUD_GITHUB_WORKFLOW;

  if (!token || !owner || !repo || !workflow) {
    return {
      availability: 'not_configured',
      current: null,
      recent: [],
    };
  }

  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=6`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        availability: 'error',
        current: null,
        recent: [],
        errorMessage: `GitHub API error (${response.status})`,
      };
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return {
        availability: 'error',
        current: null,
        recent: [],
        errorMessage: 'Unexpected GitHub API response',
      };
    }

    const rawRuns = payload.workflow_runs;
    const runsArray = Array.isArray(rawRuns) ? rawRuns : [];

    const runs: HudDeploymentRun[] = runsArray
      .map((run: unknown): HudDeploymentRun | null => {
        if (!isRecord(run)) return null;

        const id = typeof run.id === 'number' ? run.id : null;
        const runNumber =
          typeof run.run_number === 'number' ? run.run_number : null;
        if (id == null || runNumber == null) return null;

        const status = formatDeploymentState(run.status, run.conclusion);
        const createdAtIso = normalizeIso(run.created_at);
        const branch =
          typeof run.head_branch === 'string' ? run.head_branch : null;
        const urlValue = typeof run.html_url === 'string' ? run.html_url : null;

        return { id, runNumber, status, createdAtIso, branch, url: urlValue };
      })
      .filter((run): run is HudDeploymentRun => run != null);

    return {
      availability: 'available',
      current: runs[0] ?? null,
      recent: runs.slice(0, 5),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      availability: 'error',
      current: null,
      recent: [],
      errorMessage: message,
    };
  }
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

  const lastIncidentAtIso =
    reliabilitySummary.lastIncidentAt instanceof Date
      ? reliabilitySummary.lastIncidentAt.toISOString()
      : reliabilitySummary.lastIncidentAt != null
        ? normalizeIso(reliabilitySummary.lastIncidentAt)
        : null;

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
