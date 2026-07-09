/**
 * Artist revenue cohorts: assignment, baseline capture, and rolling revenue
 * signal (gap 2 of docs/REVENUE_LIFT_METRICS.md, JovieInc/Jovie#12141).
 *
 * - `jovie_active` = artist with ≥1 shipped Jovie automation (completed
 *   workflow_run with an outcome snapshot). Assigned automatically the first
 *   time an outcome row is recorded (see outcome-attribution.ts wiring).
 * - `control` = matched artist (similar catalog size / genre) with a profile
 *   but no automations. Assigned explicitly with match criteria.
 *
 * The baseline is an immutable 30-day pre-activation snapshot of the same
 * revenue signal used for rolling windows, so lift = signal(window) − baseline
 * compares like against like. All proxy terms are dollarized through
 * `revenue-lift-weights.ts` and labeled with the weights version.
 */

import 'server-only';

import { and, sql as drizzleSql, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { audienceMembers, clickEvents, tips } from '@/lib/db/schema/analytics';
import { merchOrders } from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type ArtistCohortMatchCriteria,
  type ArtistRevenueCohort,
  type ArtistRevenueCohortRow,
  artistRevenueCohorts,
} from '@/lib/db/schema/revenue-cohorts';
import {
  dollarizeRevenueLiftCents,
  REVENUE_LIFT_WEIGHTS_VERSION,
} from '@/lib/metrics/revenue-lift-weights';
import { RELEASE_GMV_COUNTABLE_ORDER_STATUSES } from '@/lib/release-to-revenue/gmv-attribution';
import { logger } from '@/lib/utils/logger';

export const BASELINE_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RevenueSignalWindow {
  readonly start: Date;
  readonly end: Date;
}

/**
 * Per-artist revenue signal over a window. GMV and tips are real revenue;
 * DSP clicks and captured fans are weighted proxies (see revenue-lift-weights).
 */
export interface ArtistRevenueSignal {
  readonly creatorProfileId: string;
  readonly gmvCents: number;
  readonly tipsCents: number;
  readonly dspClickCount: number;
  readonly newFanCount: number;
  /** gmv + tips + weighted clicks + weighted fans, integer cents. */
  readonly revenueSignalCents: number;
}

function emptySignal(creatorProfileId: string): ArtistRevenueSignal {
  return {
    creatorProfileId,
    gmvCents: 0,
    tipsCents: 0,
    dspClickCount: 0,
    newFanCount: 0,
    revenueSignalCents: 0,
  };
}

function dollarizeSignal(input: {
  readonly gmvCents: number;
  readonly tipsCents: number;
  readonly dspClickCount: number;
  readonly newFanCount: number;
}): number {
  return (
    input.tipsCents +
    dollarizeRevenueLiftCents({
      gmvDeltaCents: input.gmvCents,
      dspClickDelta: input.dspClickCount,
      newFansDelta: input.newFanCount,
    })
  );
}

/**
 * Compute the revenue signal for a set of creator profiles over a window.
 * Batched GROUP BY aggregations (4 queries total) — never per-artist loops.
 */
export async function computeRevenueSignals(input: {
  readonly creatorProfileIds: readonly string[];
  readonly window: RevenueSignalWindow;
}): Promise<Map<string, ArtistRevenueSignal>> {
  const ids = [...new Set(input.creatorProfileIds)];
  const signals = new Map<string, ArtistRevenueSignal>();
  for (const id of ids) {
    signals.set(id, emptySignal(id));
  }
  if (ids.length === 0) {
    return signals;
  }

  const { start, end } = input.window;

  const [gmvRows, tipRows, clickRows, fanRows] = await Promise.all([
    db
      .select({
        creatorProfileId: merchOrders.creatorProfileId,
        gmvCents: drizzleSql<number>`coalesce(sum(${merchOrders.subtotalCents}), 0)::int`,
      })
      .from(merchOrders)
      .where(
        and(
          inArray(merchOrders.creatorProfileId, ids),
          inArray(merchOrders.status, [
            ...RELEASE_GMV_COUNTABLE_ORDER_STATUSES,
          ]),
          gte(merchOrders.createdAt, start),
          lte(merchOrders.createdAt, end)
        )
      )
      .groupBy(merchOrders.creatorProfileId),
    db
      .select({
        creatorProfileId: tips.creatorProfileId,
        tipsCents: drizzleSql<number>`coalesce(sum(${tips.amountCents}), 0)::int`,
      })
      .from(tips)
      .where(
        and(
          inArray(tips.creatorProfileId, ids),
          eq(tips.status, 'completed'),
          gte(tips.createdAt, start),
          lte(tips.createdAt, end)
        )
      )
      .groupBy(tips.creatorProfileId),
    db
      .select({
        creatorProfileId: clickEvents.creatorProfileId,
        dspClickCount: drizzleSql<number>`count(*)::int`,
      })
      .from(clickEvents)
      .where(
        and(
          inArray(clickEvents.creatorProfileId, ids),
          eq(clickEvents.linkType, 'listen'),
          eq(clickEvents.isBot, false),
          gte(clickEvents.createdAt, start),
          lte(clickEvents.createdAt, end)
        )
      )
      .groupBy(clickEvents.creatorProfileId),
    db
      .select({
        creatorProfileId: audienceMembers.creatorProfileId,
        newFanCount: drizzleSql<number>`count(*)::int`,
      })
      .from(audienceMembers)
      .where(
        and(
          inArray(audienceMembers.creatorProfileId, ids),
          gte(audienceMembers.firstSeenAt, start),
          lte(audienceMembers.firstSeenAt, end),
          or(
            drizzleSql`${audienceMembers.email} IS NOT NULL`,
            drizzleSql`${audienceMembers.phone} IS NOT NULL`
          )
        )
      )
      .groupBy(audienceMembers.creatorProfileId),
  ]);

  const patch = (
    creatorProfileId: string,
    update: Partial<ArtistRevenueSignal>
  ) => {
    const current =
      signals.get(creatorProfileId) ?? emptySignal(creatorProfileId);
    signals.set(creatorProfileId, { ...current, ...update });
  };

  for (const row of gmvRows) {
    patch(row.creatorProfileId, { gmvCents: Number(row.gmvCents ?? 0) });
  }
  for (const row of tipRows) {
    patch(row.creatorProfileId, { tipsCents: Number(row.tipsCents ?? 0) });
  }
  for (const row of clickRows) {
    patch(row.creatorProfileId, {
      dspClickCount: Number(row.dspClickCount ?? 0),
    });
  }
  for (const row of fanRows) {
    patch(row.creatorProfileId, { newFanCount: Number(row.newFanCount ?? 0) });
  }

  for (const [id, signal] of signals) {
    signals.set(id, {
      ...signal,
      revenueSignalCents: dollarizeSignal(signal),
    });
  }

  return signals;
}

export interface AssignArtistCohortInput {
  readonly userId: string;
  readonly cohort: ArtistRevenueCohort;
  /**
   * jovie_active: when the first automation shipped (baseline window ends
   * here). control: defaults to now.
   */
  readonly activatedAt?: Date;
  readonly matchCriteria?: ArtistCohortMatchCriteria;
}

/**
 * Assign an artist to a cohort and snapshot the 30-day pre-activation
 * baseline. Idempotent: an existing assignment (and its immutable baseline)
 * is returned untouched — cohort membership is decided once.
 */
export async function assignArtistCohort(
  input: AssignArtistCohortInput
): Promise<ArtistRevenueCohortRow | null> {
  const [existing] = await db
    .select()
    .from(artistRevenueCohorts)
    .where(eq(artistRevenueCohorts.userId, input.userId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, input.userId))
    .limit(1);

  const activatedAt = input.activatedAt ?? new Date();
  const baselineWindowEnd = activatedAt;
  const baselineWindowStart = new Date(
    baselineWindowEnd.getTime() - BASELINE_WINDOW_DAYS * MS_PER_DAY
  );

  let baseline = emptySignal(profile?.id ?? '');
  if (profile?.id) {
    const signals = await computeRevenueSignals({
      creatorProfileIds: [profile.id],
      window: { start: baselineWindowStart, end: baselineWindowEnd },
    });
    baseline = signals.get(profile.id) ?? baseline;
  }

  const matchCriteria: ArtistCohortMatchCriteria = {
    ...(profile?.genres ? { genres: profile.genres } : {}),
    ...(typeof profile?.spotifyFollowers === 'number'
      ? { spotifyFollowers: profile.spotifyFollowers }
      : {}),
    ...input.matchCriteria,
  };

  const [inserted] = await db
    .insert(artistRevenueCohorts)
    .values({
      userId: input.userId,
      creatorProfileId: profile?.id ?? null,
      cohort: input.cohort,
      activatedAt: input.cohort === 'jovie_active' ? activatedAt : null,
      matchCriteria,
      baselineWindowStart,
      baselineWindowEnd,
      baselineGmvCents: baseline.gmvCents,
      baselineTipsCents: baseline.tipsCents,
      baselineDspClickCount: baseline.dspClickCount,
      baselineNewFanCount: baseline.newFanCount,
      baselineRevenueSignalCents: baseline.revenueSignalCents,
      baselineWeightsVersion: REVENUE_LIFT_WEIGHTS_VERSION,
    })
    .onConflictDoNothing({ target: artistRevenueCohorts.userId })
    .returning();

  if (inserted) {
    logger.info('[artist-revenue-cohorts] assigned cohort', {
      userId: input.userId,
      cohort: input.cohort,
      baselineRevenueSignalCents: baseline.revenueSignalCents,
    });
    return inserted;
  }

  // Lost a concurrent insert race — return the winner's row.
  const [winner] = await db
    .select()
    .from(artistRevenueCohorts)
    .where(eq(artistRevenueCohorts.userId, input.userId))
    .limit(1);
  return winner ?? null;
}

/**
 * Best-effort jovie_active tagging, called when a workflow-run outcome is
 * recorded. Analytics wiring must never break the automation path, so
 * failures are logged and swallowed.
 */
export async function ensureJovieActiveCohort(input: {
  readonly userId: string;
  readonly activatedAt: Date;
}): Promise<void> {
  try {
    await assignArtistCohort({
      userId: input.userId,
      cohort: 'jovie_active',
      activatedAt: input.activatedAt,
    });
  } catch (error) {
    logger.error(
      '[artist-revenue-cohorts] failed to ensure jovie_active cohort',
      { userId: input.userId, error }
    );
  }
}

/**
 * The queryable per-artist row: cohort tag + revenue signal for any rolling
 * window + lift vs. the immutable baseline.
 *
 * ASSUMPTION (labeled): the baseline is a fixed 30-day snapshot; lift
 * comparisons are meaningful for ~30-day rolling windows. Callers using a
 * different window length should pro-rate or ignore `liftCents`.
 */
export interface ArtistCohortRevenueRow {
  readonly userId: string;
  readonly creatorProfileId: string | null;
  readonly cohort: ArtistRevenueCohort;
  readonly assignedAt: Date;
  readonly activatedAt: Date | null;
  readonly window: RevenueSignalWindow;
  readonly signal: ArtistRevenueSignal | null;
  readonly baselineRevenueSignalCents: number;
  readonly baselineWeightsVersion: string;
  /** signal.revenueSignalCents − baselineRevenueSignalCents (null without a profile). */
  readonly liftCents: number | null;
}

/**
 * Emit per-artist cohort tag + revenue signal + baseline lift for a rolling
 * window — the queryable "view" behind the Ovie/HUD dashboard.
 */
export async function listArtistCohortRevenueRows(input: {
  readonly window: RevenueSignalWindow;
  readonly cohort?: ArtistRevenueCohort;
}): Promise<ArtistCohortRevenueRow[]> {
  const rows = await db
    .select()
    .from(artistRevenueCohorts)
    .where(
      input.cohort ? eq(artistRevenueCohorts.cohort, input.cohort) : undefined
    );

  const profileIds = rows
    .map(row => row.creatorProfileId)
    .filter((id): id is string => Boolean(id));

  const signals = await computeRevenueSignals({
    creatorProfileIds: profileIds,
    window: input.window,
  });

  return rows.map(row => {
    const signal = row.creatorProfileId
      ? (signals.get(row.creatorProfileId) ?? null)
      : null;
    return {
      userId: row.userId,
      creatorProfileId: row.creatorProfileId,
      cohort: row.cohort as ArtistRevenueCohort,
      assignedAt: row.assignedAt,
      activatedAt: row.activatedAt,
      window: input.window,
      signal,
      baselineRevenueSignalCents: row.baselineRevenueSignalCents,
      baselineWeightsVersion: row.baselineWeightsVersion,
      liftCents: signal
        ? signal.revenueSignalCents - row.baselineRevenueSignalCents
        : null,
    };
  });
}
