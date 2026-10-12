import { describe, expect, it } from 'vitest';
import { fixturePacket, fixtureReceipt, fixtureRow } from './fixtures';
import {
  appendTranscriptSegment,
  buildWalkthroughNotes,
  canStartWalkthrough,
  createWalkthroughReview,
  formatPlaybackTime,
  isWalkthroughReviewStale,
  pickWalkthroughArtifact,
  structureWalkthroughFindings,
  WALKTHROUGH_NOTES_LIMIT,
  type WalkthroughPlaybackAnchor,
} from './walkthrough';

function anchor(
  playbackSeconds: number,
  overrides: Partial<WalkthroughPlaybackAnchor> = {}
): WalkthroughPlaybackAnchor {
  return {
    playbackSeconds,
    playbackRate: 1,
    playerState: 'paused',
    observedAt: '2026-09-27T08:05:00.000Z',
    ...overrides,
  };
}

describe('pickWalkthroughArtifact', () => {
  it('prefers visual_proof video evidence', () => {
    const row = fixtureRow('flow-video', {
      packet: fixturePacket('flow-video', {
        visualProof: [
          fixtureReceipt(
            'visual_proof',
            'flow-video-visual',
            'passed',
            'https://example.test/proof.mp4'
          ),
        ],
      }),
    });
    const artifact = pickWalkthroughArtifact(row);
    expect(artifact?.kind).toBe('video');
    expect(artifact?.evidenceId).toBe('flow-video-visual');
    expect(artifact?.href).toBe('https://example.test/proof.mp4');
  });

  it('renders a same-origin screenshot stored as a ref', () => {
    const row = fixtureRow('contact-page');
    const evidence = {
      ...row.evidence[0],
      tier: 'visual_proof' as const,
      status: 'passed' as const,
      href: null,
      ref: '/product-screenshots/tim-white-profile-contact-phone.png',
    };
    expect(
      pickWalkthroughArtifact({ ...row, evidence: [evidence] })?.href
    ).toBe(evidence.ref);
  });

  it.each([
    '//outside.test/proof.png',
    '/\\outside.test/proof.png',
    'file:///tmp/proof.png',
    'javascript:proof.png',
    '/proof\n.png',
  ])('does not promote an unsafe media ref: %s', ref => {
    const row = fixtureRow('contact-page');
    const evidence = { ...row.evidence[0], href: null, ref };
    expect(
      pickWalkthroughArtifact({ ...row, evidence: [evidence] })?.href
    ).toBeNull();
  });

  it('classifies screenshot receipts as image evidence', () => {
    const row = fixtureRow('flow-shot');
    const artifact = pickWalkthroughArtifact(row);
    // fixture visual proof ref is https://example.test/screenshot.png
    expect(artifact?.kind).toBe('image');
  });

  it('never selects failed media as review proof', () => {
    const row = fixtureRow('failed');
    const evidence = {
      ...row.evidence[0],
      status: 'failed' as const,
      ref: '/failed.png',
      href: null,
    };
    expect(
      pickWalkthroughArtifact({ ...row, evidence: [evidence] })
    ).toBeNull();
  });

  it('falls back to a structured receipt when no media exists', () => {
    const row = fixtureRow('flow-text', {
      packet: fixturePacket('flow-text', {
        visualProof: [
          fixtureReceipt(
            'visual_proof',
            'flow-text-visual',
            'passed',
            'receipt-abc'
          ),
        ],
        itemMedia: [],
      }),
    });
    const artifact = pickWalkthroughArtifact(row);
    expect(artifact).not.toBeNull();
    expect(['text', 'receipt']).toContain(artifact?.kind);
  });
});

describe('createWalkthroughReview', () => {
  it('binds row id, subject, and the exact evidence digest', () => {
    const row = fixtureRow('signup-golden-path');
    const review = createWalkthroughReview(row, '2026-09-27T08:01:00.000Z');
    expect(review).not.toBeNull();
    expect(review?.contract).toBe('jovie.certification-walkthrough/v1');
    expect(review?.rowId).toBe(row.id);
    expect(review?.subjectId).toBe('signup-golden-path');
    expect(review?.evidenceDigest).toBe(row.decision.evidenceDigest);
    expect(review?.startedAt).toBe('2026-09-27T08:01:00.000Z');
  });

  it('refuses when the founder decision is unavailable', () => {
    const row = fixtureRow('claim-profile', {
      packet: fixturePacket('claim-profile', {
        visualProof: [fixtureReceipt('visual_proof', 'claim-visual', 'failed')],
      }),
    });
    expect(canStartWalkthrough(row)).toBe(false);
    expect(createWalkthroughReview(row)).toBeNull();
  });
});

describe('appendTranscriptSegment', () => {
  it('keeps each segment anchored to its playback moment', () => {
    const row = fixtureRow('flow-a');
    let review = createWalkthroughReview(row)!;
    review = appendTranscriptSegment(
      review,
      'this question is confusing',
      anchor(37),
      'seg-1'
    );
    review = appendTranscriptSegment(
      review,
      'button looks off',
      anchor(62.4, { playbackRate: 1.5, playerState: 'playing' }),
      'seg-2'
    );
    expect(review.segments).toHaveLength(2);
    expect(review.segments[0].anchor.playbackSeconds).toBe(37);
    expect(review.segments[1].anchor.playbackRate).toBe(1.5);
  });

  it('ignores empty dictation', () => {
    const row = fixtureRow('flow-a');
    const review = createWalkthroughReview(row)!;
    expect(appendTranscriptSegment(review, '   ', anchor(1), 's')).toBe(review);
  });
});

describe('structureWalkthroughFindings', () => {
  it('produces one finding per observation and flags ambiguity', () => {
    const row = fixtureRow('flow-a');
    let review = createWalkthroughReview(row)!;
    review = appendTranscriptSegment(
      review,
      'Headline is wrong',
      anchor(5),
      's1'
    );
    review = appendTranscriptSegment(
      review,
      'Maybe the button should be blue?',
      anchor(12),
      's2'
    );
    const findings = structureWalkthroughFindings(review);
    expect(findings).toHaveLength(2);
    expect(findings[0].text).toBe('Headline is wrong');
    expect(findings[0].ambiguous).toBe(false);
    expect(findings[1].ambiguous).toBe(true);
  });

  it('merges exact duplicates while preserving source segment ids', () => {
    const row = fixtureRow('flow-a');
    let review = createWalkthroughReview(row)!;
    review = appendTranscriptSegment(review, 'Too slow', anchor(30), 's1');
    review = appendTranscriptSegment(review, 'too   slow', anchor(45), 's2');
    const findings = structureWalkthroughFindings(review);
    expect(findings).toHaveLength(1);
    expect(findings[0].segmentIds).toEqual(['s1', 's2']);
    expect(findings[0].playbackSeconds).toBe(30);
  });
});

describe('isWalkthroughReviewStale', () => {
  it('invalidates a review when its action is withdrawn or subject changes', () => {
    const row = fixtureRow('flow-a');
    const review = createWalkthroughReview(row)!;
    expect(isWalkthroughReviewStale(review, { ...row, id: 'different' })).toBe(
      true
    );
    expect(
      isWalkthroughReviewStale(review, {
        ...row,
        decision: {
          ...row.decision,
          available: false,
        },
      })
    ).toBe(true);
  });

  it('detects a newer evidence digest and blocks certification', () => {
    const row = fixtureRow('flow-a');
    const review = createWalkthroughReview(row)!;
    expect(isWalkthroughReviewStale(review, row)).toBe(false);
    const newer = {
      ...row,
      decision: { ...row.decision, evidenceDigest: `sha256:${'f'.repeat(64)}` },
    };
    expect(isWalkthroughReviewStale(review, newer)).toBe(true);
    expect(isWalkthroughReviewStale(review, null)).toBe(true);
  });
});

describe('buildWalkthroughNotes', () => {
  it('renders timestamped findings a worker can act on', () => {
    const row = fixtureRow('flow-a', {
      packet: fixturePacket('flow-a', {
        visualProof: [
          fixtureReceipt(
            'visual_proof',
            'flow-a-visual',
            'passed',
            'https://example.test/proof.webm'
          ),
        ],
      }),
    });
    let review = createWalkthroughReview(row)!;
    review = appendTranscriptSegment(
      review,
      'this question is confusing',
      anchor(37),
      's1'
    );
    const findings = structureWalkthroughFindings(review);
    const notes = buildWalkthroughNotes(review, findings);
    expect(notes).toContain('Walkthrough findings');
    expect(notes).toContain('- [0:37] this question is confusing');
    expect(notes).toContain('https://example.test/proof.webm');
  });

  it('stays under the decision notes limit', () => {
    const row = fixtureRow('flow-a');
    let review = createWalkthroughReview(row)!;
    for (let i = 0; i < 100; i += 1) {
      review = appendTranscriptSegment(
        review,
        `Finding ${i} ${'x'.repeat(120)}`,
        anchor(i),
        `s${i}`
      );
    }
    const notes = buildWalkthroughNotes(
      review,
      structureWalkthroughFindings(review)
    );
    expect(notes.length).toBeLessThanOrEqual(WALKTHROUGH_NOTES_LIMIT);
  });
});

describe('formatPlaybackTime', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatPlaybackTime(37)).toBe('0:37');
    expect(formatPlaybackTime(62.9)).toBe('1:02');
    expect(formatPlaybackTime(3725)).toBe('1:02:05');
    expect(formatPlaybackTime(-3)).toBe('0:00');
  });
});
