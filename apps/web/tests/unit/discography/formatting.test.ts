import { describe, expect, it } from 'vitest';
import {
  formatCompactReleaseArtistLine,
  formatReleaseArtistLine,
} from '@/lib/discography/formatting';

describe('release formatting', () => {
  it('formats full release artist lines when compact output is not needed', () => {
    expect(
      formatReleaseArtistLine(['Tim White', 'Tom Fall'], 'Fallback Artist')
    ).toBe('Tim White and Tom Fall');
  });

  it('compacts long collaborator lists for dense release rows', () => {
    expect(
      formatCompactReleaseArtistLine(
        ['Jochen Miller', 'Tom Fall', 'Tim White'],
        null
      )
    ).toBe('Jochen Miller, Tom Fall +1');
  });

  it('falls back to the provided artist name when release credits are absent', () => {
    expect(formatCompactReleaseArtistLine(undefined, 'Tim White')).toBe(
      'Tim White'
    );
  });
});
