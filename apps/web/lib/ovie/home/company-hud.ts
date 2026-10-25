import { APP_ROUTES } from '@/constants/routes';
import type { DeliverySummary } from '@/lib/ovie/shipping-state/contract';
import type { HudMetrics } from '@/types/hud';
import type { FleetVerdict } from './fleet-verdict';

/**
 * Ovie Home company tiles, chosen through a YC lens (fleet/ovie-home.md).
 * One line per thing; `details` appear only when the operator opens a tile.
 * A source that is missing reads "Not measured", never a calm default.
 */
export type CompanyTileId =
  | 'alive'
  | 'revenue'
  | 'funnel'
  | 'shipping'
  | 'fleet'
  | 'blocked';

export type CompanyTileTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface CompanyTile {
  readonly id: CompanyTileId;
  readonly label: string;
  /** The one number or word. */
  readonly value: string;
  /** The one line under it. */
  readonly line: string;
  readonly tone: CompanyTileTone;
  readonly measured: boolean;
  readonly href: string;
  readonly hrefLabel: string;
  readonly details: readonly string[];
}

/**
 * The slice of the founder funnel Home reads. Declared here because the
 * funnel module is server-only; the route's JSON matches this shape.
 */
export interface CompanyFunnelInput {
  readonly stages: readonly {
    readonly key: string;
    readonly label: string;
    readonly count: number;
    readonly conversionRate: number | null;
    readonly dropOff: number | null;
  }[];
  readonly biggestDropOffKey: string | null;
}

export interface CompanyInputs {
  readonly overview: HudMetrics['overview'] | null;
  readonly reliability: HudMetrics['reliability'] | null;
  readonly funnel: CompanyFunnelInput | null;
  readonly delivery: DeliverySummary | null;
  readonly verifiedToday: number | null;
  readonly fleet: FleetVerdict | null;
  readonly openAsks: number | null;
  /** Earliest ISO deadline among open asks that carry a default, if any. */
  readonly nextDeadlineIso: string | null;
  readonly nowMs: number;
}

/** Y Combinator's rule of thumb for a healthy early company: 5 to 7 percent a week. */
export const YC_WEEKLY_GROWTH_TARGET_PCT = 5;

const usd = (value: number): string =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });

const NOT_MEASURED = 'Not measured';

function notMeasured(
  id: CompanyTileId,
  label: string,
  href: string,
  hrefLabel: string,
  why: string
): CompanyTile {
  return {
    id,
    label,
    value: NOT_MEASURED,
    line: why,
    tone: 'neutral',
    measured: false,
    href,
    hrefLabel,
    details: [],
  };
}

function runwayText(months: number | null): string {
  if (months === null) return 'runway not measured';
  if (months >= 24) return 'runway 24+ months';
  return `runway ${months.toFixed(1)} ${months === 1 ? 'month' : 'months'}`;
}

function aliveTile(overview: CompanyInputs['overview']): CompanyTile {
  const href = APP_ROUTES.ADMIN_COSTS;
  if (!overview?.financialDataAvailable) {
    return notMeasured(
      'alive',
      'Default Alive',
      href,
      'Capacity',
      'Cash or burn source unavailable.'
    );
  }
  const verdict = overview.defaultStatus;
  return {
    id: 'alive',
    label: 'Default Alive',
    value:
      verdict === 'alive' ? 'Alive' : verdict === 'dead' ? 'Dead' : 'Unknown',
    line: `${usd(overview.balanceUsd)} cash · ${usd(overview.burnRateUsd)}/mo burn · ${runwayText(overview.runwayMonths)}`,
    tone: verdict === 'alive' ? 'good' : verdict === 'dead' ? 'bad' : 'warn',
    measured: true,
    href,
    hrefLabel: 'Capacity',
    details: [overview.defaultStatusDetail],
  };
}

/** Week-over-week growth, or null when there is no baseline to divide by. */
export function weeklyGrowthPct(now: number, weekAgo: number): number | null {
  return weekAgo > 0 ? ((now - weekAgo) / weekAgo) * 100 : null;
}

function revenueTile(overview: CompanyInputs['overview']): CompanyTile {
  const href = APP_ROUTES.ADMIN_OPS;
  if (!overview?.financialDataAvailable) {
    return notMeasured(
      'revenue',
      'MRR',
      href,
      'Ops',
      'Stripe revenue source unavailable.'
    );
  }
  const growth = overview.weekAgo
    ? weeklyGrowthPct(overview.mrrUsd, overview.weekAgo.mrrUsd)
    : null;
  const growthText =
    growth === null
      ? overview.weekAgo
        ? 'no baseline week-over-week (MRR was $0)'
        : 'week-over-week not measured'
      : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% week over week`;
  const tone: CompanyTileTone =
    growth === null
      ? overview.mrrUsd > 0
        ? 'neutral'
        : 'bad'
      : growth >= YC_WEEKLY_GROWTH_TARGET_PCT
        ? 'good'
        : growth > 0
          ? 'warn'
          : 'bad';
  const subscribers = overview.activeSubscribers;
  return {
    id: 'revenue',
    label: 'MRR',
    value: usd(overview.mrrUsd),
    line: `${growthText} · ${subscribers} ${subscribers === 1 ? 'subscriber' : 'subscribers'}`,
    tone,
    measured: true,
    href,
    hrefLabel: 'Ops',
    details: [
      `Target: ${YC_WEEKLY_GROWTH_TARGET_PCT}% or more a week.`,
      ...(overview.weekAgo
        ? [
            `A week ago: ${usd(overview.weekAgo.mrrUsd)} and ${overview.weekAgo.activeSubscribers} subscribers.`,
          ]
        : []),
    ],
  };
}

function funnelTile(funnel: CompanyInputs['funnel']): CompanyTile {
  const href = buildFunnelHref();
  if (!funnel || funnel.stages.length === 0) {
    return notMeasured(
      'funnel',
      'Funnel 7d',
      href,
      'Growth',
      'Funnel source unavailable.'
    );
  }
  const stages = funnel.stages;
  const top = stages[0];
  const last = stages.at(-1);
  const leak = stages.find(stage => stage.key === funnel.biggestDropOffKey);
  const previous = leak ? stages[stages.indexOf(leak) - 1] : undefined;
  const paid = stages.find(stage => stage.key === 'paid') ?? last;
  return {
    id: 'funnel',
    label: 'Funnel 7d',
    value: `${top?.count ?? 0} → ${paid?.count ?? 0}`,
    line:
      leak && previous && (leak.dropOff ?? 0) > 0
        ? `Biggest leak: ${previous.label} to ${leak.label} (−${leak.dropOff})`
        : 'No leak measured yet',
    tone: (paid?.count ?? 0) > 0 ? 'good' : 'warn',
    measured: true,
    href,
    hrefLabel: 'Growth',
    details: [
      ...stages.map(
        stage =>
          `${stage.label}: ${stage.count}${stage.conversionRate === null ? '' : ` (${Math.round(stage.conversionRate * 100)}% of previous)`}`
      ),
      'Weekly active users are not measured: no authoritative source yet.',
    ],
  };
}

function buildFunnelHref(): string {
  return APP_ROUTES.ADMIN_GROWTH;
}

/** Production distance from main, with how long it has been that way. */
function productionBehindDetail(
  delivery: NonNullable<CompanyInputs['delivery']>,
  nowMs: number
): string[] {
  const behind = delivery.production?.behindMain;
  if (!behind || behind.state === 'not-measured')
    return ['Production distance from main is not measured.'];
  if (behind.value === 0) return ['Production is on main.'];
  const deployed = delivery.production?.deployedAt
    ? Date.parse(delivery.production.deployedAt)
    : Number.NaN;
  const age = Number.isFinite(deployed)
    ? ` since the last deploy ${ageText(nowMs - deployed)} ago`
    : '';
  return [
    `Production is ${behind.value} ${behind.value === 1 ? 'commit' : 'commits'} behind main${age}.`,
  ];
}

function ageText(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function shippingTile(
  delivery: CompanyInputs['delivery'],
  verifiedToday: number | null,
  nowMs: number
): CompanyTile {
  const href = APP_ROUTES.ADMIN_SHIPPING;
  const today = delivery?.merges.today;
  if (!delivery || !today || today.state === 'not-measured') {
    return notMeasured(
      'shipping',
      'Shipped Today',
      href,
      'Shipping',
      'Merge source unavailable.'
    );
  }
  const last7 = delivery.merges.last7Days;
  const prior7 = delivery.merges.prior7Days;
  const trend =
    last7.state !== 'not-measured' &&
    prior7.state !== 'not-measured' &&
    prior7.value > 0
      ? `${last7.value >= prior7.value ? '+' : ''}${Math.round(((last7.value - prior7.value) / prior7.value) * 100)}% vs prior 7d`
      : null;
  const verified =
    verifiedToday === null ? '' : ` · ${verifiedToday} verified in production`;
  return {
    id: 'shipping',
    label: 'Shipped Today',
    value: String(today.value),
    line: `${today.value === 1 ? 'merge' : 'merges'}${verified}${trend ? ` · ${trend}` : ''}`,
    tone: today.value > 0 ? 'good' : 'warn',
    measured: true,
    href,
    hrefLabel: 'Shipping',
    details: [
      'Today is midnight to now, Pacific time.',
      last7.state !== 'not-measured'
        ? `${last7.value} merges in the last 7 days.`
        : 'Last 7 days not measured.',
      ...productionBehindDetail(delivery, nowMs),
    ],
  };
}

function fleetTile(
  fleet: CompanyInputs['fleet'],
  reliability: CompanyInputs['reliability']
): CompanyTile {
  const href = APP_ROUTES.ADMIN_OPERATIONS;
  if (!fleet) {
    return notMeasured(
      'fleet',
      'Fleet',
      href,
      'Fleet',
      'Lanes source unavailable.'
    );
  }
  const incidents = reliability?.incidents24h;
  const sentry = reliability?.unresolvedSentryIssues24h;
  const production =
    incidents === undefined
      ? 'production incidents not measured'
      : `${incidents} production ${incidents === 1 ? 'incident' : 'incidents'} in 24h${sentry ? ` · ${sentry} unresolved errors` : ''}`;
  const level = fleet.level;
  return {
    id: 'fleet',
    label: 'Fleet',
    value:
      level === 'healthy'
        ? 'Healthy'
        : level === 'degraded'
          ? 'Degraded'
          : level === 'down'
            ? 'Not reporting'
            : NOT_MEASURED,
    line: `${fleet.capacity ?? 'lanes not measured'} · ${production}`,
    tone:
      level === 'healthy'
        ? 'good'
        : level === 'unknown'
          ? 'neutral'
          : level === 'degraded'
            ? 'warn'
            : 'bad',
    measured: level !== 'unknown',
    href,
    hrefLabel: 'Fleet',
    details: fleet.reasons,
  };
}

function blockedTile(
  openAsks: number | null,
  nextDeadlineIso: string | null,
  nowMs: number
): CompanyTile {
  const href = APP_ROUTES.ADMIN_INBOX;
  if (openAsks === null) {
    return notMeasured(
      'blocked',
      'Blocked On You',
      href,
      'Inbox',
      'Decisions could not load.'
    );
  }
  let deadline = 'nothing waiting on a default';
  if (nextDeadlineIso) {
    const ms = Date.parse(nextDeadlineIso) - nowMs;
    deadline =
      ms <= 0
        ? 'a default applies now'
        : `next default in ${ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : `${Math.round(ms / 3_600_000)}h`}`;
  }
  return {
    id: 'blocked',
    label: 'Blocked On You',
    value: String(openAsks),
    line: openAsks === 0 ? 'Nothing needs your decision' : deadline,
    tone: openAsks === 0 ? 'good' : 'warn',
    measured: true,
    href,
    hrefLabel: 'Inbox',
    details: [],
  };
}

/** Order is the YC reading order: survive, grow, convert, ship, run, decide. */
export function buildCompanyTiles(
  input: CompanyInputs
): readonly CompanyTile[] {
  return [
    aliveTile(input.overview),
    revenueTile(input.overview),
    funnelTile(input.funnel),
    shippingTile(input.delivery, input.verifiedToday, input.nowMs),
    fleetTile(input.fleet, input.reliability),
    blockedTile(input.openAsks, input.nextDeadlineIso, input.nowMs),
  ];
}
