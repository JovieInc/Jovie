/**
 * Ovie Home company row: "are we winning?" in four tiles. Pure presentation
 * over existing reads only: `/api/hud/metrics` (Stripe + Mercury with
 * per-source trust), `/api/admin/hud/founder-funnel` (accounts and first
 * value, 7d) and `/api/ovie/certifications` (the golden path).
 *
 * Rule (coordinator, 2026-10-31): the most important numbers must be
 * verified against their source or say "Not measured" with the reason. A
 * partial figure is never shown as a measurement:
 * - Cash is Mercury's balance across every active account (verified).
 *   Runway is NOT shown: burn is Mercury debits only, and spend paid by card
 *   elsewhere (Neon alone is ~$130/mo vs $110 measured burn) is missing.
 * - MRR is customer-only Stripe MRR; internal/test subscriptions are named
 *   beside it (JOV-7362: the $199 read was an internal jov.ie account).
 * - Golden path is certification (founder lock with judged evidence), never
 *   a count of passing production tests.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopTile,
} from '@/lib/home-loop/contract';
import type { HudMetricSourceTrust, HudOverviewMetrics } from '@/types/hud';

export type OvieCompanyKey = 'cash' | 'mrr' | 'users' | 'golden-path';
export type OvieCompanyTile = Omit<HomeLoopTile<OvieCompanyKey>, 'was'>;

/** The slice of `/api/hud/metrics` Home reads. */
export interface OvieCompanyMetricsInput {
  readonly overview: HudOverviewMetrics;
  readonly sources?: Partial<
    Record<'stripe' | 'mercury', Pick<HudMetricSourceTrust, 'state'>>
  >;
}

/** The slice of the founder funnel Home reads. */
export interface OvieFunnelInput {
  readonly stages: readonly {
    readonly key: string;
    readonly count: number;
    readonly drillDownHref: string | null;
  }[];
}

/** The slice of a certification row Home reads. */
export interface OvieGoldenPathRow {
  readonly domain: string;
  readonly state: string;
  readonly tiers: Readonly<Record<string, string>>;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const CERTIFIED_STATES = new Set(['founder_locked', 'shipped', 'monitored']);

function unmeasured(
  key: OvieCompanyKey,
  label: string,
  reason: string,
  href: string | null
): OvieCompanyTile {
  return {
    key,
    label,
    value: HOME_LOOP_NOT_MEASURED,
    tone: 'neutral',
    measured: false,
    target: reason,
    href,
  };
}

function sourceOk(
  metrics: OvieCompanyMetricsInput | null,
  key: 'stripe' | 'mercury'
): boolean {
  return metrics?.sources?.[key]?.state === 'ok';
}

function cashTile(metrics: OvieCompanyMetricsInput | null): OvieCompanyTile {
  const href = APP_ROUTES.ADMIN_OPERATIONS;
  if (!metrics || !sourceOk(metrics, 'mercury'))
    return unmeasured('cash', 'Cash', 'Connect Mercury', href);
  return {
    key: 'cash',
    label: 'Cash (Mercury)',
    value: usd.format(metrics.overview.balanceUsd),
    // No trusted burn, so no runway and no alive/dead verdict; the number
    // speaks for itself and the footer says what is missing.
    tone: 'neutral',
    measured: true,
    target: 'Runway not measured: card spend not in burn',
    href,
  };
}

function mrrTile(metrics: OvieCompanyMetricsInput | null): OvieCompanyTile {
  const href = APP_ROUTES.ADMIN_OPERATIONS;
  if (!metrics || !sourceOk(metrics, 'stripe'))
    return unmeasured('mrr', 'Customer MRR', 'Connect Stripe', href);
  const { mrrUsd, activeSubscribers, excludedInternal } = metrics.overview;
  const internal =
    excludedInternal && excludedInternal.subscribers > 0
      ? ` · excl. ${usd.format(excludedInternal.mrrUsd)} internal`
      : '';
  return {
    key: 'mrr',
    label: 'Customer MRR',
    value: usd.format(mrrUsd),
    tone: mrrUsd > 0 ? 'good' : 'bad',
    measured: true,
    target: `${activeSubscribers} paying${internal}`,
    href,
  };
}

function usersTile(funnel: OvieFunnelInput | null): OvieCompanyTile {
  const created = funnel?.stages.find(
    stage => stage.key === 'accounts_created'
  );
  if (!created)
    return unmeasured(
      'users',
      'New accounts (7d)',
      'Funnel unavailable',
      APP_ROUTES.ADMIN_OPERATIONS
    );
  const activated = funnel?.stages.find(
    stage => stage.key === 'onboarding_complete'
  );
  return {
    key: 'users',
    label: 'New accounts (7d)',
    value: String(created.count),
    tone: created.count > 0 ? (activated?.count ? 'good' : 'warn') : 'bad',
    measured: true,
    target:
      activated === undefined ? null : `${activated.count} reached first value`,
    href: created.drillDownHref,
  };
}

/**
 * Certified = the golden-path verdict: founder lock (or later) with judged
 * evidence. Production test passes are one tier among ten and never count as
 * certified on their own.
 */
function goldenTile(
  rows: readonly OvieGoldenPathRow[] | null
): OvieCompanyTile {
  const href = APP_ROUTES.ADMIN_CERTIFICATIONS;
  const flows = rows?.filter(row => row.domain === 'flows') ?? null;
  if (!flows || flows.length === 0)
    return unmeasured(
      'golden-path',
      'Golden path',
      'Certification unavailable',
      href
    );
  const certified = flows.filter(row => CERTIFIED_STATES.has(row.state));
  const failing = flows.filter(row =>
    Object.values(row.tiers).includes('failed')
  ).length;
  const judged = flows.filter(
    row => row.tiers.visual_proof === 'passed'
  ).length;
  return {
    key: 'golden-path',
    label: 'Golden path',
    value: `${certified.length} of ${flows.length} certified`,
    tone:
      certified.length === flows.length
        ? 'good'
        : failing > 0 || certified.length === 0
          ? 'bad'
          : 'warn',
    measured: true,
    target:
      failing > 0
        ? `${failing} failing a check · ${judged} video-judged`
        : `${judged} of ${flows.length} video-judged`,
    href,
  };
}

export function buildCompanyTiles(input: {
  readonly metrics: OvieCompanyMetricsInput | null;
  readonly funnel: OvieFunnelInput | null;
  readonly goldenPath: readonly OvieGoldenPathRow[] | null;
}): readonly OvieCompanyTile[] {
  return [
    cashTile(input.metrics),
    mrrTile(input.metrics),
    usersTile(input.funnel),
    goldenTile(input.goldenPath),
  ];
}
