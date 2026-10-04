/**
 * Consensus over juror verdicts that real reviewers supplied. This module
 * never invents verdicts: the old fixed-findings juror (JOV-7759) returned
 * the same two findings for every surface and was deleted as fake signal.
 * Factory pages get real cross-family vision review in
 * scripts/marketing-factory/visual-review.ts.
 */
import type {
  DesignTasteConsensusFinding,
  DesignTasteJurorFinding,
  DesignTasteJurorVerdict,
  DesignTasteJuryConsensus,
  DesignTasteJuryDisposition,
} from './types';

interface AggregatedFinding {
  readonly id: string;
  readonly summary: string;
  readonly disposition: DesignTasteJuryDisposition;
  readonly objective: boolean;
  readonly ranks: number[];
  readonly jurorIds: string[];
}

function aggregateFindings(
  verdicts: readonly DesignTasteJurorVerdict[]
): AggregatedFinding[] {
  const grouped = new Map<string, AggregatedFinding>();

  for (const verdict of verdicts) {
    for (const finding of verdict.findings) {
      const key = `${finding.disposition}:${finding.id}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          id: finding.id,
          summary: finding.summary,
          disposition: finding.disposition,
          objective: finding.objective,
          ranks: [finding.rank],
          jurorIds: [verdict.jurorId],
        });
        continue;
      }

      grouped.set(key, {
        ...existing,
        ranks: [...existing.ranks, finding.rank],
        jurorIds: [...existing.jurorIds, verdict.jurorId],
      });
    }
  }

  return [...grouped.values()];
}

function medianRank(ranks: readonly number[]): number {
  const sorted = [...ranks].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1] ?? sorted[middle] ?? 1;
    const right = sorted[middle] ?? left;
    return Math.round((left + right) / 2);
  }

  return sorted[middle] ?? 1;
}

export function buildDesignTasteJuryConsensus(params: {
  readonly runId: string;
  readonly surfaceId: string;
  readonly verdicts: readonly DesignTasteJurorVerdict[];
  readonly computedAt?: string;
}): DesignTasteJuryConsensus {
  const aggregated = aggregateFindings(params.verdicts);

  const findings: DesignTasteConsensusFinding[] = aggregated
    .map(entry => ({
      id: entry.id,
      summary: entry.summary,
      disposition: entry.disposition,
      consensusRank: medianRank(entry.ranks),
      voteCount: entry.jurorIds.length,
      jurorIds: [...new Set(entry.jurorIds)],
      objective: entry.objective,
    }))
    .sort((left, right) => {
      if (left.consensusRank !== right.consensusRank) {
        return left.consensusRank - right.consensusRank;
      }

      if (left.voteCount !== right.voteCount) {
        return right.voteCount - left.voteCount;
      }

      return left.id.localeCompare(right.id);
    });

  return {
    runId: params.runId,
    surfaceId: params.surfaceId,
    computedAt: params.computedAt ?? new Date().toISOString(),
    findings,
  };
}

export function classifyFindingDisposition(
  finding: Pick<DesignTasteJurorFinding, 'objective' | 'disposition'>
): DesignTasteJuryDisposition {
  if (finding.objective) {
    return 'ship';
  }

  return finding.disposition === 'ship' ? 'ship' : 'taste';
}
