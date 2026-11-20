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

/**
 * Golden-path stages (free-first claim flow). They share the journey table
 * with the revenue funnel above. `claim-link-open` is an entry cohort (a
 * creator who arrived from an outreach claim link), not a step every journey
 * passes through. `claimed` is the page claimed and live at its free-tier
 * address; `upgrade-viewed` is the first view of the upgrade offer.
 * `catalog-preview` (JOV-9758) is recorded, not linear: the first onboarding
 * preview that rendered at least one release from the artist's real catalog.
 * Non-music creators never reach it, so it is read as a branch off `start`
 * and never flags the weekly stalled-stage invariant.
 */
export const GOLDEN_PATH_ENTRY_STAGE = 'claim-link-open' as const;

export const GOLDEN_PATH_STAGES = [
  'visit',
  'start',
  'sign-in',
  'claimed',
  'upgrade-viewed',
  'checkout',
  'paid',
] as const;

export type GoldenPathStage = (typeof GOLDEN_PATH_STAGES)[number];
export type GoldenPathExtraStage =
  | typeof GOLDEN_PATH_ENTRY_STAGE
  | 'start'
  | 'catalog-preview'
  | 'claimed'
  | 'upgrade-viewed';

/**
 * Waitlist stages (growth spine): `waitlist-join` is the intake submit,
 * `admitted` is the moment the entry is let in (auto, qualified or manual).
 * They share the journey table so loop -> waitlist -> admit -> paid reads off
 * one journey id.
 */
export type WaitlistGrowthStage = 'waitlist-join' | 'admitted';

type ArtistOfferAnyStage =
  | ArtistOfferFunnelStage
  | ArtistOfferBranchStage
  | GoldenPathExtraStage
  | WaitlistGrowthStage;

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
  'claim-link-open',
  'start',
  'catalog-preview',
  'claimed',
  'upgrade-viewed',
  'waitlist-join',
  'admitted',
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
  if (normalized === '/pricing') return 'pricing';
  if (normalized === '/start') return 'start';
  if (normalized === '/onboarding/checkout') return 'upgrade-viewed';
  return null;
}

/**
 * Landing paths that belong to the artist offer (marketing front door and
 * the claim/sign-up path). Every other consented journey (mostly fans landing
 * on artist profiles via the root-layout capture and /api/px) still counts as
 * a `visit`, so the report splits visits by landing to keep the offer funnel
 * readable (production 2026-10-21: 24,046 visits, 0 pricing).
 */
export const OFFER_LANDING_PATHS = [
  '/',
  '/pricing',
  '/claim',
  '/claim/start',
  '/signup',
  '/signin',
  '/start',
] as const;

/** Path of a stored landing (`/x?y`, or a full URL from the profile pixel). */
export function landingPathname(landing: string | null | undefined): string {
  if (!landing) return '/';
  const withoutOrigin = landing.replace(/^https?:\/\/[^/]+/i, '');
  const path = withoutOrigin.split(/[?#]/)[0].replace(/\/+$/, '');
  return path.startsWith('/') ? path : path ? `/${path}` : '/';
}

export function isOfferLanding(landing: string | null | undefined): boolean {
  return (OFFER_LANDING_PATHS as readonly string[]).includes(
    landingPathname(landing)
  );
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
  readonly diagnostics: ArtistOfferFunnelDiagnostics;
  readonly goldenPath?: GoldenPathReport;
}

/**
 * Why a stage can read 0 while visits are high. `stages` is a cohort of
 * journeys first captured in the window; `stageEventsInWindow` counts every
 * journey that reached a recorded stage in the window, whenever it was first
 * captured (returning visitors). Consent-gated visitors are never stored.
 */
export interface ArtistOfferFunnelDiagnostics {
  readonly visitsByLanding: { readonly offer: number; readonly other: number };
  readonly stageEventsInWindow: Readonly<
    Partial<Record<RecordedArtistOfferStage, number>>
  >;
}

export const EMPTY_FUNNEL_DIAGNOSTICS: ArtistOfferFunnelDiagnostics = {
  visitsByLanding: { offer: 0, other: 0 },
  stageEventsInWindow: {},
};

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
  readonly diagnostics?: ArtistOfferFunnelDiagnostics;
  readonly visitsLast7d?: number;
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
    diagnostics: input.diagnostics ?? EMPTY_FUNNEL_DIAGNOSTICS,
    goldenPath: buildGoldenPathReport({
      totalVisits: input.totalVisits,
      timelines: input.timelines,
      visitsLast7d: input.visitsLast7d,
      now: input.end,
    }),
  };
}

export interface GoldenPathStageSummary {
  readonly stage: GoldenPathStage;
  readonly journeys: number;
  readonly conversionFromPrevious: number | null;
  readonly conversionFromVisit: number | null;
  readonly fromPreviousSeconds: DurationSummary;
}

/** Below this many journeys at a stage, say so instead of reading a rate. */
export const GOLDEN_PATH_MIN_SAMPLE = 20;

export interface GoldenPathCohortReport {
  readonly cohort: 'all' | 'claim_link';
  /** Journeys that entered the cohort (all visits, or claim-link opens). */
  readonly entered: number;
  readonly stages: readonly GoldenPathStageSummary[];
  /** True when the cohort is too small to call any conversion a result. */
  readonly underpowered: boolean;
}

export interface GoldenPathReport {
  readonly schema: 'jovie-golden-path-funnel/v1';
  readonly minSample: number;
  /**
   * Invariant: once the previous stage has real traffic this week, every stage
   * must record at least one event this week. A stage listed here has upstream
   * traffic and zero events: broken instrumentation or a dead step, not a
   * conversion rate. (The sign-in stage read 0 for months because linking
   * never matched a user.)
   */
  readonly stalledStages: readonly GoldenPathStage[];
  readonly cohorts: readonly GoldenPathCohortReport[];
  /** Stages with no producer yet, so a zero is not a measurement. */
  readonly uninstrumented: readonly string[];
}

function buildGoldenPathCohort(
  cohort: GoldenPathCohortReport['cohort'],
  entered: number,
  timelines: readonly ArtistOfferJourneyTimeline[]
): GoldenPathCohortReport {
  const reachedCount = (stage: GoldenPathStage): number =>
    stage === 'visit'
      ? entered
      : timelines.filter(timeline => Boolean(timeline[stage])).length;
  const stages = GOLDEN_PATH_STAGES.map((stage, index) => {
    const previous = index > 0 ? GOLDEN_PATH_STAGES[index - 1] : null;
    const fromPrevious: number[] = [];
    if (previous && previous !== 'visit') {
      for (const timeline of timelines) {
        const step = secondsBetween(timeline[previous], timeline[stage]);
        if (step !== null) fromPrevious.push(step);
      }
    }
    const journeys = reachedCount(stage);
    return {
      stage,
      journeys,
      conversionFromPrevious: previous
        ? ratio(journeys, reachedCount(previous))
        : null,
      conversionFromVisit: stage === 'visit' ? null : ratio(journeys, entered),
      fromPreviousSeconds: summarize(fromPrevious),
    } satisfies GoldenPathStageSummary;
  });
  return {
    cohort,
    entered,
    stages,
    underpowered: entered < GOLDEN_PATH_MIN_SAMPLE,
  };
}

/**
 * Golden-path view over the same journey timelines: all journeys, and the
 * claim-link cohort (journeys that opened a claim link) with its own
 * denominator. Pure; the stage list is the contract, not the SQL.
 */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Pure: stages with weekly upstream traffic and no events this week. */
export function findStalledGoldenPathStages(input: {
  readonly timelines: readonly ArtistOfferJourneyTimeline[];
  /** Consented journeys first seen in the last 7 days; omit to skip `start`. */
  readonly visitsLast7d?: number;
  readonly now: Date;
}): GoldenPathStage[] {
  const since = input.now.getTime() - WEEK_MS;
  const inWeek = (stage: GoldenPathStage): number =>
    input.timelines.filter(timeline => {
      const at = timeline[stage];
      return at ? at.getTime() >= since : false;
    }).length;
  const stalled: GoldenPathStage[] = [];
  GOLDEN_PATH_STAGES.forEach((stage, index) => {
    if (index === 0) return;
    const previous = GOLDEN_PATH_STAGES[index - 1];
    const upstream =
      previous === 'visit' ? (input.visitsLast7d ?? 0) : inWeek(previous);
    if (upstream >= GOLDEN_PATH_MIN_SAMPLE && inWeek(stage) === 0) {
      stalled.push(stage);
    }
  });
  return stalled;
}

export function buildGoldenPathReport(input: {
  readonly totalVisits: number;
  readonly timelines: readonly ArtistOfferJourneyTimeline[];
  readonly visitsLast7d?: number;
  readonly now?: Date;
}): GoldenPathReport {
  const claimLink = input.timelines.filter(timeline =>
    Boolean(timeline[GOLDEN_PATH_ENTRY_STAGE])
  );
  return {
    schema: 'jovie-golden-path-funnel/v1',
    minSample: GOLDEN_PATH_MIN_SAMPLE,
    stalledStages: findStalledGoldenPathStages({
      timelines: input.timelines,
      visitsLast7d: input.visitsLast7d,
      now: input.now ?? new Date(),
    }),
    cohorts: [
      buildGoldenPathCohort('all', input.totalVisits, input.timelines),
      buildGoldenPathCohort('claim_link', claimLink.length, claimLink),
    ],
    uninstrumented: ['identity-resolved'],
  };
}
