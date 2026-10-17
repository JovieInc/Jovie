import { describe, expect, it } from 'vitest';
import { getDspArtistImageUrl } from './artist-image';

describe('DSP artist image provenance', () => {
  it('does not assign shared MusicFetch artwork to a platform', () => {
    expect(
      getDspArtistImageUrl({
        matchSource: 'musicfetch',
        externalArtistImageUrl:
          'https://is1-ssl.mzstatic.com/image/reference.jpg',
      })
    ).toBeNull();
  });

  it.each(['isrc_discovery', 'manual', 'backfill', null])(
    'preserves an existing non-MusicFetch image from %s',
    matchSource => {
      expect(
        getDspArtistImageUrl({
          matchSource,
          externalArtistImageUrl: 'https://i.scdn.co/image/artist.jpg',
        })
      ).toBe('https://i.scdn.co/image/artist.jpg');
    }
  );

  it('keeps missing artwork unknown', () => {
    expect(getDspArtistImageUrl({})).toBeNull();
  });
});
