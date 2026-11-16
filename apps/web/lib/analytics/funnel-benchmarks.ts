/**
 * Industry funnel benchmarks for the artist signup funnel (Tim, 2026-11-07:
 * after certification, put the agents on conversion and activation "til the
 * funnel is reaching industry standard metrics").
 *
 * Each stage maps onto steps of signup-funnel/v2. The benchmark is a
 * published median for self-serve software, with its source, year and
 * sample, so Summer compares Jovie with a number anyone can check. Jovie's
 * own stage-gate targets (decisions/company/yc-operating-metrics-2026-10-28)
 * stay separate: they are Jovie judgment, and the higher of the two wins.
 *
 * Counts are funnel events, not unique people, so a rate is an estimate.
 * Below MIN_STAGE_SAMPLE entries a stage reads insufficient_sample, never
 * below or above.
 */

import type {
  FunnelReport,
  SummerFunnelResponse,
} from '@/lib/analytics/signup-funnel.server';

export const FUNNEL_BENCHMARKS_VERSION = 'funnel-benchmarks/v1';
/** Same floor as the activation gate (n >= 30 accounts). */
export const MIN_STAGE_SAMPLE = 30;

export interface BenchmarkSource {
  readonly name: string;
  readonly url: string;
  readonly year: number;
  readonly sample: string;
}

export interface FunnelStageBenchmark {
  readonly id: 'visit_to_signup' | 'signup_to_activation' | 'free_to_paid';
  readonly label: string;
  /** Funnel steps the stage runs between, or null when not in this funnel. */
  readonly fromStep: string | null;
  readonly toStep: string | null;
  /** Industry median, as a fraction. */
  readonly median: number;
  /** Jovie's own stage-gate target, when one is set. */
  readonly jovieTarget: number | null;
  readonly sources: readonly BenchmarkSource[];
}

const CHARTMOGUL: BenchmarkSource = {
  name: 'ChartMogul SaaS Conversion Report',
  url: 'https://chartmogul.com/reports/saas-conversion-report/',
  year: 2026,
  sample: '200 mostly B2B software products, survey Jan 2026',
};

/** In funnel order: the first stage below benchmark is the one to work. */
export const FUNNEL_STAGE_BENCHMARKS: readonly FunnelStageBenchmark[] = [
  {
    id: 'visit_to_signup',
    label: 'Visitor to signup',
    fromStep: 'landing_view',
    toStep: 'auth_success',
    // Freemium median 9% (ChartMogul) and 12% (ProductLed); free-trial
    // products sit lower (4.5% and 5%). Jovie's free profile is freemium.
    median: 0.09,
    jovieTarget: null,
    sources: [
      CHARTMOGUL,
      {
        name: 'ProductLed PLG benchmarks',
        url: 'https://productled.com/blog/product-led-growth-benchmarks',
        year: 2025,
        sample: '600+ SaaS businesses',
      },
    ],
  },
  {
    id: 'signup_to_activation',
    label: 'Signup to first value',
    fromStep: 'auth_success',
    toStep: 'first_value',
    // SaaS-only median 30% (average 36%) of signups reach activation.
    median: 0.3,
    jovieTarget: 0.4,
    sources: [
      {
        name: "Lenny's Newsletter activation benchmark",
        url: 'https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate',
        year: 2022,
        sample: '500+ products, SaaS subset',
      },
    ],
  },
  {
    id: 'free_to_paid',
    label: 'Free to paid within six months',
    fromStep: null,
    toStep: null,
    // Freemium with signup: 3-5% is good, 8-12% great; all-product median 8%.
    median: 0.05,
    jovieTarget: 0.05,
    sources: [CHARTMOGUL],
  },
];

export type StageVerdict =
  | 'below_benchmark'
  | 'at_or_above_benchmark'
  | 'insufficient_sample'
  | 'not_in_funnel';

export interface StageComparison {
  readonly id: FunnelStageBenchmark['id'];
  readonly label: string;
  readonly entered: number | null;
  readonly reached: number | null;
  readonly rate: number | null;
  /** max(industry median, Jovie target). */
  readonly target: number;
  readonly median: number;
  readonly verdict: StageVerdict;
  readonly sources: readonly BenchmarkSource[];
}

function stepCount(report: FunnelReport, step: string): number {
  return report.steps.find(s => s.step === step)?.count ?? 0;
}

export function compareStages(
  report: FunnelReport | null | undefined,
  benchmarks: readonly FunnelStageBenchmark[] = FUNNEL_STAGE_BENCHMARKS
): StageComparison[] {
  return benchmarks.map(b => {
    const target = Math.max(b.median, b.jovieTarget ?? 0);
    const base = {
      id: b.id,
      label: b.label,
      target,
      median: b.median,
      sources: b.sources,
    };
    if (!b.fromStep || !b.toStep || !report) {
      return {
        ...base,
        entered: null,
        reached: null,
        rate: null,
        verdict: b.fromStep ? 'insufficient_sample' : 'not_in_funnel',
      };
    }
    const entered = stepCount(report, b.fromStep);
    const reached = stepCount(report, b.toStep);
    if (entered < MIN_STAGE_SAMPLE) {
      return {
        ...base,
        entered,
        reached,
        rate: null,
        verdict: 'insufficient_sample',
      };
    }
    const rate = Math.min(1, reached / entered);
    return {
      ...base,
      entered,
      reached,
      rate,
      verdict: rate < target ? 'below_benchmark' : 'at_or_above_benchmark',
    };
  });
}

export interface FunnelBenchmarkReport {
  readonly contractVersion: typeof FUNNEL_BENCHMARKS_VERSION;
  readonly observedAt: string;
  readonly window: '7d';
  readonly stages: readonly StageComparison[];
  /**
   * The first stage, in funnel order, that is measured and below target.
   * Null when every measured stage meets target or none has enough sample.
   */
  readonly bindingStage: StageComparison['id'] | null;
}

/** Artist signup funnel, 7-day window, against the benchmarks. */
export function funnelBenchmarkReport(
  funnel: SummerFunnelResponse
): FunnelBenchmarkReport {
  const report = funnel.windows?.['7d']?.funnels?.find(
    f => f.funnelId === 'artist_signup'
  );
  const stages = compareStages(report);
  return {
    contractVersion: FUNNEL_BENCHMARKS_VERSION,
    observedAt: funnel.observedAt,
    window: '7d',
    stages,
    bindingStage: stages.find(s => s.verdict === 'below_benchmark')?.id ?? null,
  };
}
