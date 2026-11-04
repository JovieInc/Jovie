import type { ProofStatsRecord } from './content-kind';
import { type ProofStatState, resolveProofStat } from './format';
import { listProofStats } from './registry';

export interface ProofStatsMetrics {
  readonly measuredAt: string;
  readonly total: number;
  readonly public: number;
  readonly published: number;
  readonly stale: number;
  readonly belowThreshold: number;
  readonly missing: number;
  readonly unapproved: number;
  readonly byState: Readonly<Record<ProofStatState, number>>;
  readonly byStatus: Readonly<Record<string, number>>;
}
export function computeProofStatsMetrics(
  record: Pick<ProofStatsRecord, 'observations'>,
  now: Date
): ProofStatsMetrics {
  const byState: Record<ProofStatState, number> = {
    publishable: 0,
    missing: 0,
    stale: 0,
    'below-threshold': 0,
    'above-ceiling': 0,
    internal: 0,
    unapproved: 0,
    'not-live': 0,
  };
  const byStatus: Record<string, number> = {};
  const stats = listProofStats();
  for (const definition of stats) {
    byStatus[definition.status] = (byStatus[definition.status] ?? 0) + 1;
    // Internal surface: an internal stat still reports its true state here.
    const state = resolveProofStat(
      definition,
      record.observations[definition.id],
      { now, surface: 'internal' }
    ).state;
    byState[state] += 1;
  }
  return {
    measuredAt: now.toISOString(),
    total: stats.length,
    public: stats.filter(stat => stat.visibility === 'public').length,
    published: byState.publishable,
    stale: byState.stale,
    belowThreshold: byState['below-threshold'],
    missing: byState.missing,
    unapproved: byState.unapproved,
    byState,
    byStatus,
  };
}
