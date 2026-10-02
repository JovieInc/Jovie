import { describe, expect, it } from 'vitest';
import {
  normalizeIsrc,
  parseLinkQuery,
  providerKeyForUrl,
} from './parse-input';

const SPOTIFY_TRACK = 'https://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r';
const SPOTIFY_ARTIST = 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb';

describe('parseLinkQuery', () => {
  it('classifies a streaming URL, an ISRC, and artist-track text', () => {
    expect(parseLinkQuery(SPOTIFY_TRACK)).toEqual({
      kind: 'track',
      source: 'url',
      url: SPOTIFY_TRACK,
      providerKey: 'spotify:70LcF31zb1H0PyJoS1Sx1r',
    });
    expect(parseLinkQuery('gb-aye-92-00070')).toEqual({
      kind: 'track',
      source: 'isrc',
      isrc: 'GBAYE9200070',
    });
    expect(parseLinkQuery('Radiohead - Creep')).toEqual({
      kind: 'track',
      source: 'text',
      query: 'Radiohead - Creep',
    });
    expect(normalizeIsrc('USRC17607839')).toBe('USRC17607839');
    expect(providerKeyForUrl(SPOTIFY_ARTIST)).toBe(
      'artist:spotify:4Z8W4fKeB5YxbusRsdQVPb'
    );
  });

  it('treats a bare name as an artist and rejects a mismatched kind', () => {
    expect(parseLinkQuery('Radiohead')).toEqual({
      kind: 'artist',
      source: 'text',
      query: 'Radiohead',
    });
    expect(parseLinkQuery(SPOTIFY_ARTIST)).toMatchObject({
      kind: 'artist',
      source: 'url',
    });
    expect(parseLinkQuery(SPOTIFY_TRACK, 'artist').kind).toBe('invalid');
    expect(parseLinkQuery(SPOTIFY_ARTIST, 'track').kind).toBe('invalid');
    expect(
      parseLinkQuery('http://open.spotify.com/track/70LcF31zb1H0PyJoS1Sx1r')
        .kind
    ).toBe('invalid');
    expect(parseLinkQuery('javascript:alert(1)').kind).toBe('invalid');
    expect(parseLinkQuery('x'.repeat(301)).kind).toBe('invalid');
  });
});
