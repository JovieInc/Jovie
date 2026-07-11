import { describe, expect, it, vi } from 'vitest';
import {
  appendDesignProposalComment,
  matchesDesignProposalFilters,
  parseCompactFeedback,
  parseProposalRecord,
} from '@/lib/agent-os/design-lab/proposals';

vi.mock('server-only', () => ({}));

describe('proposal compatibility and feedback', () => {
  it('parses compact proposed-section feedback', () => {
    expect(
      parseCompactFeedback('PROPOSED-SECTION-0042: Make the CTA quieter')
    ).toEqual({
      reviewId: 'PROPOSED-SECTION-0042',
      body: 'Make the CTA quieter',
    });
    expect(parseCompactFeedback('section 42: nope')).toBeNull();
  });

  it('parses legacy pending records as proposed', () => {
    const result = parseProposalRecord(
      {
        id: 'legacy',
        surfaceId: 'home',
        surfaceName: 'Home',
        proposalText: 'Proposal',
        assetRefs: [],
        scoring: null,
        linearIssueId: 'JOV-1',
        linearIssueUrl: null,
        status: 'pending',
        createdAt: '2026-06-08T12:00:00.000Z',
        reviewedAt: null,
        reviewer: null,
        reviewNotes: null,
      },
      '2026-06-08'
    );
    expect(result?.status).toBe('proposed');
  });

  it('refuses comments on proposals without design-gap records', () => {
    const proposal = parseProposalRecord(
      {
        id: 'surface',
        surfaceId: 'home',
        surfaceName: 'Home',
        proposalText: 'Proposal',
        assetRefs: [],
        scoring: null,
        linearIssueId: 'JOV-1',
        linearIssueUrl: null,
        status: 'proposed',
        createdAt: '2026-06-08T12:00:00.000Z',
        reviewedAt: null,
        reviewer: null,
        reviewNotes: null,
      },
      '2026-06-08'
    );
    expect(() =>
      appendDesignProposalComment(proposal!, {
        author: 'reviewer',
        body: 'Feedback',
        date: '2026-06-08',
      })
    ).toThrow('does not have a design-gap record');
    expect(
      matchesDesignProposalFilters(proposal!, { statuses: ['approved'] })
    ).toBe(false);
    expect(
      matchesDesignProposalFilters(proposal!, {
        statuses: ['proposed'],
        kinds: ['surface'],
      })
    ).toBe(true);
  });
});
