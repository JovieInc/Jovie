/**
 * Story First flat Home adapters (Tim-approved 2026-11-21).
 *
 * Pure presentation over existing company-blocker, shipping-state, and
 * company glance reads. No new ranking engine: three glance pulses, one
 * bottleneck story, stage buckets with a single highlight.
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopConstraint,
  type HomeLoopRow,
  type HomeLoopTone,
} from '@/lib/home-loop/contract';
import type { DeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { movingForBlocker } from './blocker-work';
import { shortTitle, stepLabel } from './bottleneck-copy';
import type { CompanyBlocker } from './company-blocker';
import type { OvieCompanyTile } from './company-tiles';
import {
  OVIE_SHIP_STAGES,
  type OviePulseTile,
  type OvieShipStage,
} from './shipping-home';
import { weekCount } from './shipping-pulse-format';

/** Matches shell Sparkline trend without importing UI into lib. */
export type StoryFirstSparkTrend = 'up' | 'down' | 'flat';

export type StoryFirstGlanceKey = 'shipping' | 'revenue' | 'users';

export interface StoryFirstGlancePulse {
  readonly key: StoryFirstGlanceKey;
  readonly label: string;
  readonly value: string;
  readonly delta: string | null;
  readonly tone: HomeLoopTone;
  readonly measured: boolean;
  /** Why the value is not measured, in plain words; null when measured. */
  readonly reason: string | null;
  readonly points: readonly number[];
  readonly trend: StoryFirstSparkTrend;
  readonly href: string | null;
}

export interface StoryFirstBottleneck {
  readonly tone: 'clear' | 'warn' | 'bad' | 'unknown' | 'loading';
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly moving: {
    readonly label: string;
    readonly href: string | null;
  } | null;
  readonly needs: string | null;
  readonly since: string | null;
  readonly detailsHref: string | null;
}

export interface StoryFirstStageHighlight {
  readonly identifier: string;
  readonly title: string;
  readonly href: string | null;
}

export interface StoryFirstStageBucket {
  readonly stage: OvieShipStage;
  readonly label: string;
  readonly count: number;
  readonly highlight: StoryFirstStageHighlight | null;
}

/** Founder-facing stage labels for the flat board (Review = tested). */
export const STORY_FIRST_STAGE_LABELS: Readonly<Record<OvieShipStage, string>> =
  {
    investigating: 'Investigating',
    building: 'Building',
    tested: 'Review',
    merging: 'Merging',
    deployed: 'Deployed',
    verified: 'Verified',
  };

/**
 * In-flight stages on the flat board. `verified` is omitted on purpose —
 * `buildShipRows` drops production-verified work into "done today", so a
 * Verified column here would always read zero.
 */
export const STORY_FIRST_BOARD_STAGES = [
  'investigating',
  'building',
  'tested',
  'merging',
] as const satisfies readonly OvieShipStage[];

/** Drop a trailing " (ID)" or leading "ID: " when it repeats the identifier. */
export function stripIssueId(identifier: string, title: string): string {
  const id = identifier.trim();
  if (!id) return title;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = title
    .replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`^${escaped}:\\s*`, 'i'), '')
    .trim();
  return stripped || title;
}

export function issueLabel(identifier: string, title: string): string {
  return `${identifier} · ${stripIssueId(identifier, title)}`;
}

function trendFromPoints(points: readonly number[]): StoryFirstSparkTrend {
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined || points.length < 2) {
    return 'flat';
  }
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

/**
 * Prefer real series movement. Tone paint is only for missing prior history
 * that still shows an "alive" delta — otherwise equal endpoints stay flat
 * (real history, $0 with no label, or any non-alive flat series).
 */
function sparkTrendForPulse(
  points: readonly number[],
  tone: HomeLoopTone,
  opts: { readonly hasPriorSeries: boolean; readonly delta: string | null }
): StoryFirstSparkTrend {
  const moved = trendFromPoints(points);
  if (moved !== 'flat') return moved;
  if (!opts.hasPriorSeries && opts.delta === 'alive') {
    return glanceTrendFromTone(tone);
  }
  return 'flat';
}

function formatDelta(
  current: number,
  prior: number | null,
  kind: 'signed' | 'alive' | 'flat-label'
): string | null {
  // Pre-revenue / $0 with no prior must not claim "alive" (and paint red).
  if (prior === null) {
    if (kind !== 'alive') return null;
    return current > 0 ? 'alive' : null;
  }
  if (kind === 'alive') {
    if (current > prior) return 'alive';
    if (current < prior) return 'down';
    // $0 that stayed $0 is not a trend worth a label.
    return current === 0 ? null : 'flat';
  }
  if (kind === 'flat-label') {
    if (current === prior) return 'flat';
    const delta = current - prior;
    return delta > 0 ? `+${delta}` : String(delta);
  }
  const delta = current - prior;
  if (delta === 0) return 'flat';
  return delta > 0 ? `+${delta}` : String(delta);
}

function parseUsd(value: string): number | null {
  const cleaned = value.replaceAll(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Three glance pulses: shipping 7d throughput, revenue (MRR), users (new
 * accounts). Sparklines use only measured endpoints from existing reads —
 * never invented mid-series.
 */
export function buildStoryFirstGlance(input: {
  readonly delivery: DeliverySummary | null;
  readonly company: readonly OvieCompanyTile[];
  readonly shippingPulse: readonly OviePulseTile[];
}): readonly StoryFirstGlancePulse[] {
  const merges = input.shippingPulse.find(tile => tile.key === 'merges-day');
  // The raw 7-day counts, not the per-day average: the label says 7D.
  const currentMerges = input.delivery
    ? weekCount(input.delivery.merges.last7Days)
    : null;
  const priorMerges = input.delivery
    ? weekCount(input.delivery.merges.prior7Days)
    : null;
  const shippingPoints =
    currentMerges !== null && priorMerges !== null
      ? [priorMerges, currentMerges]
      : currentMerges !== null
        ? [currentMerges, currentMerges]
        : [];

  const mrr = input.company.find(tile => tile.key === 'mrr');
  const mrrNow = mrr?.measured ? parseUsd(mrr.value) : null;
  const mrrWas =
    mrr?.was != null ? parseUsd(mrr.was.replace(/\s*7d ago$/, '')) : null;
  const revenuePoints =
    mrrNow !== null && mrrWas !== null
      ? [mrrWas, mrrNow]
      : mrrNow !== null
        ? [mrrNow, mrrNow]
        : [];

  const users = input.company.find(tile => tile.key === 'users');
  const usersNow =
    users?.measured && users.value !== HOME_LOOP_NOT_MEASURED
      ? Number(users.value)
      : null;
  // Funnel 7d is a single measured window today — no invented prior series.
  const usersPoints =
    usersNow !== null && Number.isFinite(usersNow) ? [usersNow, usersNow] : [];

  const shippingTone = merges?.tone ?? 'neutral';
  const shippingDelta =
    currentMerges !== null
      ? formatDelta(currentMerges, priorMerges, 'flat-label')
      : null;
  const shipping: StoryFirstGlancePulse = {
    key: 'shipping',
    label: 'PRs merged · 7D',
    value:
      currentMerges !== null ? String(currentMerges) : HOME_LOOP_NOT_MEASURED,
    delta: shippingDelta,
    tone: shippingTone,
    measured: currentMerges !== null,
    reason:
      currentMerges !== null
        ? null
        : input.delivery
          ? "GitHub's merge count didn't load"
          : 'Waiting for the shipping feed',
    points: shippingPoints,
    trend: sparkTrendForPulse(shippingPoints, shippingTone, {
      hasPriorSeries: priorMerges !== null,
      delta: shippingDelta,
    }),
    href: merges?.href ?? APP_ROUTES.ADMIN_SHIPPING,
  };

  const revenueTone = mrr?.tone ?? 'neutral';
  const revenueDelta =
    mrrNow !== null ? formatDelta(mrrNow, mrrWas, 'alive') : null;
  const revenue: StoryFirstGlancePulse = {
    key: 'revenue',
    label: 'MRR',
    value: mrr?.measured ? mrr.value : HOME_LOOP_NOT_MEASURED,
    delta: revenueDelta,
    tone: revenueTone,
    measured: mrr?.measured ?? false,
    reason: mrr?.measured ? null : "Stripe revenue didn't load",
    points: revenuePoints,
    trend: sparkTrendForPulse(revenuePoints, revenueTone, {
      hasPriorSeries: mrrWas !== null,
      delta: revenueDelta,
    }),
    href: mrr?.href ?? APP_ROUTES.ADMIN_OPERATIONS,
  };

  const usersTone = users?.tone ?? 'neutral';
  const usersDelta =
    usersNow !== null && Number.isFinite(usersNow)
      ? formatDelta(usersNow, null, 'flat-label')
      : null;
  const usersPulse: StoryFirstGlancePulse = {
    key: 'users',
    label: 'New accounts · 7D',
    value: users?.measured ? users.value : HOME_LOOP_NOT_MEASURED,
    delta: usersDelta,
    tone: usersTone,
    measured: users?.measured ?? false,
    reason: users?.measured ? null : "The signup funnel didn't load",
    points: usersPoints,
    trend: sparkTrendForPulse(usersPoints, usersTone, {
      hasPriorSeries: false,
      delta: usersDelta,
    }),
    href: users?.href ?? APP_ROUTES.ADMIN_GROWTH,
  };

  return [shipping, revenue, usersPulse];
}

/**
 * One bottleneck story for the flat hero. Revenue blocker wins; shipping
 * constraint is the floor when revenue is clear (same as homeConstraint).
 * A failed revenue read uses the shipping floor — never a stuck loading
 * skeleton, and never "clear" without a successful revenue read.
 */
export function buildStoryFirstBottleneck(input: {
  readonly revenue: CompanyBlocker | null;
  readonly revenueRead: boolean;
  /** True when the blocker query failed (distinct from still pending). */
  readonly revenueFailed?: boolean;
  readonly constraint: HomeLoopConstraint | null;
  readonly highlight: StoryFirstStageHighlight | null;
  /** Shipping rows; when given, a revenue blocker's Moving line is the row working on it. */
  readonly rows?: readonly HomeLoopRow<OvieShipStage>[];
  readonly clearTitle?: string;
  readonly clearBody?: string;
}): StoryFirstBottleneck {
  if (!input.revenueRead) {
    return {
      tone: 'loading',
      eyebrow: 'Bottleneck',
      title: 'Reading revenue…',
      body: 'Company state is catching up.',
      moving: null,
      needs: null,
      since: null,
      detailsHref: null,
    };
  }

  if (input.revenue) {
    const moving = input.rows
      ? movingForBlocker(input.rows, input.revenue.step)
      : input.highlight;
    const since =
      input.revenue.since != null
        ? new Date(input.revenue.since).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })
        : null;
    return {
      tone: input.revenue.tone === 'bad' ? 'bad' : 'unknown',
      eyebrow:
        input.revenue.tone === 'bad'
          ? `Bottleneck · ${stepLabel(input.revenue.step)}`
          : `Not measured · ${stepLabel(input.revenue.step)}`,
      title: shortTitle(input.revenue),
      body: input.revenue.text,
      moving: moving
        ? {
            label: issueLabel(moving.identifier, moving.title),
            href: moving.href,
          }
        : null,
      needs: input.revenue.nextAction,
      since,
      detailsHref: input.revenue.detailsHref,
    };
  }

  if (input.constraint) {
    return {
      tone: input.constraint.tone,
      eyebrow: 'Bottleneck · Shipping',
      title: input.constraint.text,
      body: input.revenueFailed
        ? 'Revenue state is unavailable; shipping needs attention.'
        : 'Revenue is clear; shipping needs attention.',
      moving: input.highlight
        ? {
            label: issueLabel(
              input.highlight.identifier,
              input.highlight.title
            ),
            href: input.highlight.href,
          }
        : null,
      needs: null,
      since: null,
      detailsHref: input.constraint.detailsHref ?? null,
    };
  }

  if (input.revenueFailed) {
    return {
      tone: 'unknown',
      eyebrow: 'Bottleneck',
      title: 'Revenue state unavailable',
      body: 'Company state could not be read. Retry or check Summer.',
      moving: input.highlight
        ? {
            label: issueLabel(
              input.highlight.identifier,
              input.highlight.title
            ),
            href: input.highlight.href,
          }
        : null,
      needs: null,
      since: null,
      detailsHref: null,
    };
  }

  return {
    tone: 'clear',
    eyebrow: 'Bottleneck',
    title: input.clearTitle ?? 'Nothing is blocking revenue',
    body:
      input.clearBody ??
      'The cone is clear. Shipping stays the quiet pulse — act only when a stage heats up.',
    moving: input.highlight
      ? {
          label: issueLabel(input.highlight.identifier, input.highlight.title),
          href: input.highlight.href,
        }
      : null,
    needs: null,
    since: null,
    detailsHref: null,
  };
}

/**
 * Stage buckets with counts. Exactly one highlight: the lead in-flight row
 * (attention first, then furthest along — same order as shipping rows).
 */
export function buildStoryFirstStages(
  rows: readonly HomeLoopRow<OvieShipStage>[]
): {
  readonly buckets: readonly StoryFirstStageBucket[];
  readonly highlight: StoryFirstStageHighlight | null;
} {
  const lead = rows[0] ?? null;
  const highlight: StoryFirstStageHighlight | null = lead
    ? {
        identifier: lead.identifier,
        title: lead.title,
        href: lead.url,
      }
    : null;

  const counts = Object.fromEntries(
    OVIE_SHIP_STAGES.map(stage => [stage, 0])
  ) as Record<OvieShipStage, number>;
  for (const row of rows) {
    // Deployed work still counts toward the merging lane on the flat board.
    const stage = row.stage === 'deployed' ? 'merging' : row.stage;
    if (stage in counts) counts[stage] += 1;
  }

  const buckets = STORY_FIRST_BOARD_STAGES.map(stage => ({
    stage,
    label: STORY_FIRST_STAGE_LABELS[stage],
    count: counts[stage],
    highlight:
      lead &&
      (lead.stage === stage ||
        (stage === 'merging' && lead.stage === 'deployed'))
        ? highlight
        : null,
  }));

  return { buckets, highlight };
}

/** Tone → sparkline trend for glance pulses that already carry HomeLoopTone. */
export function glanceTrendFromTone(tone: HomeLoopTone): StoryFirstSparkTrend {
  if (tone === 'good') return 'up';
  if (tone === 'bad') return 'down';
  return 'flat';
}
