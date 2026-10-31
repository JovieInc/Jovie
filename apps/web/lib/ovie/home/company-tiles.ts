/**
 * Ovie Home company row: "are we winning?" in four tiles. Pure presentation
 * over existing reads only: `/api/hud/metrics` (Stripe + Mercury),
 * `/api/admin/hud/founder-funnel` (accounts and first value, 7d) and
 * `/api/ovie/certifications` (the production golden path). Missing sources
 * stay "Not measured"; a stub never reads as a real zero.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopTile,
  type HomeLoopTone,
} from '@/lib/home-loop/contract';
import type { HudOverviewMetrics } from '@/types/hud';

export type OvieCompanyKey = 'runway' | 'mrr' | 'users' | 'golden-path';
export type OvieCompanyTile = HomeLoopTile<OvieCompanyKey>;

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

function runwayValue(months: number): string {
  if (months < 1) {
    const days = Math.max(0, Math.round(months * 30));
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${months < 10 ? months.toFixed(1) : Math.round(months)} mo`;
}

function unmeasured(
  key: OvieCompanyKey,
  label: string,
  href: string | null
): OvieCompanyTile {
  return {
    key,
    label,
    value: HOME_LOOP_NOT_MEASURED,
    was: null,
    tone: 'neutral',
    measured: false,
    target: null,
    href,
  };
}

function trendTone(now: number, before: number | undefined): HomeLoopTone {
  if (before === undefined) return now > 0 ? 'good' : 'bad';
  if (now > before) return 'good';
  if (now < before) return 'bad';
  return now > 0 ? 'warn' : 'bad';
}

export function buildCompanyTiles(input: {
  readonly overview: HudOverviewMetrics | null;
  readonly funnel: OvieFunnelInput | null;
  readonly goldenPath: readonly OvieGoldenPathRow[] | null;
}): readonly OvieCompanyTile[] {
  const { overview, funnel, goldenPath } = input;
  const ops = APP_ROUTES.ADMIN_OPERATIONS;
  const finance = overview?.financialDataAvailable ? overview : null;

  const runway: OvieCompanyTile =
    finance && finance.runwayMonths !== null
      ? {
          key: 'runway',
          label: 'Runway',
          value: runwayValue(finance.runwayMonths),
          was: null,
          tone:
            finance.defaultStatus === 'alive'
              ? 'good'
              : finance.runwayMonths < 3
                ? 'bad'
                : 'warn',
          measured: true,
          target: `${finance.defaultStatus === 'alive' ? 'Default alive' : finance.defaultStatus === 'dead' ? 'Default dead' : 'Default unknown'} · ${usd.format(finance.balanceUsd)} cash`,
          href: ops,
        }
      : unmeasured('runway', 'Runway', ops);

  const mrr: OvieCompanyTile = finance
    ? {
        key: 'mrr',
        label: 'MRR',
        value: usd.format(finance.mrrUsd),
        was:
          finance.weekAgo === undefined
            ? null
            : `${usd.format(finance.weekAgo.mrrUsd)} 7d ago`,
        tone: trendTone(finance.mrrUsd, finance.weekAgo?.mrrUsd),
        measured: true,
        target: `${finance.activeSubscribers} paying`,
        href: ops,
      }
    : unmeasured('mrr', 'MRR', ops);

  const created = funnel?.stages.find(
    stage => stage.key === 'accounts_created'
  );
  const activated = funnel?.stages.find(
    stage => stage.key === 'onboarding_complete'
  );
  const users: OvieCompanyTile = created
    ? {
        key: 'users',
        label: 'New accounts (7d)',
        value: String(created.count),
        was: null,
        tone: created.count > 0 ? (activated?.count ? 'good' : 'warn') : 'bad',
        measured: true,
        target:
          activated === undefined
            ? null
            : `${activated.count} reached first value`,
        href: created.drillDownHref,
      }
    : unmeasured('users', 'New accounts (7d)', null);

  const flows = goldenPath?.filter(row => row.domain === 'flows') ?? null;
  let golden: OvieCompanyTile;
  if (!flows || flows.length === 0) {
    golden = unmeasured(
      'golden-path',
      'Golden path',
      APP_ROUTES.ADMIN_CERTIFICATIONS
    );
  } else {
    const passing = flows.filter(
      row => row.tiers.runtime_dogfood === 'passed'
    ).length;
    const failing = flows.filter(
      row => row.tiers.runtime_dogfood === 'failed'
    ).length;
    const certified = flows.filter(
      row => row.state === 'shipped' || row.state === 'monitored'
    ).length;
    golden = {
      key: 'golden-path',
      label: 'Golden path',
      value: `${passing} of ${flows.length} pass in prod`,
      was: null,
      tone:
        failing > 0
          ? 'bad'
          : passing === flows.length && certified === flows.length
            ? 'good'
            : 'warn',
      measured: true,
      target: `${certified} of ${flows.length} founder-certified`,
      href: APP_ROUTES.ADMIN_CERTIFICATIONS,
    };
  }

  return [runway, mrr, users, golden];
}
