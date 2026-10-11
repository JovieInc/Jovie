/**
 * Executive cockpit derivations (JOV-6887).
 *
 * Two pure projections over `HudMetrics` (+ optional founder funnel):
 * - `deriveOpsExceptions`: the health strip. Only exceptions a founder must
 *   be aware of, in plain language — no subsystem jargon (env, dispatch,
 *   diagnostics, agent run internals).
 * - `rankOpsBottlenecks`: the 1–3 ranked bottlenecks constraining the
 *   company right now.
 */

import { APP_ROUTES } from '@/constants/routes';
import type { FounderFunnelData } from '@/lib/admin/types';
import {
  formatSourceFreshness,
  getSourceFreshnessState,
  isSourceStale,
} from '@/lib/hud/source-trust';
import type { HudMetricSourceTrust, HudMetrics } from '@/types/hud';

export interface OpsException {
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  /** Authoritative record for drill-down; null falls back to Operations. */
  readonly href: string | null;
}

export interface OpsBottleneck {
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly href: string | null;
}

export const OPS_BOTTLENECK_LIMIT = 3;

const SOURCE_STATE_COPY: Record<HudMetricSourceTrust['state'], string | null> =
  {
    ok: null,
    degraded: 'degraded',
    unauthorized: 'needs re-authorization',
    unavailable: 'unreachable',
    not_configured: 'not connected',
    no_data: 'reporting no data',
  };

function pluralize(count: number, singular: string): string {
  return `${count.toLocaleString('en-US')} ${singular}${count === 1 ? '' : 's'}`;
}

function sourceExceptions(
  metrics: HudMetrics,
  now: number
): readonly OpsException[] {
  return Object.values(metrics.sources)
    .map(source => {
      const state = SOURCE_STATE_COPY[source.state];
      if (state !== null) {
        return {
          id: `source-${source.key}`,
          label: `${source.label} is ${state}`,
          detail: source.nextStep ?? source.errorMessage,
          href: source.dashboardUrl,
        };
      }
      // False-green guard: a source that reports `ok` but whose observation is
      // older than the staleness budget must surface as an exception, not pass
      // silently as healthy.
      if (source.state === 'ok' && isSourceStale(source.fetchedAtIso, now)) {
        return {
          id: `source-stale-${source.key}`,
          label: `${source.label} data is stale`,
          detail:
            source.nextStep ??
            `Last observed ${formatSourceFreshness(source.fetchedAtIso, now)}`,
          href: source.dashboardUrl,
        };
      }
      return null;
    })
    .filter((entry): entry is OpsException => entry !== null);
}

/**
 * Founder-awareness health strip. Returns only exceptions; an empty result
 * means the operating chain is nominal.
 */
export function deriveOpsExceptions(
  metrics: HudMetrics,
  now = Date.now()
): OpsException[] {
  const exceptions: OpsException[] = [];

  if (metrics.operations.status !== 'ok') {
    exceptions.push({
      id: 'operations-degraded',
      label: 'Database is degraded',
      detail:
        metrics.operations.dbLatencyMs === null
          ? null
          : `Latency ${metrics.operations.dbLatencyMs.toFixed(0)}ms`,
      href: APP_ROUTES.ADMIN_OPERATIONS,
    });
  }

  if (metrics.deployments.current?.status === 'failure') {
    exceptions.push({
      id: 'deploy-failed',
      label: 'Latest deploy failed',
      detail: metrics.deployments.current.branch,
      href: metrics.deployments.current.url,
    });
  }

  const unresolved = metrics.reliability.unresolvedSentryIssues24h;
  if (unresolved > 0) {
    exceptions.push({
      id: 'unresolved-errors',
      label: `${pluralize(unresolved, 'unresolved error')} in 24h`,
      detail:
        metrics.reliability.p95LatencyMs === null
          ? null
          : `p95 ${metrics.reliability.p95LatencyMs.toFixed(0)}ms`,
      href: metrics.sources.sentry?.dashboardUrl ?? null,
    });
  }

  const quarantine = metrics.testing.quarantine;
  if (!quarantine.isValid) {
    exceptions.push({
      id: 'quarantine-invalid',
      label: 'Test quarantine ledger is invalid',
      detail: null,
      href: null,
    });
  } else if (!quarantine.withinRetryBudget) {
    exceptions.push({
      id: 'quarantine-over-budget',
      label: 'Flaky tests are over the retry budget',
      detail: pluralize(quarantine.activeCount, 'quarantined test'),
      href: null,
    });
  }

  const agentExceptions =
    metrics.aiOps.counts.blocked + metrics.aiOps.counts.failed;
  if (agentExceptions > 0) {
    exceptions.push({
      id: 'agent-work-blocked',
      label: `${pluralize(agentExceptions, 'agent task')} blocked or failed`,
      detail: metrics.aiOps.blockers[0]?.summary ?? null,
      href: metrics.aiOps.blockers[0]?.url ?? null,
    });
  }

  if (metrics.gbrain?.status === 'down') {
    exceptions.push({
      id: 'company-memory-down',
      label: 'Company memory is down',
      detail: null,
      href: null,
    });
  }

  const moneySources = [metrics.sources.stripe, metrics.sources.mercury];
  // Contradiction guard: both money sources claim healthy `ok` observations
  // while the company overview reports financial data is unavailable — the
  // sources are false-green and cannot both be right.
  if (
    metrics.overview?.financialDataAvailable === false &&
    moneySources.every(
      source =>
        source?.state === 'ok' &&
        getSourceFreshnessState(source.fetchedAtIso, now) === 'fresh'
    )
  ) {
    exceptions.push({
      id: 'money-sources-contradiction',
      label: 'Revenue sources disagree',
      detail:
        'Stripe and Mercury report healthy but financial data is unavailable',
      href: APP_ROUTES.ADMIN_OPERATIONS,
    });
  }

  return [...exceptions, ...sourceExceptions(metrics, now)];
}

/**
 * Ranked bottlenecks: the few things most constraining shipping or revenue.
 * Deterministic order — a stopped pipeline outranks a funnel leak, which
 * outranks blocked agent work. At most `OPS_BOTTLENECK_LIMIT` entries.
 */
export function rankOpsBottlenecks(
  metrics: HudMetrics,
  funnel?: FounderFunnelData | null
): OpsBottleneck[] {
  const candidates: OpsBottleneck[] = [];

  if (metrics.deployments.current?.status === 'failure') {
    candidates.push({
      id: 'deploy-failed',
      title: 'Shipping pipeline is failing',
      detail: metrics.deployments.current.branch
        ? `Latest deploy failed on ${metrics.deployments.current.branch}`
        : 'Latest deploy failed',
      href: metrics.deployments.current.url,
    });
  }

  const dropOffStage = funnel?.biggestDropOffKey
    ? funnel.stages.find(stage => stage.key === funnel.biggestDropOffKey)
    : null;
  if (dropOffStage && (dropOffStage.dropOff ?? 0) > 0) {
    candidates.push({
      id: 'funnel-drop-off',
      title: `Funnel leaks at ${dropOffStage.label}`,
      detail: `${pluralize(dropOffStage.dropOff ?? 0, 'user')} lost between stages`,
      href: null,
    });
  }

  const agentExceptions =
    metrics.aiOps.counts.blocked + metrics.aiOps.counts.failed;
  if (agentExceptions > 0) {
    candidates.push({
      id: 'agent-work-blocked',
      title: `${pluralize(agentExceptions, 'agent task')} blocked or failed`,
      detail: metrics.aiOps.blockers[0]?.summary ?? null,
      href: metrics.aiOps.blockers[0]?.url ?? null,
    });
  }

  const unresolved = metrics.reliability.unresolvedSentryIssues24h;
  if (unresolved > 0) {
    candidates.push({
      id: 'unresolved-errors',
      title: `${pluralize(unresolved, 'unresolved error')} in 24h`,
      detail: null,
      href: null,
    });
  }

  const moneySources = [metrics.sources.stripe, metrics.sources.mercury];
  if (moneySources.some(source => SOURCE_STATE_COPY[source.state] !== null)) {
    candidates.push({
      id: 'money-data-untrusted',
      title: 'Revenue data is stale or disconnected',
      detail: 'Company numbers cannot be trusted until sources recover',
      href:
        moneySources.find(source => SOURCE_STATE_COPY[source.state] !== null)
          ?.dashboardUrl ?? null,
    });
  }

  return candidates.slice(0, OPS_BOTTLENECK_LIMIT);
}
