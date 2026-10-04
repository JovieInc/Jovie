import { describe, expect, it } from 'vitest';
import * as jury from '@/lib/agent-os/design-taste-jury/jury';
import type { DesignTasteJurorVerdict } from '@/lib/agent-os/design-taste-jury/types';

const contrast = {
  id: 'dashboard-insights-contrast',
  summary: 'Muted helper copy fails WCAG contrast.',
  disposition: 'ship',
  rank: 1,
  objective: true,
} as const;

const tone = {
  id: 'dashboard-insights-tone',
  summary: 'Accent rotation reads consumer-facing.',
  disposition: 'taste',
  rank: 2,
  objective: false,
} as const;

describe('design-taste-jury consensus', () => {
  it('ranks only the findings the supplied jurors reported', () => {
    const verdicts: DesignTasteJurorVerdict[] = [
      { jurorId: 'a', modelLabel: 'A', findings: [contrast, tone] },
      { jurorId: 'b', modelLabel: 'B', findings: [contrast] },
    ];

    const consensus = jury.buildDesignTasteJuryConsensus({
      runId: 'jury-run-1',
      surfaceId: 'dashboard-insights',
      verdicts,
      computedAt: '2026-06-20T12:00:00.000Z',
    });

    expect(consensus.findings.map(f => [f.id, f.voteCount])).toEqual([
      ['dashboard-insights-contrast', 2],
      ['dashboard-insights-tone', 1],
    ]);
    expect(consensus.findings[0]).toMatchObject({
      disposition: 'ship',
      objective: true,
      consensusRank: 1,
    });
  });

  it('reports no findings when no juror reviewed the surface', () => {
    const consensus = jury.buildDesignTasteJuryConsensus({
      runId: 'jury-run-2',
      surfaceId: 'dashboard-insights',
      verdicts: [],
    });

    expect(consensus.findings).toEqual([]);
  });

  it('has no built-in juror that invents verdicts', () => {
    expect(Object.keys(jury).sort()).toEqual([
      'buildDesignTasteJuryConsensus',
      'classifyFindingDisposition',
    ]);
  });
});
