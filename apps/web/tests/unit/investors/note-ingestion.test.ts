import { describe, expect, it } from 'vitest';
import {
  buildInvestorNoteReviewArtifact,
  parseAnnotatedTranscript,
} from '@/lib/investors/note-ingestion';

function note(
  label: string,
  capturedAt: string,
  signals: readonly Record<string, unknown>[]
) {
  return {
    source: { kind: 'local-note', label, capturedAt },
    transcript: 'Synthetic test transcript.',
    signals,
  };
}

describe('investor note ingestion', () => {
  it('extracts only explicitly annotated text lines', () => {
    expect(
      parseAnnotatedTranscript(`Unstructured context is not interpreted.
QUESTION | evidence | high | What traction is proven?
OBJECTION | strategy | critical | The buyer is unclear.`)
    ).toEqual([
      {
        kind: 'question',
        text: 'What traction is proven?',
        gapClassification: 'evidence',
        severity: 'high',
        line: 2,
      },
      {
        kind: 'objection',
        text: 'The buyer is unclear.',
        gapClassification: 'strategy',
        severity: 'critical',
        line: 3,
      },
    ]);
  });

  it('merges duplicates and keeps the highest observed severity', () => {
    const artifact = buildInvestorNoteReviewArtifact([
      note('A', '2026-07-10', [
        {
          kind: 'question',
          text: 'What traction is proven?',
          gapClassification: 'evidence',
          severity: 'medium',
        },
      ]),
      note('B', '2026-07-11', [
        {
          kind: 'question',
          text: 'What traction is proven!',
          gapClassification: 'evidence',
          severity: 'critical',
        },
      ]),
    ]);

    expect(artifact.asOf).toBe('2026-07-11');
    expect(artifact.candidates).toHaveLength(1);
    expect(artifact.candidates[0]).toMatchObject({
      severity: 'critical',
      occurrenceCount: 2,
      frequency: 'common',
      gapClassification: 'evidence',
    });
    expect(artifact.candidates[0]?.sources).toHaveLength(2);
  });

  it('classifies gaps and forbids automatic publishing', () => {
    const artifact = buildInvestorNoteReviewArtifact([
      note('A', '2026-07-11', [
        {
          kind: 'objection',
          text: 'The investor fit is unclear.',
          gapClassification: 'investor-fit',
          severity: 'high',
        },
      ]),
    ]);

    expect(artifact.classificationCounts['investor-fit']).toBe(1);
    expect(artifact.reviewStatus).toBe('manual-review-required');
    expect(artifact.guardrails).toEqual({
      autoPublish: false,
      protectedFields: ['claims', 'numbers', 'ask', 'positioning'],
    });
    expect(artifact.recommendedReviewPath).toContain('dedicated PR');
  });

  it('rejects invalid classifications and empty input sets', () => {
    expect(() => buildInvestorNoteReviewArtifact([])).toThrow(
      'At least one investor note is required.'
    );
    expect(() =>
      buildInvestorNoteReviewArtifact([
        note('A', '2026-07-11', [
          {
            kind: 'question',
            text: 'Is this valid?',
            gapClassification: 'made-up',
            severity: 'high',
          },
        ]),
      ])
    ).toThrow();
  });
});
