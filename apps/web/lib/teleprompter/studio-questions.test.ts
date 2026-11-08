import { describe, expect, it } from 'vitest';
import {
  MAX_STUDIO_QUESTIONS,
  resolveStudioQuestions,
} from './studio-questions';

describe('resolveStudioQuestions', () => {
  it('uses the questions Jovie wrote, trimmed and deduplicated', () => {
    expect(
      resolveStudioQuestions({
        kind: 'promo',
        questions: [
          '  What was going on the night you wrote it? ',
          'what was going on the night you wrote it?',
          'short',
          'Who should hear this first?',
        ],
      })
    ).toEqual([
      'What was going on the night you wrote it?',
      'Who should hear this first?',
    ]);
  });

  it('caps the list', () => {
    const many = Array.from(
      { length: 9 },
      (_, index) => `Question number ${index}?`
    );
    expect(
      resolveStudioQuestions({ kind: 'bts', questions: many })
    ).toHaveLength(MAX_STUDIO_QUESTIONS);
  });

  it('falls back to questions for the video kind', () => {
    for (const kind of ['promo', 'thank_you', 'bts'] as const) {
      expect(resolveStudioQuestions({ kind }).length).toBeGreaterThan(0);
    }
    expect(
      resolveStudioQuestions({ kind: 'thank_you', questions: [] })[0]
    ).toMatch(/thank/i);
  });
});
