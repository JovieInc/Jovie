import { listBenchmarkReferenceIds } from '@/lib/agent-os/design-taste-jury/benchmarks';
import type {
  DesignTasteJurorVerdict,
  DesignTasteJuryQueueTag,
  DesignTasteJuryResult,
  DesignTasteJurySignal,
} from '@/lib/agent-os/design-taste-jury/types';

interface DesignTasteJurorDefinition {
  readonly id: string;
  readonly modelRoute: string;
  readonly weight: number;
}

const JURORS: readonly DesignTasteJurorDefinition[] = [
  { id: 'objective-pixel', modelRoute: 'deterministic', weight: 1.2 },
  { id: 'objective-breakpoint', modelRoute: 'deterministic', weight: 1.1 },
  { id: 'taste-product-linear', modelRoute: 'openrouter-free', weight: 1 },
  { id: 'taste-product-raycast', modelRoute: 'openrouter-free', weight: 1 },
  { id: 'taste-marketing-apple', modelRoute: 'openrouter-free', weight: 1 },
];

const OBJECTIVE_SIGNAL_KINDS = new Set<DesignTasteJurySignal['kind']>([
  'pixel_drift',
  'breakpoint_failure',
  'layout_shift',
  'contrast_failure',
]);

function resolveQueueTag(
  signal: DesignTasteJurySignal
): DesignTasteJuryQueueTag {
  return OBJECTIVE_SIGNAL_KINDS.has(signal.kind) ? 'ship' : 'taste';
}

function jurorScoreMultiplier(
  juror: DesignTasteJurorDefinition,
  queueTag: DesignTasteJuryQueueTag
): number {
  if (juror.id.startsWith('objective-')) {
    return queueTag === 'ship' ? 1 : 0.35;
  }

  return queueTag === 'taste' ? 1 : 0.25;
}

function buildFindingId(surfaceId: string, kind: string): string {
  return `${surfaceId}:${kind}`;
}

export function runDesignTasteJury(params: {
  readonly runId: string;
  readonly signals: readonly DesignTasteJurySignal[];
  readonly computedAt?: string;
}): DesignTasteJuryResult {
  const computedAt = params.computedAt ?? new Date().toISOString();
  const verdicts: DesignTasteJurorVerdict[] = [];

  for (const signal of params.signals) {
    const queueTag = resolveQueueTag(signal);
    const findingId = buildFindingId(signal.surfaceId, signal.kind);
    const benchmarkRefs = listBenchmarkReferenceIds(signal.surfaceId);

    for (const juror of JURORS) {
      const multiplier = jurorScoreMultiplier(juror, queueTag);
      const score = Number(
        (signal.severity * juror.weight * multiplier).toFixed(4)
      );

      if (score <= 0) {
        continue;
      }

      verdicts.push({
        jurorId: juror.id,
        modelRoute: juror.modelRoute,
        findingId,
        surfaceId: signal.surfaceId,
        title: signal.title,
        summary: signal.summary,
        queueTag,
        score,
        benchmarkRefs,
        compArtifactPath: signal.compArtifactPath ?? null,
      });
    }
  }

  const grouped = new Map<
    string,
    {
      surfaceId: string;
      title: string;
      summary: string;
      queueTag: DesignTasteJuryQueueTag;
      totalScore: number;
      jurorCount: number;
      benchmarkRefs: readonly string[];
      compArtifactPath: string | null;
    }
  >();

  for (const verdict of verdicts) {
    const existing = grouped.get(verdict.findingId);
    if (!existing) {
      grouped.set(verdict.findingId, {
        surfaceId: verdict.surfaceId,
        title: verdict.title,
        summary: verdict.summary,
        queueTag: verdict.queueTag,
        totalScore: verdict.score,
        jurorCount: 1,
        benchmarkRefs: verdict.benchmarkRefs,
        compArtifactPath: verdict.compArtifactPath,
      });
      continue;
    }

    grouped.set(verdict.findingId, {
      ...existing,
      totalScore: existing.totalScore + verdict.score,
      jurorCount: existing.jurorCount + 1,
    });
  }

  const consensus = [...grouped.entries()]
    .map(([findingId, entry]) => ({
      id: findingId,
      rank: 0,
      surfaceId: entry.surfaceId,
      title: entry.title,
      summary: entry.summary,
      queueTag: entry.queueTag,
      consensusScore: Number(entry.totalScore.toFixed(4)),
      jurorCount: entry.jurorCount,
      benchmarkRefs: entry.benchmarkRefs,
      compArtifactPath: entry.compArtifactPath,
    }))
    .sort((left, right) => {
      if (right.consensusScore !== left.consensusScore) {
        return right.consensusScore - left.consensusScore;
      }

      return left.id.localeCompare(right.id);
    })
    .map((finding, index) => ({
      ...finding,
      rank: index + 1,
    }));

  return {
    runId: params.runId,
    computedAt,
    verdicts: verdicts.sort((left, right) => right.score - left.score),
    consensus,
  };
}
