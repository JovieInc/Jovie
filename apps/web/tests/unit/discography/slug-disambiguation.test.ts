import { describe, expect, it } from 'vitest';
import {
  buildSlugDisambiguationCandidates,
  generateBaseSlug,
} from '@/lib/discography/slug';

describe('generateBaseSlug', () => {
  it('slugifies titles cleanly without opaque id suffixes', () => {
    expect(generateBaseSlug('Seaside Heights')).toBe('seaside-heights');
    expect(
      generateBaseSlug('Take Me Over (South Blast Bounce Over Remix)')
    ).toBe('take-me-over-south-blast-bounce-over-remix');
  });
});

describe('buildSlugDisambiguationCandidates', () => {
  it('prefers year-based disambiguation before opaque -2 suffixes', () => {
    expect(
      buildSlugDisambiguationCandidates('seaside-heights', 2019).slice(0, 4)
    ).toEqual([
      'seaside-heights',
      'seaside-heights-2019',
      'seaside-heights-2',
      'seaside-heights-3',
    ]);
  });

  it('falls back to numeric suffixes when year is unavailable', () => {
    expect(
      buildSlugDisambiguationCandidates('take-me-over').slice(0, 3)
    ).toEqual(['take-me-over', 'take-me-over-2', 'take-me-over-3']);
  });
});
