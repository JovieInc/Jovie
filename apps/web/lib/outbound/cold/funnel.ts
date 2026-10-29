import { percentile } from './edit-learning';

/**
 * The cold outreach funnel, stage by stage, with machine timestamps keyed to
 * the lead id. Per segment it reports how many leads reached each stage,
 * stage-to-stage conversion, and p50/p95 dwell, so Summer can find the slow
 * or leaky stage and pick the next segment by measured conversion.
 */

export const COLD_FUNNEL_STAGES = [
  'prospected',
  'built',
  'certified',
  'drafted',
  'approved',
  'sent',
  'opened',
  'replied',
  'claimed',
  'activated',
  'paid',
] as const;
export type ColdFunnelStage = (typeof COLD_FUNNEL_STAGES)[number];

/** Stages with no event yet are absent. Timestamps are machine-recorded. */
export type StageTimestamps = Partial<Record<ColdFunnelStage, Date>>;

export interface FunnelRecord {
  readonly leadId: string;
  readonly segment: string;
  readonly stages: StageTimestamps;
}

export interface StageStat {
  readonly stage: ColdFunnelStage;
  readonly reached: number;
  /** reached / reached at the previous stage; null for the first or empty. */
  readonly conversion: number | null;
  /** Hours from the previous stage, for leads that reached both. */
  readonly dwellP50Hours: number | null;
  readonly dwellP95Hours: number | null;
}

export interface SegmentFunnel {
  readonly segment: string;
  readonly leads: number;
  readonly stages: readonly StageStat[];
  /** The stage with the lowest conversion that has data (the bottleneck). */
  readonly bottleneck: ColdFunnelStage | null;
}

const HOUR_MS = 3_600_000;

/** Opens are optional evidence (pixels are unreliable); skip them as a gate. */
const PREVIOUS: Partial<Record<ColdFunnelStage, ColdFunnelStage>> = {
  built: 'prospected',
  certified: 'built',
  drafted: 'certified',
  approved: 'drafted',
  sent: 'approved',
  opened: 'sent',
  replied: 'sent',
  claimed: 'sent',
  activated: 'claimed',
  paid: 'activated',
};

export function summarizeFunnel(
  records: readonly FunnelRecord[],
  segment: string
): SegmentFunnel {
  const rows = records.filter(record => record.segment === segment);
  const reached = (stage: ColdFunnelStage) =>
    rows.filter(row => row.stages[stage] !== undefined).length;
  const stages: StageStat[] = COLD_FUNNEL_STAGES.map(stage => {
    const previous = PREVIOUS[stage];
    const count = reached(stage);
    const base = previous ? reached(previous) : null;
    const dwell = previous
      ? rows.flatMap(row => {
          const from = row.stages[previous];
          const to = row.stages[stage];
          return from && to ? [(to.getTime() - from.getTime()) / HOUR_MS] : [];
        })
      : [];
    return {
      stage,
      reached: count,
      conversion: base ? count / base : null,
      dwellP50Hours: percentile(dwell, 50),
      dwellP95Hours: percentile(dwell, 95),
    };
  });
  const bottleneck =
    stages
      .filter(stat => stat.conversion !== null && stat.stage !== 'opened')
      .sort((a, b) => (a.conversion ?? 1) - (b.conversion ?? 1))[0]?.stage ??
    null;
  return { segment, leads: rows.length, stages, bottleneck };
}

export function summarizeFunnels(
  records: readonly FunnelRecord[]
): SegmentFunnel[] {
  return [...new Set(records.map(record => record.segment))]
    .sort()
    .map(segment => summarizeFunnel(records, segment));
}

/**
 * Segment key for a lead: channel and trigger. A dated trigger (a release in
 * the last 90 days) is its own segment because its copy and conversion
 * differ from a catalog-only first touch.
 */
export function coldSegmentKey(input: {
  readonly channel: 'email' | 'dm';
  readonly recentRelease: boolean;
}): string {
  return `${input.channel}:${input.recentRelease ? 'recent_release' : 'catalog'}`;
}

/**
 * The next pipeline step for one prospect, in order. Each step is an event
 * that a worker handles; a failure at build or certify becomes a remediation
 * event, never a skipped check.
 */
export type ColdPipelineStep =
  | 'build_artifact'
  | 'certify_artifact'
  | 'draft_copy'
  | 'await_review'
  | 'await_send'
  | 'in_sequence'
  | 'done';

export function nextPipelineStep(stages: StageTimestamps): ColdPipelineStep {
  if (stages.claimed || stages.replied) return 'done';
  if (stages.sent) return 'in_sequence';
  if (stages.approved) return 'await_send';
  if (stages.drafted) return 'await_review';
  if (stages.certified) return 'draft_copy';
  if (stages.built) return 'certify_artifact';
  return 'build_artifact';
}
