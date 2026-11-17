import { describe, expect, it } from 'vitest';
import {
  buildDestinationJovieLink,
  deriveNativeUri,
} from './destination-links';

describe('deriveNativeUri', () => {
  it('derives the Spotify URI from an open.spotify.com URL', () => {
    expect(
      deriveNativeUri('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')
    ).toBe('spotify:album:4aawyAB9vmqN3uQ7FjRGTy');
    expect(
      deriveNativeUri('https://open.spotify.com/track/1AvXmvvjBscdBxfBiOUT3s')
    ).toBe('spotify:track:1AvXmvvjBscdBxfBiOUT3s');
  });

  it('derives the YouTube URI from watch and youtu.be forms', () => {
    expect(deriveNativeUri('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'vnd.youtube:dQw4w9WgXcQ'
    );
    expect(deriveNativeUri('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'vnd.youtube:dQw4w9WgXcQ'
    );
    expect(
      deriveNativeUri('https://music.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('vnd.youtube:dQw4w9WgXcQ');
  });

  it('returns null for networks without a well-known URI scheme', () => {
    expect(
      deriveNativeUri('https://music.apple.com/us/album/never-say-always/123')
    ).toBeNull();
    expect(deriveNativeUri('https://www.deezer.com/track/123')).toBeNull();
    expect(
      deriveNativeUri('https://seasideheights.bandcamp.com/track/x')
    ).toBeNull();
  });

  it('returns null for Spotify URLs without a typed id and for junk input', () => {
    expect(deriveNativeUri('https://open.spotify.com/')).toBeNull();
    expect(deriveNativeUri('not a url')).toBeNull();
  });
});

describe('buildDestinationJovieLink', () => {
  it('stamps the destination and surface onto the Jovie smart link', () => {
    expect(
      buildDestinationJovieLink({
        baseUrl: 'https://jov.ie',
        linkPath: '/tim/seaside-heights',
        destinationKey: 'spotify',
        surface: 'work-inspector',
      })
    ).toBe(
      'https://jov.ie/tim/seaside-heights?utm_source=spotify&utm_medium=work-inspector'
    );
  });

  it('normalizes a trailing base slash and a missing leading slash', () => {
    expect(
      buildDestinationJovieLink({
        baseUrl: 'https://jov.ie/',
        linkPath: 'tim/seaside-heights',
        destinationKey: 'apple_music',
        surface: 'release-sidebar',
      })
    ).toBe(
      'https://jov.ie/tim/seaside-heights?utm_source=apple_music&utm_medium=release-sidebar'
    );
  });
});
