/**
 * IRPAA — Incremental Revenue per Active Artist (North Star, Tier A).
 *
 * Canonical rollup (gap 3 of docs/REVENUE_LIFT_METRICS.md,
 * JovieInc/Jovie#12141): joins the dollarization weights (gap 1) and the
 * active-artist denominator (gap 2) over `workflow_run_outcomes`.
 *
 *   IRPAA = Σ(dollarized revenue_lift from automations in window)
 *         / active_artists_in_window
 *
 * `active artist` = distinct user with ≥1 recorded automation outcome whose
 * attribution window overlaps the requested window (the jovie_active cohort
 * definition applied to the window).
 *
 * ASSUMPTIONS (labeled, proxy-based): the streaming and fan-capture terms are
 * weighted proxies from `revenue-lift-weights.ts` — the returned object
 * embeds the weights snapshot (version + lastValidatedAt) so no IRPAA number
 * circulates without its assumptions. True royalty validation path: compare
 * proxy terms against realized GMV + tips per the doc, then recalibrate.
 */

import 'server-only';

import { and, sql as drizzleSql, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowRunOutcomes } from '@/lib/db/schema/connectors';
import {
  dollarizeRevenueLiftCents,
  getRevenueLiftWeightsSnapshot,
  type RevenueLiftWeightsSnapshot,
} from '@/lib/metrics/revenue-lift-weights';

export interface IrpaaWindow {
  readonly start: Date;
  readonly end: Date;
}

export interface IrpaaResult {
  readonly window: IrpaaWindow;
  /** Distinct artists with ≥1 automation outcome overlapping the window. */
  readonly activeArtists: number;
  /** Automation outcome rows contributing to the numerator. */
  readonly runCount: number;
  /** Raw (unweighted) term totals across the window. */
  readonly totals: {
    readonly gmvDeltaCents: number;
    readonly dspClickDelta: number;
    readonly newFansDelta: number;
  };
  /** Σ dollarized revenue_lift across all automations in the window (cents). */
  readonly totalRevenueLiftCents: number;
  /** The single North Star number: totalRevenueLiftCents / activeArtists. 0 when no active artists. */
  readonly irpaaCents: number;
  /** Weights + version + last-validated date that produced this figure. */
  readonly weights: RevenueLiftWeightsSnapshot;
}

/**
 * Compute IRPAA for a window (default callers should use a rolling 30-day
 * window). Outcome rows are included when their attribution window overlaps
 * the requested window — same overlap semantics as
 * `sumArtistAutomationAttributedRevenue`.
 */
export async function getIRPAA(window: IrpaaWindow): Promise<IrpaaResult> {
  const [row] = await db
    .select({
      activeArtists: drizzleSql<number>`count(distinct ${workflowRunOutcomes.userId})::int`,
      runCount: drizzleSql<number>`count(*)::int`,
      gmvDeltaCents: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.gmvDeltaCents}), 0)::int`,
      dspClickDelta: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.dspClickDelta}), 0)::int`,
      newFansDelta: drizzleSql<number>`coalesce(sum(${workflowRunOutcomes.newFansDelta}), 0)::int`,
    })
    .from(workflowRunOutcomes)
    .where(
      and(
        gte(workflowRunOutcomes.windowEnd, window.start),
        lte(workflowRunOutcomes.windowStart, window.end)
      )
    );

  const activeArtists = Number(row?.activeArtists ?? 0);
  const totals = {
    gmvDeltaCents: Number(row?.gmvDeltaCents ?? 0),
    dspClickDelta: Number(row?.dspClickDelta ?? 0),
    newFansDelta: Number(row?.newFansDelta ?? 0),
  };

  const totalRevenueLiftCents = dollarizeRevenueLiftCents({
    gmvDeltaCents: totals.gmvDeltaCents,
    dspClickDelta: totals.dspClickDelta,
    newFansDelta: totals.newFansDelta,
  });

  return {
    window,
    activeArtists,
    runCount: Number(row?.runCount ?? 0),
    totals,
    totalRevenueLiftCents,
    irpaaCents:
      activeArtists > 0 ? Math.round(totalRevenueLiftCents / activeArtists) : 0,
    weights: getRevenueLiftWeightsSnapshot(),
  };
}

/** Convenience: IRPAA over the trailing 30 days ending now. */
export async function getRolling30DayIRPAA(
  now: Date = new Date()
): Promise<IrpaaResult> {
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return getIRPAA({ start, end: now });
}
