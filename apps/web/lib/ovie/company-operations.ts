import { APP_ROUTES } from '@/constants/routes';
import { isSourceStale } from '@/lib/hud/source-trust';
import type { HudMetricSourceTrust, HudMetrics } from '@/types/hud';

export const COMPANY_METRIC_STATES = [
  'fresh',
  'stale',
  'disconnected',
  'unavailable',
  'unauthorized',
  'degraded',
  'unknown',
  'measured-zero',
] as const;

export type CompanyMetricState = (typeof COMPANY_METRIC_STATES)[number];
export type CompanyCoreMetricId =
  | 'company-survival'
  | 'primary-outcome'
  | 'dogfood-receipts';

export interface CompanyCoreMetric {
  readonly id: CompanyCoreMetricId;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly state: CompanyMetricState;
  readonly authoritativeSource: string;
  readonly observedAt: string;
  readonly freshnessDeadline: string;
  readonly owner: 'Summer';
  readonly drillDownHref: string;
  readonly drillDownLabel: string;
}

export interface OvieCompanyOverview {
  readonly generatedAtIso: string;
  readonly metrics: readonly [
    CompanyCoreMetric,
    CompanyCoreMetric,
    CompanyCoreMetric,
  ];
}

const SOURCE_FRESHNESS_MS = 5 * 60 * 1000;
const NOT_OBSERVED = 'Not observed';
const DEADLINE_NOT_DECLARED = 'Not declared — source disconnected';

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function freshnessDeadline(source: HudMetricSourceTrust): string {
  const observedAt = Date.parse(source.fetchedAtIso);
  if (!Number.isFinite(observedAt)) return 'Unknown';
  return new Date(observedAt + SOURCE_FRESHNESS_MS).toISOString();
}

function unavailableState(
  source: HudMetricSourceTrust,
  now: number
): CompanyMetricState {
  if (source.state === 'not_configured') return 'disconnected';
  if (source.state === 'degraded') return 'degraded';
  if (source.state === 'unavailable') {
    return /\b(?:401|403|unauthori[sz]ed|forbidden)\b/i.test(
      source.errorMessage ?? ''
    )
      ? 'unauthorized'
      : 'unavailable';
  }
  if (source.state === 'no_data') return 'unknown';
  return isSourceStale(source.fetchedAtIso, now) ? 'stale' : 'fresh';
}

function survivalMetric(metrics: HudMetrics, now: number): CompanyCoreMetric {
  const stripe = metrics.sources.stripe;
  const mercury = metrics.sources.mercury;
  const stripeState = unavailableState(stripe, now);
  const mercuryState = unavailableState(mercury, now);
  const sourceStates = [stripeState, mercuryState];
  const failedState = sourceStates.find(state => state !== 'fresh');
  const state = metrics.overview.financialDataAvailable
    ? (failedState ?? 'fresh')
    : (failedState ?? 'unknown');

  if (!metrics.overview.financialDataAvailable) {
    return {
      id: 'company-survival',
      label: 'Company',
      value: 'Unknown',
      detail: metrics.overview.defaultStatusDetail,
      state,
      authoritativeSource:
        'Stripe recurring revenue + Mercury cash and outflow',
      observedAt: metrics.generatedAtIso,
      freshnessDeadline: [stripe, mercury]
        .map(freshnessDeadline)
        .sort()[0] as string,
      owner: 'Summer',
      drillDownHref: 'https://dashboard.stripe.com/',
      drillDownLabel: 'Inspect Revenue Source',
    };
  }

  const weeklyOutflow = (metrics.overview.burnRateUsd / 30) * 7;
  const weeklyRecurringRunRate = (metrics.overview.mrrUsd * 12) / 52;
  const runway =
    metrics.overview.runwayMonths == null
      ? 'no finite runway at current net burn'
      : `${metrics.overview.runwayMonths.toFixed(1)} months runway`;

  return {
    id: 'company-survival',
    label: 'Company',
    value:
      metrics.overview.defaultStatus === 'alive'
        ? 'Alive'
        : metrics.overview.defaultStatus === 'dead'
          ? 'Dead'
          : 'Unknown',
    detail: `${formatUsd(metrics.overview.balanceUsd)} cash · ${formatUsd(weeklyOutflow)} 7-day outflow pace · ${formatUsd(weeklyRecurringRunRate)} weekly recurring revenue run rate · ${runway}.`,
    state,
    authoritativeSource:
      'Stripe recurring revenue + Mercury cash and 30-day outflow',
    observedAt: metrics.generatedAtIso,
    freshnessDeadline: [stripe, mercury]
      .map(freshnessDeadline)
      .sort()[0] as string,
    owner: 'Summer',
    drillDownHref: 'https://dashboard.stripe.com/',
    drillDownLabel: 'Inspect Revenue Source',
  };
}

function primaryOutcomeMetric(metrics: HudMetrics): CompanyCoreMetric {
  return {
    id: 'primary-outcome',
    label: 'Week Over Week',
    value: 'Not Measured',
    detail:
      'No authoritative weekly revenue snapshot or weekly active-company-user series is connected. Current MRR and current subscriber counts are not a week-over-week measurement.',
    state: 'disconnected',
    authoritativeSource:
      'Stripe weekly revenue snapshot; product activity fallback',
    observedAt: NOT_OBSERVED,
    freshnessDeadline: DEADLINE_NOT_DECLARED,
    owner: 'Summer',
    drillDownHref: APP_ROUTES.ADMIN_PEOPLE,
    drillDownLabel: 'Inspect Customers',
  };
}

function dogfoodReceiptsMetric(metrics: HudMetrics): CompanyCoreMetric {
  const executionExceptions =
    metrics.aiOps.counts.blocked + metrics.aiOps.counts.failed;
  const exceptionDetail =
    executionExceptions > 0
      ? ` ${executionExceptions} blocked or failed execution item${executionExceptions === 1 ? '' : 's'} need attention in Operations Details.`
      : '';

  return {
    id: 'dogfood-receipts',
    label: 'Verified Ships This Week',
    value: 'Not Measured',
    detail: `No authoritative weekly dogfood-receipt ledger is connected. Merges, green CI, and deploys do not count.${exceptionDetail}`,
    state: 'disconnected',
    authoritativeSource: 'Packaged dogfood and recurrence receipts',
    observedAt: NOT_OBSERVED,
    freshnessDeadline: DEADLINE_NOT_DECLARED,
    owner: 'Summer',
    drillDownHref: APP_ROUTES.ADMIN_RELEASES,
    drillDownLabel: 'Inspect Releases',
  };
}

export function deriveOvieCompanyOverview(
  metrics: HudMetrics,
  now = Date.now()
): OvieCompanyOverview {
  return {
    generatedAtIso: metrics.generatedAtIso,
    metrics: [
      survivalMetric(metrics, now),
      primaryOutcomeMetric(metrics),
      dogfoodReceiptsMetric(metrics),
    ],
  };
}
