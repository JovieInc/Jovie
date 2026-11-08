import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUALIFYING_ANSWERS,
  nextQualifyingStep,
  previousQualifyingStep,
  qualifyingPayload,
  qualifyingStepNumber,
  spotifyArtistIdFromUrl,
} from './waitlist-qualifying';

const ARTIST_ID = '4Z8W4fKeB5YxbusRsdQVPb';

describe('waitlist qualifying steps', () => {
  it('reads the artist id from a Spotify artist link', () => {
    expect(
      spotifyArtistIdFromUrl(
        `https://open.spotify.com/artist/${ARTIST_ID}?si=x`
      )
    ).toBe(ARTIST_ID);
    expect(
      spotifyArtistIdFromUrl(
        `https://open.spotify.com/intl-de/artist/${ARTIST_ID}`
      )
    ).toBe(ARTIST_ID);
    expect(spotifyArtistIdFromUrl('https://example.com/artist/abc')).toBeNull();
  });

  it('walks entry, artist, growth, spend and back', () => {
    expect(nextQualifyingStep('entry')).toBe('artist');
    expect(nextQualifyingStep('growth')).toBe('spend');
    expect(nextQualifyingStep('spend')).toBe('spend');
    expect(previousQualifyingStep('artist')).toBe('entry');
    expect(previousQualifyingStep('spend')).toBe('growth');
    expect(qualifyingStepNumber('entry')).toBe(1);
    expect(qualifyingStepNumber('spend')).toBe(4);
  });

  it('leaves skipped answers out of the join body', () => {
    expect(qualifyingPayload(EMPTY_QUALIFYING_ANSWERS)).toEqual({});
    expect(
      qualifyingPayload({
        ...EMPTY_QUALIFYING_ANSWERS,
        growth: '  ',
        spend: 'none',
      })
    ).toEqual({ momTest: { promoSpend: 'none' } });
  });
});
