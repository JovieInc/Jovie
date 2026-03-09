import { describe, expect, it } from 'vitest';
import { buildHandleCandidates } from '@/lib/onboarding/reserved-handle';

describe('buildHandleCandidates', () => {
  it('builds high-quality candidates from display names', () => {
    expect(buildHandleCandidates('The Weeknd')).toEqual([
      'theweeknd',
      'the-weeknd',
      'the',
      'artist',
    ]);
  });

  it('removes punctuation and diacritics before generating candidates', () => {
    expect(buildHandleCandidates('Beyoncé!')).toEqual(['beyonce', 'artist']);
  });

  it('falls back to artist when no valid name fragments remain', () => {
    expect(buildHandleCandidates('@@@')).toEqual(['artist']);
  });
});
