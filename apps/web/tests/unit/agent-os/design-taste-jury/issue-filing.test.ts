import { describe, expect, it } from 'vitest';
import { buildIssueFilingsFromConsensus } from '@/lib/agent-os/design-taste-jury/issue-filing';
import { buildDesignTasteJuryConsensus } from '@/lib/agent-os/design-taste-jury/jury';
import type { DesignTasteJuryCriterion } from '@/lib/agent-os/design-taste-jury/types';

describe('design-taste-jury issue filing', () => {
  it('auto-files objective ship issues with benchmark reference comps', () => {
    const consensus = buildDesignTasteJuryConsensus({
      runId: 'jury-run-2',
      surfaceId: 'dashboard-insights',
      verdicts: [
        {
          jurorId: 'system-b-lead',
          modelLabel: 'System B lead',
          findings: [
            {
              id: 'contrast-hierarchy',
              summary: 'Muted helper copy fails contrast on insights cards.',
              disposition: 'ship',
              rank: 1,
              objective: true,
            },
          ],
        },
      ],
      computedAt: '2026-06-20T12:00:00.000Z',
    });

    const filings = buildIssueFilingsFromConsensus(consensus);
    const shipFiling = filings.find(filing => filing.disposition === 'ship');

    expect(shipFiling).toBeDefined();
    expect(shipFiling?.queue).toBe('visual-qa');
    expect(shipFiling?.referenceComps.length).toBeGreaterThan(0);
    expect(
      shipFiling?.referenceComps.some(comp => comp.id === 'apple-health')
    ).toBe(true);
    expect(shipFiling?.body).toContain('Reference comps');
    expect(shipFiling?.body).toContain('https://www.apple.com/ios/health/');
    expect(shipFiling?.criteria).toEqual([]);
    expect(shipFiling?.body).not.toContain('## Rubric criteria');
  });

  it('routes subjective findings to the Tim taste queue', () => {
    const consensus = buildDesignTasteJuryConsensus({
      runId: 'jury-run-3',
      surfaceId: 'dashboard-releases',
      verdicts: [
        {
          jurorId: 'product-density',
          modelLabel: 'Product density reviewer',
          findings: [
            {
              id: 'consumer-tone',
              summary: 'Surface reads too consumer-facing for creator shell.',
              disposition: 'taste',
              rank: 1,
              objective: false,
            },
          ],
        },
      ],
      computedAt: '2026-06-20T12:00:00.000Z',
    });

    const filings = buildIssueFilingsFromConsensus(consensus);
    const tasteFiling = filings.find(filing => filing.disposition === 'taste');

    expect(tasteFiling?.queue).toBe('tim-taste');
    expect(
      tasteFiling?.referenceComps.some(comp => comp.id === 'raycast')
    ).toBe(true);
  });

  it('still files legacy consensus findings that have no criterion tags', () => {
    const [filing] = buildIssueFilingsFromConsensus({
      runId: 'legacy-jury-run',
      surfaceId: 'dashboard-insights',
      computedAt: '2026-06-20T12:00:00.000Z',
      findings: [
        {
          id: 'contrast',
          summary: 'Helper copy fails contrast.',
          disposition: 'ship',
          consensusRank: 1,
          voteCount: 1,
          jurorIds: ['legacy-juror'],
          objective: true,
        },
      ],
    });

    expect(filing?.criteria).toEqual([]);
    expect(filing?.queue).toBe('visual-qa');
    expect(filing?.body).not.toContain('## Rubric criteria');
  });

  it.each<DesignTasteJuryCriterion>([
    'optical-alignment',
    'shadow-depth',
    'stagger-animation',
  ])('tags %s violations in structured filings and issue bodies', criterion => {
    const consensus = buildDesignTasteJuryConsensus({
      runId: 'jury-run-criteria',
      surfaceId: 'dashboard-insights',
      verdicts: [
        {
          jurorId: 'visual-reviewer',
          modelLabel: 'Visual reviewer',
          findings: [
            {
              id: 'ui-feel',
              summary: 'The changed surface has a visible UI-feel regression.',
              criteria: [criterion],
              disposition: 'taste',
              rank: 1,
              objective: false,
            },
          ],
        },
      ],
    });

    const [filing] = buildIssueFilingsFromConsensus(consensus);

    expect(filing?.criteria).toEqual([criterion]);
    expect(filing?.body).toContain('## Rubric criteria');
    expect(filing?.body).toContain(`(${criterion})`);
    expect(filing?.queue).toBe('tim-taste');
  });
});
