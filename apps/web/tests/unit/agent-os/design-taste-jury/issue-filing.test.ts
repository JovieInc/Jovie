import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('buildDesignTasteIssueDrafts', () => {
  it('creates ship and taste drafts with benchmark comps', async () => {
    const { buildDesignTasteIssueDrafts } = await import(
      '@/lib/agent-os/design-taste-jury/issue-filing'
    );

    const drafts = buildDesignTasteIssueDrafts({
      runId: 'jury-001',
      findings: [
        {
          id: 'homepage:pixel_drift',
          rank: 1,
          surfaceId: 'homepage',
          title: 'Homepage drift',
          summary: 'Hero shifted by 12px.',
          queueTag: 'ship',
          consensusScore: 1.2,
          jurorCount: 2,
          benchmarkRefs: ['apple-com', 'mobbin'],
          compArtifactPath: 'agentos/runs/visual-qa/jury-001/diff-overlay.png',
        },
        {
          id: 'homepage:marketing_composition',
          rank: 2,
          surfaceId: 'homepage',
          title: 'Hero composition',
          summary: 'Poster composition is too busy.',
          queueTag: 'taste',
          consensusScore: 0.7,
          jurorCount: 2,
          benchmarkRefs: ['apple-com', 'frame-io'],
          compArtifactPath: null,
        },
      ],
    });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.title).toMatch(/^Visual QA:/);
    expect(drafts[0]?.description).toContain('diff-overlay.png');
    expect(drafts[1]?.title).toMatch(/^Taste review:/);
  });
});
