import { describe, expect, it } from 'vitest';
import {
  cleanTrackTitle,
  extractRemixers,
  extractWith,
  isRemix,
  normalizeArtistName,
  parseArtistCredits,
  parseArtistCreditsFromArtistLine,
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

    it('does not split and/& when the whole name matches a known provider artist', () => {
      expect(splitByConjunction('Tones And I', ['Tones And I'])).toEqual([
        'Tones And I',
      ]);
      expect(splitByConjunction('Above & Beyond', ['Above & Beyond'])).toEqual([
        'Above & Beyond',
      ]);
      expect(
        splitByConjunction('Artist A and Artist B', ['Tones And I'])
      ).toEqual(['Artist A', 'Artist B']);
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

    it('does not split and/& when the whole name is a provider artist', () => {
      const credits = parseMainArtists([
        { id: 'david-guetta', name: 'David Guetta' },
        { id: 'tones-and-i', name: 'Tones And I' },
        { id: 'nicky-romero', name: 'Nicky Romero' },
        { id: 'above-and-beyond', name: 'Above & Beyond' },
      ]);

      expect(credits.map(credit => credit.name)).toEqual([
        'David Guetta',
        'Tones And I',
        'Nicky Romero',
        'Above & Beyond',
      ]);
      expect(credits.map(credit => credit.spotifyId)).toEqual([
        'david-guetta',
        'tones-and-i',
        'nicky-romero',
        'above-and-beyond',
      ]);
      expect(credits.every(credit => credit.role === 'main_artist')).toBe(true);
    });

    it('keeps every Spotify album artist as a primary credit', () => {
      const credits = parseMainArtists([
        { id: 'spotify-tim-white', name: 'Tim White' },
        { id: 'spotify-lynx', name: 'LYNX' },
      ]);

      expect(credits).toHaveLength(2);
      expect(credits.map(credit => credit.name)).toEqual(['Tim White', 'LYNX']);
      expect(credits.every(credit => credit.role === 'main_artist')).toBe(true);
      expect(credits.every(credit => credit.isPrimary)).toBe(true);
      expect(credits.map(credit => credit.spotifyId)).toEqual([
        'spotify-tim-white',
        'spotify-lynx',
      ]);
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
    it('uses explicit title roles instead of promoting provider artists', () => {
      const credits = parseArtistCredits(
        'Song (feat. Artist B) [Skrillex Remix]',
        [
          { id: '1', name: 'Artist A' },
          { id: '2', name: 'Artist B' },
        ]
      );

      expect(credits.map(c => `${c.role}:${c.name}`)).toEqual([
        'main_artist:Artist A',
        'featured_artist:Artist B',
        'remixer:Skrillex',
      ]);
      expect(credits.map(c => c.position)).toEqual([0, 1, 2]);
      expect(credits[1]).toMatchObject({
        spotifyId: '2',
        observedRole: 'main_artist',
        roleSource: 'title',
        isPrimary: false,
      });
    });

    it('preserves primary, featured, and remixer roles for Take Me Over', () => {
      const credits = parseArtistCredits(
        'Take Me Over (feat. Erica Gibson) [Austin Leeds Remix]',
        [
          { id: 'spotify-tim', name: 'Tim White' },
          { id: 'spotify-austin', name: 'Austin Leeds' },
        ]
      );

      expect(credits).toMatchObject([
        {
          name: 'Tim White',
          role: 'main_artist',
          isPrimary: true,
          spotifyId: 'spotify-tim',
        },
        {
          name: 'Erica Gibson',
          role: 'featured_artist',
          isPrimary: false,
        },
        {
          name: 'Austin Leeds',
          role: 'remixer',
          isPrimary: false,
          spotifyId: 'spotify-austin',
          observedRole: 'main_artist',
        },
      ]);
    });

    it('normalizes Apple display metadata without inventing artist IDs', () => {
      const credits = parseArtistCreditsFromArtistLine(
        'Take Me Over (feat. Erica Gibson) [Austin Leeds Remix]',
        'Tim White & Austin Leeds'
      );

      expect(credits.map(({ name, role }) => ({ name, role }))).toEqual([
        { name: 'Tim White', role: 'main_artist' },
        { name: 'Erica Gibson', role: 'featured_artist' },
        { name: 'Austin Leeds', role: 'remixer' },
      ]);
      expect(credits.every(credit => !credit.spotifyId)).toBe(true);
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

    it('extracts remixers from "Remixed by" credits', () => {
      expect(
        extractRemixers('Song (Remixed by Skrillex)').map(r => r.name)
      ).toEqual(['Skrillex']);
    });
  });

  describe('extractFeatured', () => {
    it('extracts bracketed and inline featured credits', () => {
      expect(
        parseArtistCredits('Song (feat. Artist B)', [{ id: '1', name: 'A' }])
          .filter(credit => credit.role === 'featured_artist')
          .map(credit => credit.name)
      ).toEqual(['Artist B']);

      expect(
        parseArtistCredits('Song feat. Artist C', [{ id: '1', name: 'A' }])
          .filter(credit => credit.role === 'featured_artist')
          .map(credit => credit.name)
      ).toEqual(['Artist C']);
    });
  });

  describe('extractWith', () => {
    it('extracts bracketed and inline "with" credits', () => {
      expect(extractWith('Song (with Artist B)').map(r => r.name)).toEqual([
        'Artist B',
      ]);
      expect(extractWith('Song with Artist C').map(r => r.name)).toEqual([
        'Artist C',
      ]);
    });

    it('splits multiple "with" artists by conjunctions', () => {
      expect(
        extractWith('Song (with Artist B & Artist C)').map(r => r.name)
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
