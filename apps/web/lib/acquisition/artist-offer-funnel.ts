/**
 * Artist-offer revenue funnel: visit → pricing → claim start → sign-in →
 * checkout → paid → profile live, for the $12/month self-serve artist
 * profile (EVENT: Tim, 2026-10-20).
 *
 * Stage ids follow the `jovie-stage-event/v1` contract (kebab-case,
 * `revenue-funnel` entity). The entity is one consented first-party
 * acquisition journey (`acquisition_journeys.id`); only aggregates leave the
 * app. `visit` and `sign-in` are derived from the journey row
 * (`captured_at`, `linked_at`); every other stage is recorded once, at its
 * first occurrence, in `acquisition_journey_stages`.
 *
 * Pure module: stage registry and report math. Persistence lives in
 * `artist-offer-funnel.server.ts`.
 */

export const ARTIST_OFFER_FUNNEL_STAGES = [
  'visit',
  'pricing',
  'claim-start',
  'sign-in',
  'checkout',
  'paid',
  'profile-live',
] as const;

export type ArtistOfferFunnelStage =
  (typeof ARTIST_OFFER_FUNNEL_STAGES)[number];

/**
 * Branch stages sit off the linear funnel. `pending-verification` is reached
 * after `paid` when a high-reach artist claim waits for ownership
 * verification (`lib/claim/claim-verification.ts`) instead of going live.
 */
export const ARTIST_OFFER_BRANCH_STAGES = [
  { stage: 'pending-verification', from: 'paid' },
  { stage: 'claim-verified', from: 'pending-verification' },
  { stage: 'claim-rejected', from: 'pending-verification' },
] as const satisfies readonly {
  readonly stage: string;
  readonly from: string;
}[];

export type ArtistOfferBranchStage =
  (typeof ARTIST_OFFER_BRANCH_STAGES)[number]['stage'];

type ArtistOfferAnyStage = ArtistOfferFunnelStage | ArtistOfferBranchStage;

/** Stages written by producers; the rest are derived from the journey row. */
export const RECORDED_ARTIST_OFFER_STAGES = [
  'pricing',
  'claim-start',
  'checkout',
  'paid',
  'profile-live',
  'pending-verification',
  'claim-verified',
  'claim-rejected',
] as const satisfies readonly ArtistOfferAnyStage[];

export type RecordedArtistOfferStage =
  (typeof RECORDED_ARTIST_OFFER_STAGES)[number];

export function isRecordedArtistOfferStage(
  value: unknown
): value is RecordedArtistOfferStage {
  return (
    typeof value === 'string' &&
    (RECORDED_ARTIST_OFFER_STAGES as readonly string[]).includes(value)
  );
}

/** Public paths whose view is itself a funnel stage. */
export function stageForFunnelPath(
  path: string | null | undefined
): RecordedArtistOfferStage | null {
  if (!path) return null;
  const normalized = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return normalized === '/pricing' ? 'pricing' : null;
}

export type ArtistOfferJourneyTimeline = {
  readonly [Stage in ArtistOfferAnyStage]?: Date | null;
};

export interface ArtistOfferStageSummary {
  readonly stage: ArtistOfferFunnelStage;
  /** Journeys that reached this stage. */
  readonly journeys: number;
  /** Share of the previous stage's journeys that reached this stage. */
  readonly conversionFromPrevious: number | null;
  /** Share of all visits that reached this stage. */
  readonly conversionFromVisit: number | null;
  /** Seconds from the previous stage, over journeys with both timestamps. */
  readonly fromPreviousSeconds: DurationSummary;
  /** Seconds from the visit, over journeys with both timestamps. */
  readonly fromVisitSeconds: DurationSummary;
}

export interface ArtistOfferBranchSummary {
  readonly stage: ArtistOfferBranchStage;
  readonly from: ArtistOfferAnyStage;
  /** Journeys that reached this branch stage. */
  readonly journeys: number;
  /** Share of the parent stage's journeys that branched here. */
  readonly conversionFromParent: number | null;
  /** Seconds from the parent stage, over journeys with both timestamps. */
  readonly fromParentSeconds: DurationSummary;
}

export interface DurationSummary {
  readonly samples: number;
  readonly p50: number | null;
  readonly p95: number | null;
}

export interface ArtistOfferFunnelReport {
  readonly schema: 'jovie-artist-offer-funnel/v1';
  readonly entity: 'revenue-funnel';
  readonly window: { readonly start: string; readonly end: string };
  /** Consented journeys only; non-consented visitors are never stored. */
  readonly scope: 'consented_first_party_journeys';
  readonly stages: readonly ArtistOfferStageSummary[];
  /** Off-funnel branches (e.g. paid → pending-verification). */
  readonly branches: readonly ArtistOfferBranchSummary[];
}

/** Nearest-rank percentile; deterministic and dependency-free. */
export function percentile(
  values: readonly number[],
  p: number
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function summarize(values: readonly number[]): DurationSummary {
  return {
    samples: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}

function secondsBetween(
  from: Date | null | undefined,
  to: Date | null | undefined
): number | null {
  if (!from || !to) return null;
  const delta = (to.getTime() - from.getTime()) / 1000;
  return delta >= 0 ? Math.round(delta) : null;
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

/**
 * Aggregate per-journey timelines into stage counts, step conversion and
 * p50/p95 stage timings. `totalVisits` counts every consented journey in the
 * window; `timelines` may be limited to journeys that went past `visit`.
 */
export function buildArtistOfferFunnelReport(input: {
  readonly start: Date;
  readonly end: Date;
  readonly totalVisits: number;
  readonly timelines: readonly ArtistOfferJourneyTimeline[];
}): ArtistOfferFunnelReport {
  const counts = new Map<ArtistOfferFunnelStage, number>();
  counts.set('visit', input.totalVisits);
  for (const stage of ARTIST_OFFER_FUNNEL_STAGES.slice(1)) {
    counts.set(
      stage,
      input.timelines.filter(timeline => Boolean(timeline[stage])).length
    );
  }

  const stages = ARTIST_OFFER_FUNNEL_STAGES.map((stage, index) => {
    const previous = index > 0 ? ARTIST_OFFER_FUNNEL_STAGES[index - 1] : null;
    const fromPrevious: number[] = [];
    const fromVisit: number[] = [];
    if (previous) {
      for (const timeline of input.timelines) {
        const step = secondsBetween(timeline[previous], timeline[stage]);
        if (step !== null) fromPrevious.push(step);
        const total = secondsBetween(timeline.visit, timeline[stage]);
        if (total !== null) fromVisit.push(total);
      }
    }
    const journeys = counts.get(stage) ?? 0;
    return {
      stage,
      journeys,
      conversionFromPrevious: previous
        ? ratio(journeys, counts.get(previous) ?? 0)
        : null,
      conversionFromVisit:
        stage === 'visit' ? null : ratio(journeys, input.totalVisits),
      fromPreviousSeconds: summarize(fromPrevious),
      fromVisitSeconds: summarize(fromVisit),
    } satisfies ArtistOfferStageSummary;
  });

  const reached = (stage: ArtistOfferAnyStage): number =>
    counts.get(stage as ArtistOfferFunnelStage) ??
    input.timelines.filter(timeline => Boolean(timeline[stage])).length;

  const branches = ARTIST_OFFER_BRANCH_STAGES.map(({ stage, from }) => {
    const fromParent: number[] = [];
    for (const timeline of input.timelines) {
      const step = secondsBetween(timeline[from], timeline[stage]);
      if (step !== null) fromParent.push(step);
    }
    const journeys = reached(stage);
    return {
      stage,
      from,
      journeys,
      conversionFromParent: ratio(journeys, reached(from)),
      fromParentSeconds: summarize(fromParent),
    } satisfies ArtistOfferBranchSummary;
  });

  return {
    schema: 'jovie-artist-offer-funnel/v1',
    entity: 'revenue-funnel',
    window: { start: input.start.toISOString(), end: input.end.toISOString() },
    scope: 'consented_first_party_journeys',
    stages,
    branches,
  };
}
