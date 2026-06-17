import { describe, expect, it } from 'vitest';
import { getSurfaceBenchmark } from '@/lib/agent-os/design-taste-jury/benchmarks';
import { runDesignTasteJury } from '@/lib/agent-os/design-taste-jury/jury';

describe('design-taste-jury jury', () => {
  it('tags objective findings as ship and taste findings as taste', () => {
    const result = runDesignTasteJury({
      runId: 'jury-001',
      signals: [
        {
          surfaceId: 'dashboard-releases',
          kind: 'pixel_drift',
          title: 'Releases list drifted',
          summary: 'Weighted drift exceeded threshold in the releases table.',
          severity: 0.9,
          compArtifactPath: 'agentos/runs/visual-qa/jury-001/diff-overlay.png',
        },
        {
          surfaceId: 'homepage',
          kind: 'marketing_composition',
          title: 'Hero proof feels crowded',
          summary: 'Marketing hero needs more poster-like composition.',
          severity: 0.7,
          compArtifactPath: null,
        },
      ],
    });

    const shipFinding = result.consensus.find(
      finding => finding.queueTag === 'ship'
    );
    const tasteFinding = result.consensus.find(
      finding => finding.queueTag === 'taste'
    );

    expect(shipFinding?.rank).toBe(1);
    expect(tasteFinding?.queueTag).toBe('taste');
    expect(
      result.verdicts.some(verdict => verdict.jurorId === 'objective-pixel')
    ).toBe(true);
  });

  it('attaches benchmark references per surface category', () => {
    const benchmark = getSurfaceBenchmark('homepage');

    expect(benchmark.primary.id).toBe('apple-com');
    expect(benchmark.galleryRefs.map(ref => ref.id)).toContain('mobbin');
  });
});
