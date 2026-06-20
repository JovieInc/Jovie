import { describe, expect, it } from 'vitest';
import { buildIssueFilingsFromConsensus } from '@/lib/agent-os/design-taste-jury/issue-filing';
import { buildDesignTasteJuryConsensus } from '@/lib/agent-os/design-taste-jury/jury';

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
});
