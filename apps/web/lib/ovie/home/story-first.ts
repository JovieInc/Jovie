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
import type { CompanyBlocker } from './company-blocker';
import type { OvieCompanyTile } from './company-tiles';
import {
  OVIE_SHIP_STAGES,
  type OviePulseTile,
  type OvieShipStage,
} from './shipping-home';
import { perDay } from './shipping-pulse-format';

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

const STEP_EYEBROW: Readonly<Record<string, string>> = {
  public_profile: 'Profile',
  homepage_entry: 'Homepage',
  onboarding_auth_claim: 'Claim',
  checkout_payment_entitlement: 'Checkout',
  activation_dashboard: 'Activation',
};

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
    return 'flat';
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
  const currentMerges = input.delivery
    ? perDay(input.delivery.merges.last7Days)
    : null;
  const priorMerges = input.delivery
    ? perDay(input.delivery.merges.prior7Days)
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

  const shipping: StoryFirstGlancePulse = {
    key: 'shipping',
    label: 'Shipping · 7D',
    value: merges?.measured ? merges.value : HOME_LOOP_NOT_MEASURED,
    delta:
      currentMerges !== null
        ? formatDelta(currentMerges, priorMerges, 'flat-label')
        : null,
    tone: merges?.tone ?? 'neutral',
    measured: merges?.measured ?? false,
    points: shippingPoints,
    trend: trendFromPoints(shippingPoints),
    href: merges?.href ?? APP_ROUTES.ADMIN_SHIPPING,
  };

  const revenue: StoryFirstGlancePulse = {
    key: 'revenue',
    label: 'Revenue',
    value: mrr?.measured ? mrr.value : HOME_LOOP_NOT_MEASURED,
    delta: mrrNow !== null ? formatDelta(mrrNow, mrrWas, 'alive') : null,
    tone: mrr?.tone ?? 'neutral',
    measured: mrr?.measured ?? false,
    points: revenuePoints,
    trend: trendFromPoints(revenuePoints),
    href: mrr?.href ?? APP_ROUTES.ADMIN_OPERATIONS,
  };

  const usersPulse: StoryFirstGlancePulse = {
    key: 'users',
    label: 'Users',
    value: users?.measured ? users.value : HOME_LOOP_NOT_MEASURED,
    delta:
      usersNow !== null && Number.isFinite(usersNow)
        ? formatDelta(usersNow, null, 'flat-label')
        : null,
    tone: users?.tone ?? 'neutral',
    measured: users?.measured ?? false,
    points: usersPoints,
    trend: trendFromPoints(usersPoints),
    href: users?.href ?? APP_ROUTES.ADMIN_GROWTH,
  };

  return [shipping, revenue, usersPulse];
}

function stepLabel(step: string): string {
  const labeled = STEP_EYEBROW[step];
  if (labeled) return labeled;
  return step
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortTitle(blocker: CompanyBlocker): string {
  if (blocker.kind === 'certification') {
    const name =
      blocker.step === 'checkout_payment_entitlement'
        ? 'Checkout'
        : blocker.step === 'homepage_entry'
          ? 'Homepage entry'
          : blocker.step === 'public_profile'
            ? 'The public profile'
            : blocker.step === 'onboarding_auth_claim'
              ? 'Sign-up and claim'
              : blocker.step === 'activation_dashboard'
                ? 'First use after paying'
                : stepLabel(blocker.step);
    return `${name} is blocking revenue`;
  }
  // Funnel body already carries the measured detail — headline must differ.
  return `${stepLabel(blocker.step)} is blocking revenue`;
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
    const since =
      input.revenue.since != null
        ? new Date(input.revenue.since).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })
        : null;
    return {
      tone: input.revenue.tone,
      eyebrow: `Bottleneck · ${stepLabel(input.revenue.step)}`,
      title: shortTitle(input.revenue),
      body: input.revenue.text,
      moving: input.highlight
        ? {
            label: `${input.highlight.identifier} · ${input.highlight.title}`,
            href: input.highlight.href,
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
            label: `${input.highlight.identifier} · ${input.highlight.title}`,
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
            label: `${input.highlight.identifier} · ${input.highlight.title}`,
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
          label: `${input.highlight.identifier} · ${input.highlight.title}`,
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
