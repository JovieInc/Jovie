import { describe, expect, it } from 'vitest';
import {
  formatCompactReleaseArtistLine,
  formatReleaseArtistLine,
  formatReleaseArtistLineParts,
} from '@/lib/discography/formatting';

describe('release formatting', () => {
  it('formats full release artist lines when compact output is not needed', () => {
    expect(
      formatReleaseArtistLine(['Tim White', 'Tom Fall'], 'Fallback Artist')
    ).toBe('Tim White and Tom Fall');
  });

  it('exposes list-format parts so SmartLink can link every primary artist', () => {
    expect(formatReleaseArtistLineParts(['Tim White', 'LYNX'])).toEqual([
      { type: 'element', value: 'Tim White' },
      { type: 'literal', value: ' and ' },
      { type: 'element', value: 'LYNX' },
    ]);
  });

  it('falls back to the provided artist name when release credits are absent', () => {
    expect(formatCompactReleaseArtistLine(undefined, 'Tim White')).toBe(
      'Tim White'
    );
  });

  /**
   * ds-cert:credit-format — the ONE canonical credit formatter. House style:
   * Oxford-less conjunction ("A and B", "A, B and C"), exact duplicates and
   * empty entries dropped (display only — data cleanup belongs to the catalog
   * worker), long lists truncate to "A, B and N more" with the full list
   * exposed by callers via title/aria-label.
   */
  describe('formatReleaseArtistLine case table', () => {
    const fallback = 'Fallback Artist';

    const cases: ReadonlyArray<{
      label: string;
      names: readonly string[] | undefined;
      expected: string | null;
    }> = [
      {
        label: 'no names renders the fallback',
        names: [],
        expected: fallback,
      },
      {
        label: 'undefined names render the fallback',
        names: undefined,
        expected: fallback,
      },
      {
        label: 'whitespace-only names render the fallback',
        names: ['  ', ''],
        expected: fallback,
      },
      {
        label: 'single credit',
        names: ['Vigel'],
        expected: 'Vigel',
      },
      {
        label: 'two credits use the conjunction',
        names: ['Vigel', 'Tim White'],
        expected: 'Vigel and Tim White',
      },
      {
        label: 'three credits are Oxford-less',
        names: ['Vigel', 'Cosmic Gate', 'Tim White'],
        expected: 'Vigel, Cosmic Gate and Tim White',
      },
      {
        label: 'five credits are Oxford-less',
        names: ['A', 'B', 'C', 'D', 'E'],
        expected: 'A, B, C, D and E',
      },
      {
        label: 'exact duplicates and empty entries are dropped',
        names: ['Vigel', ' Vigel ', '', 'Tim White', 'Tim White'],
        expected: 'Vigel and Tim White',
      },
      {
        label: 'duplicates leave the single-name form',
        names: ['Vigel', 'Vigel'],
        expected: 'Vigel',
      },
      {
        label: 'RTL names stay inline in the line',
        names: ['Vigel', 'עופר לב'],
        expected: 'Vigel and עופר לב',
      },
      {
        label: 'names are trimmed before formatting',
        names: ['  Vigel  ', ' Tim White '],
        expected: 'Vigel and Tim White',
      },
    ];

    it.each(cases)('$label', ({ names, expected }) => {
      expect(formatReleaseArtistLine(names, fallback)).toBe(expected);
    });

    it('returns null when only empty names exist and no fallback is given', () => {
      expect(formatReleaseArtistLine(['  '], null)).toBeNull();
    });

    it('returns the fallback when only empty names exist', () => {
      expect(formatReleaseArtistLine(['  '], ' Fallback Artist ')).toBe(
        'Fallback Artist'
      );
    });
  });

  describe('formatCompactReleaseArtistLine truncation table', () => {
    const cases: ReadonlyArray<{
      label: string;
      names: readonly string[];
      maxVisibleArtists?: number;
      expected: string | null;
    }> = [
      {
        label: 'under the visible budget renders the full line',
        names: ['Vigel', 'Tim White'],
        expected: 'Vigel and Tim White',
      },
      {
        label: 'default budget of two truncates to "A, B and N more"',
        names: ['Jochen Miller', 'Tom Fall', 'Tim White'],
        expected: 'Jochen Miller, Tom Fall and 1 more',
      },
      {
        label: 'four credits truncate with the remaining count',
        names: ['A', 'B', 'C', 'D'],
        expected: 'A, B and 2 more',
      },
      {
        label: 'budget of one truncates to "A and N more"',
        names: ['A', 'B', 'C'],
        maxVisibleArtists: 1,
        expected: 'A and 2 more',
      },
      {
        label: 'budget covering every name never truncates',
        names: ['A', 'B', 'C'],
        maxVisibleArtists: 5,
        expected: 'A, B and C',
      },
      {
        label: 'duplicates do not eat the truncation budget',
        names: ['A', 'A', 'B', 'C'],
        expected: 'A, B and 1 more',
      },
      {
        label: 'no names falls back to the artist name',
        names: [],
        expected: 'Tim White',
      },
      {
        label: 'no names and no fallback renders nothing',
        names: [],
        expected: null,
      },
    ];

    it.each(cases)('$label', ({ names, maxVisibleArtists, expected }) => {
      const fallback =
        names.length === 0 && expected === null ? null : 'Tim White';
      expect(
        formatCompactReleaseArtistLine(names, fallback, maxVisibleArtists)
      ).toBe(expected);
    });
  });

  it('exposes Oxford-less parts for three or more credits', () => {
    expect(
      formatReleaseArtistLineParts(['Vigel', 'Cosmic Gate', 'Tim White'])
    ).toEqual([
      { type: 'element', value: 'Vigel' },
      { type: 'literal', value: ', ' },
      { type: 'element', value: 'Cosmic Gate' },
      { type: 'literal', value: ' and ' },
      { type: 'element', value: 'Tim White' },
    ]);
  });

  it('drops duplicates in parts output so every part key stays unique', () => {
    expect(formatReleaseArtistLineParts(['LYNX', 'LYNX', 'Tim White'])).toEqual(
      [
        { type: 'element', value: 'LYNX' },
        { type: 'literal', value: ' and ' },
        { type: 'element', value: 'Tim White' },
      ]
    );
  });

  it('renders no parts when no names and no fallback exist', () => {
    expect(formatReleaseArtistLineParts([])).toEqual([]);
  });
});
