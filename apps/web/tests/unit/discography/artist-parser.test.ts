import { describe, expect, it } from 'vitest';
import {
  cleanTrackTitle,
  extractFeatured,
  extractRemixers,
  isRemix,
  normalizeArtistName,
  parseArtistCredits,
  parseMainArtists,
  splitByConjunction,
} from '@/lib/discography/artist-parser';

describe('artist-parser', () => {
  describe('normalizeArtistName', () => {
    it('normalizes whitespace and punctuation for comparisons', () => {
      expect(normalizeArtistName('  Daft   Punk  ')).toBe('daft punk');
      expect(normalizeArtistName("Guns N' Roses")).toBe("guns n' roses");
      expect(normalizeArtistName('AC/DC!!')).toBe('acdc');
    });
  });

  describe('splitByConjunction', () => {
    it('splits by common conjunctions', () => {
      expect(splitByConjunction('Artist A & Artist B')).toEqual([
        'Artist A',
        'Artist B',
      ]);
      expect(splitByConjunction('Artist A and Artist B')).toEqual([
        'Artist A',
        'Artist B',
      ]);
      expect(splitByConjunction('Artist A x Artist B')).toEqual([
        'Artist A',
        'Artist B',
      ]);
      expect(splitByConjunction('Artist A, Artist B')).toEqual([
        'Artist A',
        'Artist B',
      ]);
    });
  });

  describe('parseMainArtists', () => {
    it('splits "vs" collaborations into main + vs credits', () => {
      const credits = parseMainArtists([
        { id: '1', name: 'Artist A vs Artist B' },
      ]);
      expect(credits).toHaveLength(2);
      expect(credits[0]).toMatchObject({
        name: 'Artist A',
        role: 'main_artist',
        joinPhrase: null,
        position: 0,
        isPrimary: true,
        spotifyId: '1',
      });
      expect(credits[1]).toMatchObject({
        name: 'Artist B',
        role: 'vs',
        joinPhrase: ' vs ',
        position: 1,
        isPrimary: false,
        spotifyId: undefined,
      });
    });

    it('conservatively splits short "&" collaborations into two main artists', () => {
      const credits = parseMainArtists([
        { id: '1', name: 'Artist A & Artist B' },
      ]);
      expect(credits).toHaveLength(2);
      expect(credits[0]).toMatchObject({
        name: 'Artist A',
        role: 'main_artist',
        joinPhrase: null,
        position: 0,
        isPrimary: true,
        spotifyId: '1',
      });
      expect(credits[1]).toMatchObject({
        name: 'Artist B',
        role: 'main_artist',
        joinPhrase: ' & ',
        position: 1,
        isPrimary: false,
      });
    });

    it('does not split "&" when it looks like a single long band name', () => {
      const long =
        'The Very Long Band Name That Is Definitely Longer Than Thirty Characters & Other';
      const credits = parseMainArtists([{ id: '1', name: long }]);
      expect(credits).toHaveLength(1);
      expect(credits[0]).toMatchObject({
        name: long,
        role: 'main_artist',
        isPrimary: true,
        spotifyId: '1',
      });
    });
  });

  describe('parseArtistCredits', () => {
    it('dedupes featured artists already present in main artist array', () => {
      const credits = parseArtistCredits(
        'Song (feat. Artist B) [Skrillex Remix]',
        [
          { id: '1', name: 'Artist A' },
          { id: '2', name: 'Artist B' },
        ]
      );

      expect(credits.map(c => `${c.role}:${c.name}`)).toEqual([
        'main_artist:Artist A',
        'main_artist:Artist B',
        'remixer:Skrillex',
      ]);
      expect(credits.map(c => c.position)).toEqual([0, 1, 2]);
    });
  });

  describe('cleanTrackTitle', () => {
    it('removes featured/remix credits for clean display', () => {
      expect(cleanTrackTitle('Song (feat. Rihanna) [Skrillex Remix]')).toBe(
        'Song'
      );
      expect(cleanTrackTitle('Song (with Artist B) (Daft Punk Remix)')).toBe(
        'Song'
      );
    });
  });

  describe('extractRemixers', () => {
    it('extracts remixers and ignores generic bracketed "Remix"', () => {
      expect(
        extractRemixers('Song (Daft Punk Remix)').map(r => r.name)
      ).toEqual(['Daft Punk']);
      expect(extractRemixers('Song (Remix)')).toEqual([]);
    });
  });

  describe('extractFeatured', () => {
    it('extracts bracketed featured credits', () => {
      expect(
        extractFeatured('Song (featuring Artist B)').map(r => r.name)
      ).toEqual(['Artist B']);
    });

    it('extracts inline and bracketed featured credits in order', () => {
      expect(
        extractFeatured('Song feat. Artist B [feat. Artist C]').map(r => r.name)
      ).toEqual(['Artist B', 'Artist C']);
    });
  });

  describe('isRemix', () => {
    it('detects remix titles via brackets or keywords', () => {
      expect(isRemix('Song (Daft Punk Remix)')).toBe(true);
      expect(isRemix('Song')).toBe(false);
    });
  });
});
