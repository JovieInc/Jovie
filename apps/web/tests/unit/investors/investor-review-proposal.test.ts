import { describe, expect, it } from 'vitest';
import { renderInvestorReviewProposal } from '@/lib/investors/investor-review-proposal';
import { buildInvestorNoteReviewArtifact } from '@/lib/investors/note-ingestion';

function setup() {
  const artifact = buildInvestorNoteReviewArtifact([
    {
      source: {
        id: 'conversation-a',
        kind: 'local-note',
        label: 'A',
        capturedAt: '2026-07-11',
      },
      transcript: 'Synthetic.',
      signals: [
        {
          kind: 'question',
          text: 'What traction is proven?',
          gapClassification: 'evidence',
          severity: 'high',
        },
      ],
    },
  ]);
  return { artifact, candidate: artifact.candidates[0]! };
}

describe('investor review proposal', () => {
  it('renders approved copy with matching evidence and protected-field flags', () => {
    const { artifact, candidate } = setup();
    const rendered = renderInvestorReviewProposal(
      {
        proposalVersion: '1.0.0',
        slug: 'traction-proof',
        title: 'Review traction proof',
        approvedCandidates: [
          {
            key: candidate.key,
            proposedCopy: 'Add a sourced traction explanation.',
            action: 'Review copy before any investor-facing edit.',
            target: 'fundraisingRegistry.claims',
            protectedFields: ['claims', 'numbers'],
            evidence: [candidate.sources[0]],
          },
        ],
      },
      artifact
    );
    expect(rendered.markdown).toContain(
      'Protected-field review: claims, numbers'
    );
    expect(rendered.markdown).toContain(candidate.sources[0]!.transcriptSha256);
  });

  it('rejects targets not allowed for the candidate', () => {
    const { artifact, candidate } = setup();
    expect(() =>
      renderInvestorReviewProposal(
        {
          proposalVersion: '1.0.0',
          slug: 'traction-proof',
          title: 'Review traction proof',
          approvedCandidates: [
            {
              key: candidate.key,
              proposedCopy: 'Copy',
              action: 'Review',
              target: 'outreach-brief',
              protectedFields: ['claims'],
              evidence: [candidate.sources[0]],
            },
          ],
        },
        artifact
      )
    ).toThrow('not allowed');
  });
});
