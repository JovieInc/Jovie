import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  LYB_PROOF_BRIEF_BRAND,
  MAX_SUPPORTING_POINTS,
  type ProofBriefEvidence,
  type ProofBriefPoint,
  type ProofBriefPrivacy,
  type ProofBriefWindow,
} from './contract';

/**
 * Log Your Body progress adapter (JOV-7220).
 *
 * Normalizes comparable LYB measurements into the shared proof-brief/v1
 * contract so the same composer and renderers serve both products — no
 * separate fitness card system. Measurements are reported as observed facts
 * (attribution `observed`); the adapter never infers medical outcomes or
 * causal claims.
 */

export interface LybReading {
  readonly value: number;
  /** ISO timestamp the reading was captured. */
  readonly measuredAt: string;
}

export interface LybProgressMeasurement {
  /** Stable metric key, e.g. "body-fat", "ffmi", "bench-1rm". */
  readonly metricId: string;
  /** Display name, e.g. "Body fat", "Bench press 1RM". */
  readonly label: string;
  /** Unit suffix rendered after deltas, e.g. "pts", "lb", "%". */
  readonly unit: string;
  readonly baseline: LybReading;
  readonly current: LybReading;
  /** Where the readings can be audited (app surface or export). */
  readonly sourceUrl: string;
  /** Optional caveat, e.g. "estimated via skinfold calipers". */
  readonly limitation?: string;
}

interface LybProgressBriefInput {
  readonly briefId: string;
  readonly revision: number;
  readonly subject: string;
  readonly window: ProofBriefWindow;
  /** Ordered comparable measurements; the first (or heroMetricId) is the hero. */
  readonly measurements: readonly LybProgressMeasurement[];
  /** Hero override; defaults to the first measurement. */
  readonly heroMetricId?: string;
  /** Tracked outcomes with no comparable data this window. */
  readonly unknowns: readonly string[];
  /** Disclosure/share eligibility for every rendered surface. */
  readonly privacy: ProofBriefPrivacy;
  readonly generatedAt: string;
  readonly expiresAt: string;
}

function isIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function formatDelta(delta: number): string {
  return `${delta < 0 ? '-' : delta > 0 ? '+' : ''}${formatNumber(Math.abs(delta))}`;
}

/** Build a certified LYB progress brief over the selected period. */
export function buildLybProgressBrief(
  input: LybProgressBriefInput
): CertifiedProofBrief {
  const start = Date.parse(`${input.window.start}T00:00:00.000Z`);
  const endExclusive =
    Date.parse(`${input.window.end}T00:00:00.000Z`) + 86_400_000;
  const generatedAt = Date.parse(input.generatedAt);
  if (
    !isIso(input.window.start) ||
    !isIso(input.window.end) ||
    start >= endExclusive
  ) {
    throw new TypeError('LYB briefs need a valid window with end after start.');
  }
  if (input.measurements.length > MAX_SUPPORTING_POINTS + 1) {
    throw new TypeError(
      `LYB briefs render at most ${MAX_SUPPORTING_POINTS + 1} measurements.`
    );
  }

  const seen = new Set<string>();
  const evidence: ProofBriefEvidence[] = [];
  for (const m of input.measurements) {
    const base = Date.parse(m.baseline.measuredAt);
    const current = Date.parse(m.current.measuredAt);
    if (
      seen.has(m.metricId) ||
      !Number.isFinite(m.baseline.value) ||
      !Number.isFinite(m.current.value) ||
      !isIso(m.baseline.measuredAt) ||
      !isIso(m.current.measuredAt) ||
      !URL.canParse(m.sourceUrl) ||
      base < start ||
      base >= current ||
      current >= endExclusive ||
      current > generatedAt
    ) {
      throw new TypeError(
        `LYB measurement ${m.metricId} is not a comparable in-window pair.`
      );
    }
    seen.add(m.metricId);
    for (const [leg, reading] of [
      ['baseline', m.baseline],
      ['current', m.current],
    ] as const) {
      evidence.push({
        id: `lyb:${m.metricId}:${leg}`,
        kind: 'observation',
        occurredAt: reading.measuredAt,
        sourceUrl: m.sourceUrl,
        summary: `${m.label} ${leg} reading of ${formatNumber(reading.value)} ${m.unit} recorded in LogYourBody.`,
      });
    }
  }

  const hero =
    input.measurements.find(m => m.metricId === input.heroMetricId) ??
    input.measurements[0];
  const supporting = input.measurements.filter(m => m !== hero);

  const pointFor = (m: LybProgressMeasurement): ProofBriefPoint => ({
    value: `${formatDelta(m.current.value - m.baseline.value)} ${m.unit}`,
    label: m.label,
    attribution: 'observed',
    evidenceIds: [`lyb:${m.metricId}:baseline`, `lyb:${m.metricId}:current`],
  });

  const unknowns = [
    ...input.unknowns,
    ...input.measurements.flatMap(m => (m.limitation ? [m.limitation] : [])),
  ];
  const status = hero ? 'progress' : 'insufficient-evidence';

  const brief: CertifiedProofBrief = {
    schema: 'proof-brief/v1',
    briefId: input.briefId,
    revision: input.revision,
    status,
    subject: input.subject,
    window: input.window,
    hero: hero
      ? {
          sentence: `${hero.label} moved from ${formatNumber(hero.baseline.value)} ${hero.unit} to ${formatNumber(hero.current.value)} ${hero.unit} over ${input.window.label}.`,
          value: `${formatDelta(hero.current.value - hero.baseline.value)} ${hero.unit}`,
          label: hero.label,
          attribution: 'observed',
          evidenceIds: [
            `lyb:${hero.metricId}:baseline`,
            `lyb:${hero.metricId}:current`,
          ],
        }
      : {
          sentence:
            'LogYourBody does not have comparable measurements to recap this period yet.',
          attribution: 'observed',
          evidenceIds: [],
        },
    supportingPoints: supporting.map(pointFor),
    evidence,
    unknowns:
      unknowns.length > 0 || hero
        ? unknowns
        : ['comparable body-composition measurements'],
    privacy: input.privacy,
    generatedAt: input.generatedAt,
    expiresAt: input.expiresAt,
    brand: LYB_PROOF_BRIEF_BRAND,
  };
  assertProofBriefRenderable(brief, { now: new Date(input.generatedAt) });
  return brief;
}

const LYB_FIXTURE_WINDOW = {
  start: '2026-08-31',
  end: '2026-09-28',
  label: 'Aug 31 to Sep 28, 2026',
} as const;

/**
 * Deterministic LYB fixture for preview/export parity checks. All values are
 * synthetic fixture data — never render this on a real user's surface.
 */
export const LYB_FIXTURE_PROOF_BRIEF = buildLybProgressBrief({
  briefId: 'pb_lyb_fixture_progress',
  revision: 1,
  subject: 'LYB Fixture Athlete',
  window: LYB_FIXTURE_WINDOW,
  measurements: [
    {
      metricId: 'body-fat',
      label: 'Body fat',
      unit: 'pts',
      baseline: { value: 21.4, measuredAt: '2026-08-31T08:00:00.000Z' },
      current: { value: 19.9, measuredAt: '2026-09-28T08:00:00.000Z' },
      sourceUrl: 'https://logyourbody.com/fixture/measurements/body-fat',
      limitation: 'body-fat readings are estimates, not clinical measurements',
    },
    {
      metricId: 'ffmi',
      label: 'FFMI',
      unit: 'pts',
      baseline: { value: 20.8, measuredAt: '2026-08-31T08:00:00.000Z' },
      current: { value: 21.4, measuredAt: '2026-09-28T08:00:00.000Z' },
      sourceUrl: 'https://logyourbody.com/fixture/measurements/ffmi',
    },
    {
      metricId: 'bench-1rm',
      label: 'Bench press 1RM',
      unit: 'lb',
      baseline: { value: 185, measuredAt: '2026-09-02T17:30:00.000Z' },
      current: { value: 200, measuredAt: '2026-09-26T17:30:00.000Z' },
      sourceUrl: 'https://logyourbody.com/fixture/lifts/bench-press',
    },
    {
      metricId: 'check-in-streak',
      label: 'Check-in streak',
      unit: 'days',
      baseline: { value: 4, measuredAt: '2026-08-31T09:00:00.000Z' },
      current: { value: 12, measuredAt: '2026-09-28T09:00:00.000Z' },
      sourceUrl: 'https://logyourbody.com/fixture/adherence/check-ins',
    },
  ],
  unknowns: ['resting heart rate', 'sleep duration'],
  privacy: 'public',
  generatedAt: '2026-09-29T22:30:00.000Z',
  expiresAt: '2026-10-13T00:00:00.000Z',
});

export const LYB_INSUFFICIENT_PROOF_BRIEF = buildLybProgressBrief({
  briefId: 'pb_lyb_fixture_no_evidence',
  revision: 1,
  subject: 'LYB Fixture Athlete',
  window: LYB_FIXTURE_WINDOW,
  measurements: [],
  unknowns: ['comparable body-composition measurements'],
  privacy: 'public',
  generatedAt: '2026-09-29T22:30:00.000Z',
  expiresAt: '2026-10-13T00:00:00.000Z',
});
