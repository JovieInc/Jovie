import { describe, expect, it } from 'vitest';
import {
  buildDesignTasteJuryConsensus,
  buildDeterministicJurorVerdicts,
} from '@/lib/agent-os/design-taste-jury/jury';

describe('design-taste-jury consensus', () => {
  it('emits ranked consensus findings tagged ship and taste', () => {
    const verdicts = buildDeterministicJurorVerdicts({
      surfaceId: 'dashboard-insights',
    });

    const consensus = buildDesignTasteJuryConsensus({
      runId: 'jury-run-1',
      surfaceId: 'dashboard-insights',
      verdicts,
      computedAt: '2026-06-20T12:00:00.000Z',
    });

    expect(consensus.findings.length).toBeGreaterThanOrEqual(2);
    expect(consensus.findings[0]?.consensusRank).toBe(1);

    const dispositions = new Set(
      consensus.findings.map(finding => finding.disposition)
    );
    expect(dispositions.has('ship')).toBe(true);
    expect(dispositions.has('taste')).toBe(true);

    const shipFinding = consensus.findings.find(
      finding => finding.disposition === 'ship'
    );
    expect(shipFinding?.objective).toBe(true);
    expect(shipFinding?.voteCount).toBeGreaterThanOrEqual(2);
  });
});
