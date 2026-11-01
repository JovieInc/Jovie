/**
 * Golden-path delight and continuity metrics (golden-path-delight/v1).
 *
 * Tim (2026-10-29): the golden path needs a measure of delight and continuity;
 * abstract away what can be guessed, inferred or attained with high certainty.
 *
 * Each metric is keyed to the consented acquisition journey
 * (`acquisition_journeys.id`) or the onboarding `session_id`, carries machine
 * timestamps, and reports p50/p95 against a target taken from prior art
 * (gbrain research/activation-magic-moments-2026-10-29). A metric with no
 * producer says `uninstrumented`, so a zero is never read as a measurement.
 *
 * Pure module; the queries live in signup-funnel.server.ts and the Summer
 * funnel response carries the result (company-state embeds it).
 */

export const GOLDEN_PATH_DELIGHT_CONTRACT = 'golden-path-delight/v1' as const;

/** Below this many samples a metric reports `insufficient_sample`. */
export const DELIGHT_MIN_SAMPLE = 10;

export type DelightMetricId =
  | 'time_to_wow'
  | 'wow_reach'
  | 'turns_before_wow'
  | 'continuity_breaks'
  | 'upgrade_to_first_use'
  | 'delight_score';

export type DelightStatus =
  | 'on_target'
  | 'off_target'
  | 'insufficient_sample'
  | 'uninstrumented';

export interface DelightTarget {
  /** Upper bound for durations and counts; lower bound for rates and scores. */
  readonly direction: 'at_most' | 'at_least';
  readonly p50?: number;
  readonly p95?: number;
  readonly value?: number;
  /** Prior-art basis for the number. */
  readonly basis: string;
}

export interface DelightMetricDefinition {
  readonly id: DelightMetricId;
  readonly unit: 'seconds' | 'ratio' | 'turns' | 'events_per_journey' | 'score';
  readonly definition: string;
  /** Producer of the timestamps, or null when not yet instrumented. */
  readonly producer: string | null;
  readonly target: DelightTarget;
}

export const DELIGHT_METRICS: readonly DelightMetricDefinition[] = [
  {
    id: 'time_to_wow',
    unit: 'seconds',
    definition:
      'Per journey: first `catalog-preview` (own real releases rendered) minus first `start` (onboarding opened).',
    producer: 'acquisition_journey_stages start, catalog-preview',
    target: {
      direction: 'at_most',
      p50: 10,
      p95: 30,
      basis:
        'Bier: aha within seconds; Lovable/v0 prompt-first value in 2-3 min; Tim: under 30s.',
    },
  },
  {
    id: 'wow_reach',
    unit: 'ratio',
    definition:
      'Journeys with `catalog-preview` / journeys with `start` in the window.',
    producer: 'acquisition_journey_stages start, catalog-preview',
    target: {
      direction: 'at_least',
      value: 0.6,
      basis:
        'Lenny activation benchmark: median 25%, SaaS avg 36%, top quintile ~60%+ from signup; `start` is a higher-intent entry.',
    },
  },
  {
    id: 'turns_before_wow',
    unit: 'turns',
    definition:
      'Per onboarding session: assistant turns (max turn_index + 1). Anything inferable is never asked; the floor is the handle plus one confirm.',
    producer: 'server_analytics_events onboarding_reply',
    target: {
      direction: 'at_most',
      p50: 2,
      p95: 3,
      basis:
        'Duolingo/Lovable value-before-questions; Cal AI asks many questions only after value, before the paywall.',
    },
  },
  {
    id: 'continuity_breaks',
    unit: 'events_per_journey',
    definition:
      'Reloads, dead ends, re-entered data, loads over 1s and layout jumps per journey on golden-path screens.',
    producer: null,
    target: {
      direction: 'at_most',
      value: 0,
      basis: 'JOV-INV-046 no dead ends; Superhuman speed bar (100ms).',
    },
  },
  {
    id: 'upgrade_to_first_use',
    unit: 'ratio',
    definition:
      'Journeys with `paid` that complete the first guided use of a paid feature within 24h.',
    producer: null,
    target: {
      direction: 'at_least',
      value: 0.8,
      basis:
        'Superhuman concierge: every paid user is walked into first use; Reforge setup -> aha -> habit.',
    },
  },
  {
    id: 'delight_score',
    unit: 'score',
    definition:
      'Per recorded run: dogfood-judge receipt steps passing with zero findings / steps judged (0 to 1).',
    producer: null,
    target: {
      direction: 'at_least',
      value: 0.9,
      basis: 'Waitlist admission bar: judge signs off "nothing wrong".',
    },
  },
];

export interface DelightDistribution {
  readonly samples: number;
  readonly p50: number | null;
  readonly p95: number | null;
}

export interface DelightInput {
  readonly timeToWowSeconds: DelightDistribution | null;
  readonly wowReach: {
    readonly reached: number;
    readonly started: number;
  } | null;
  readonly turnsBeforeWow: DelightDistribution | null;
}

export interface DelightMetricReport {
  readonly id: DelightMetricId;
  readonly unit: DelightMetricDefinition['unit'];
  readonly status: DelightStatus;
  readonly samples: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly value: number | null;
  readonly target: DelightTarget;
}

export interface DelightReport {
  readonly contract: typeof GOLDEN_PATH_DELIGHT_CONTRACT;
  readonly minSample: number;
  readonly metrics: readonly DelightMetricReport[];
  /** Metrics with no producer yet: the instrumentation work order. */
  readonly uninstrumented: readonly DelightMetricId[];
}

const within = (
  actual: number | null,
  bound: number | undefined,
  direction: DelightTarget['direction']
): boolean =>
  bound === undefined ||
  (actual !== null &&
    (direction === 'at_most' ? actual <= bound : actual >= bound));

function judge(
  definition: DelightMetricDefinition,
  samples: number,
  p50: number | null,
  p95: number | null,
  value: number | null
): DelightStatus {
  if (definition.producer === null) return 'uninstrumented';
  if (samples < DELIGHT_MIN_SAMPLE) return 'insufficient_sample';
  const { target } = definition;
  return within(p50, target.p50, target.direction) &&
    within(p95, target.p95, target.direction) &&
    within(value, target.value, target.direction)
    ? 'on_target'
    : 'off_target';
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

export function buildDelightReport(input: DelightInput): DelightReport {
  const metrics = DELIGHT_METRICS.map((definition): DelightMetricReport => {
    let samples = 0;
    let p50: number | null = null;
    let p95: number | null = null;
    let value: number | null = null;
    if (definition.id === 'time_to_wow' && input.timeToWowSeconds) {
      ({ samples, p50, p95 } = input.timeToWowSeconds);
    } else if (definition.id === 'turns_before_wow' && input.turnsBeforeWow) {
      ({ samples, p50, p95 } = input.turnsBeforeWow);
    } else if (definition.id === 'wow_reach' && input.wowReach) {
      samples = input.wowReach.started;
      value =
        input.wowReach.started > 0
          ? round(input.wowReach.reached / input.wowReach.started)
          : null;
    }
    return {
      id: definition.id,
      unit: definition.unit,
      status: judge(definition, samples, p50, p95, value),
      samples,
      p50,
      p95,
      value,
      target: definition.target,
    };
  });
  return {
    contract: GOLDEN_PATH_DELIGHT_CONTRACT,
    minSample: DELIGHT_MIN_SAMPLE,
    metrics,
    uninstrumented: metrics
      .filter(metric => metric.status === 'uninstrumented')
      .map(metric => metric.id),
  };
}
