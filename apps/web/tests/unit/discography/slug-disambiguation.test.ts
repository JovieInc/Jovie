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
  it('uses the co-primary artist before the year', () => {
    expect(
      buildSlugDisambiguationCandidates('seaside-heights', {
        year: 2019,
        coPrimary: ['Vigel'],
      }).slice(0, 3)
    ).toEqual([
      'seaside-heights',
      'seaside-heights-with-vigel',
      'seaside-heights-2019',
    ]);
  });

  it('never emits a numeric -N suffix, even with no qualifiers', () => {
    const none = buildSlugDisambiguationCandidates('take-me-over');
    expect(none).toEqual(['take-me-over']);
    const all = buildSlugDisambiguationCandidates('take-me-over', {
      year: 2014,
      coPrimary: ['A'],
      featured: ['B'],
      remixers: ['C'],
    });
    for (const slug of all) expect(slug).not.toMatch(/-\d{1,3}$/);
  });
});
