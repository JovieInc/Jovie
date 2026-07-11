import { describe, expect, it } from 'vitest';
import {
  buildInvestorNoteReviewArtifact,
  inputsFromPriorArtifact,
  normalizeSignalText,
  parseAnnotatedTranscript,
} from '@/lib/investors/note-ingestion';

function note({
  id,
  capturedAt = '2026-07-11',
  transcript = 'Synthetic test transcript.',
  signals,
}: {
  id: string;
  capturedAt?: string;
  transcript?: string;
  signals: readonly Record<string, unknown>[];
}) {
  return {
    source: { id, kind: 'local-note', label: id, capturedAt },
    transcript,
    signals,
  };
}

const tractionSignal = {
  kind: 'question',
  text: 'What traction is proven?',
  gapClassification: 'evidence',
  severity: 'high',
};

describe('investor note ingestion', () => {
  it('extracts only explicitly annotated text lines', () => {
    expect(
      parseAnnotatedTranscript(`Unstructured context is not interpreted.
QUESTION | evidence | high | What traction is proven?
OBJECTION | strategy | critical | The buyer is unclear.`)
    ).toEqual([
      { ...tractionSignal, line: 2 },
      {
        kind: 'objection',
        text: 'The buyer is unclear.',
        gapClassification: 'strategy',
        severity: 'critical',
        line: 3,
      },
    ]);
  });

  it('is input-order independent and preserves classification conflicts', () => {
    const first = note({
      id: 'conversation-a',
      capturedAt: '2026-07-10',
      signals: [tractionSignal],
    });
    const second = note({
      id: 'conversation-b',
      signals: [
        {
          ...tractionSignal,
          text: 'What traction is proven!',
          gapClassification: 'communication',
          severity: 'critical',
        },
      ],
    });

    const forward = buildInvestorNoteReviewArtifact([first, second]);
    const reverse = buildInvestorNoteReviewArtifact([second, first]);
    expect(reverse).toEqual(forward);
    expect(forward.candidates[0]).toMatchObject({
      text: 'What traction is proven!',
      gapClassifications: ['communication', 'evidence'],
      severity: 'critical',
      occurrenceCount: 2,
      conversationCount: 2,
      frequency: 'common',
    });
    expect(
      forward.candidates[0]?.sources.map(source => source.sourceId)
    ).toEqual(['conversation-a', 'conversation-b']);
  });

  it('scores frequency from distinct conversations, not repeated mentions', () => {
    const artifact = buildInvestorNoteReviewArtifact([
      note({
        id: 'conversation-a',
        signals: [tractionSignal, tractionSignal, tractionSignal],
      }),
    ]);
    expect(artifact.candidates[0]).toMatchObject({
      occurrenceCount: 3,
      conversationCount: 1,
      frequency: 'occasional',
    });
    expect(artifact.candidates[0]?.sources).toHaveLength(1);
  });

  it('deduplicates repeated source IDs with identical transcript hashes', () => {
    const input = note({ id: 'conversation-a', signals: [tractionSignal] });
    expect(buildInvestorNoteReviewArtifact([input, input]).sourceCount).toBe(1);
  });

  it('makes sequential corpus ingestion equal batch and rejects changed sources', () => {
    const first = note({ id: 'conversation-a', signals: [tractionSignal] });
    const second = note({
      id: 'conversation-b',
      signals: [{ ...tractionSignal, severity: 'critical' }],
    });
    const initial = buildInvestorNoteReviewArtifact([first]);
    const sequential = buildInvestorNoteReviewArtifact([
      ...inputsFromPriorArtifact(initial),
      second,
    ]);
    expect(sequential).toEqual(
      buildInvestorNoteReviewArtifact([first, second])
    );
    expect(() =>
      buildInvestorNoteReviewArtifact([
        first,
        { ...first, transcript: 'Changed transcript.' },
      ])
    ).toThrow('has a changed transcript hash');
  });

  it('normalizes Unicode with NFKC while retaining letters and numbers', () => {
    expect(normalizeSignalText('Ｃafé № １２')).toBe('café no 12');
    expect(normalizeSignalText('市場 规模 2026')).toBe('市場 规模 2026');
    expect(() => normalizeSignalText('?! —')).toThrow(
      'Signal text has no letters or numbers.'
    );
  });

  it('validates annotated line provenance and emits transcript hashes', () => {
    const transcript =
      'Context\nQUESTION | evidence | high | What traction is proven?';
    const artifact = buildInvestorNoteReviewArtifact([
      note({
        id: 'conversation-a',
        transcript,
        signals: [{ ...tractionSignal, line: 2 }],
      }),
    ]);
    expect(artifact.candidates[0]?.sources[0]).toMatchObject({
      sourceId: 'conversation-a',
      line: 2,
    });
    expect(artifact.candidates[0]?.sources[0]?.transcriptSha256).toMatch(
      /^[a-f0-9]{64}$/u
    );

    expect(() =>
      buildInvestorNoteReviewArtifact([
        note({
          id: 'conversation-b',
          transcript,
          signals: [{ ...tractionSignal, line: 1 }],
        }),
      ])
    ).toThrow('does not match annotated transcript content');
  });

  it('proposes bounded actions and review targets without publishing', () => {
    const artifact = buildInvestorNoteReviewArtifact([
      note({
        id: 'conversation-a',
        signals: [
          {
            kind: 'objection',
            text: 'The investor fit is unclear.',
            gapClassification: 'investor-fit',
            severity: 'high',
          },
        ],
      }),
    ]);
    expect(artifact.proposedReviewTargets).toEqual([
      'outreach-brief',
      'portal',
    ]);
    expect(artifact.candidates[0]?.proposedNextActions[0]).toContain(
      'targeting'
    );
    expect(artifact.guardrails.autoPublish).toBe(false);
    expect(artifact.recommendedReviewPath).toContain(
      'codex/jov-3739-investor-note-review'
    );
  });

  it('rejects invalid classifications and empty input sets', () => {
    expect(() => buildInvestorNoteReviewArtifact([])).toThrow(
      'At least one investor note is required.'
    );
    expect(() =>
      buildInvestorNoteReviewArtifact([
        note({
          id: 'conversation-a',
          signals: [
            {
              ...tractionSignal,
              gapClassification: 'made-up',
            },
          ],
        }),
      ])
    ).toThrow();
  });
});
