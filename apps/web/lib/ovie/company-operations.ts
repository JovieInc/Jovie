import { APP_ROUTES } from '@/constants/routes';
import {
  HUD_SOURCE_STALE_AFTER_MS,
  isSourceStale,
} from '@/lib/hud/source-trust';
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

const NOT_OBSERVED = 'Not observed';
const DEADLINE_NOT_DECLARED = 'Not declared — source disconnected';
const STATE_PRECEDENCE = [
  'unauthorized',
  'unavailable',
  'disconnected',
  'degraded',
  'stale',
  'unknown',
] as const satisfies readonly CompanyMetricState[];

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
  return new Date(observedAt + HUD_SOURCE_STALE_AFTER_MS).toISOString();
}

function metricObservedAt(sources: readonly HudMetricSourceTrust[]): string {
  const timestamps = sources.map(source => Date.parse(source.fetchedAtIso));
  if (timestamps.some(timestamp => !Number.isFinite(timestamp))) {
    return 'Unknown';
  }
  return new Date(Math.min(...timestamps)).toISOString();
}

function metricFreshnessDeadline(
  sources: readonly HudMetricSourceTrust[]
): string {
  const deadlines = sources.map(freshnessDeadline);
  if (deadlines.includes('Unknown')) return 'Unknown';
  const sortedDeadlines = deadlines.toSorted((first, second) =>
    first.localeCompare(second)
  );
  return sortedDeadlines[0] as string;
}

function unavailableState(
  source: HudMetricSourceTrust,
  now: number
): CompanyMetricState {
  if (source.state === 'not_configured') return 'disconnected';
  if (source.state === 'degraded') return 'degraded';
  if (source.state === 'unauthorized') return 'unauthorized';
  if (source.state === 'unavailable') return 'unavailable';
  if (source.state === 'no_data') return 'unknown';
  const observedAt = Date.parse(source.fetchedAtIso);
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now)
    return 'unknown';
  return isSourceStale(source.fetchedAtIso, now) ? 'stale' : 'fresh';
}

function combineSourceStates(
  states: readonly CompanyMetricState[]
): CompanyMetricState {
  return (
    STATE_PRECEDENCE.find(candidate => states.includes(candidate)) ?? 'fresh'
  );
}

function survivalMetric(metrics: HudMetrics, now: number): CompanyCoreMetric {
  const stripe = metrics.sources.stripe;
  const mercury = metrics.sources.mercury;
  const stripeState = unavailableState(stripe, now);
  const mercuryState = unavailableState(mercury, now);
  const sourceState = combineSourceStates([stripeState, mercuryState]);
  const drillDownSource =
    sourceState === 'fresh'
      ? stripe
      : ([mercury, stripe].find(
          source => unavailableState(source, now) === sourceState
        ) ?? stripe);
  const state =
    !metrics.overview.financialDataAvailable && sourceState === 'fresh'
      ? 'unknown'
      : sourceState;

  if (!metrics.overview.financialDataAvailable) {
    const sourceDisconnected = sourceState === 'disconnected';
    return {
      id: 'company-survival',
      label: 'Company',
      value: 'Unknown',
      detail: metrics.overview.defaultStatusDetail,
      state,
      authoritativeSource:
        'Stripe recurring revenue + Mercury cash and outflow',
      observedAt: sourceDisconnected
        ? NOT_OBSERVED
        : metricObservedAt([stripe, mercury]),
      freshnessDeadline: sourceDisconnected
        ? DEADLINE_NOT_DECLARED
        : metricFreshnessDeadline([stripe, mercury]),
      owner: 'Summer',
      drillDownHref: drillDownSource.dashboardUrl ?? APP_ROUTES.HUD,
      drillDownLabel: `Inspect ${drillDownSource.label}`,
    };
  }

  const weeklyOutflow = (metrics.overview.burnRateUsd / 30) * 7;
  const weeklyRecurringRunRate = (metrics.overview.mrrUsd * 12) / 52;
  const runway =
    metrics.overview.runwayMonths == null
      ? 'no finite runway at current net burn'
      : `${metrics.overview.runwayMonths.toFixed(1)} months runway`;
  const survivalValue = {
    alive: 'Alive',
    dead: 'Dead',
    unknown: 'Unknown',
  }[metrics.overview.defaultStatus];

  return {
    id: 'company-survival',
    label: 'Company',
    value: survivalValue,
    detail: `${formatUsd(metrics.overview.balanceUsd)} cash · ${formatUsd(weeklyOutflow)} 7-day outflow pace · ${formatUsd(weeklyRecurringRunRate)} weekly recurring revenue run rate · ${runway}. ${metrics.overview.defaultStatusDetail}`,
    state,
    authoritativeSource:
      'Stripe recurring revenue + Mercury cash and 30-day outflow',
    observedAt: metricObservedAt([stripe, mercury]),
    freshnessDeadline: metricFreshnessDeadline([stripe, mercury]),
    owner: 'Summer',
    drillDownHref: drillDownSource.dashboardUrl ?? APP_ROUTES.HUD,
    drillDownLabel: `Inspect ${drillDownSource.label}`,
  };
}

function primaryOutcomeMetric(): CompanyCoreMetric {
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
  let exceptionDetail = '';
  if (executionExceptions > 0) {
    const itemLabel = executionExceptions === 1 ? 'item' : 'items';
    exceptionDetail = ` ${executionExceptions} blocked or failed execution ${itemLabel} need attention in Operations Details.`;
  }

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
  now = Date.parse(metrics.generatedAtIso)
): OvieCompanyOverview {
  return {
    generatedAtIso: metrics.generatedAtIso,
    metrics: [
      survivalMetric(metrics, now),
      primaryOutcomeMetric(),
      dogfoodReceiptsMetric(metrics),
    ],
  };
}
