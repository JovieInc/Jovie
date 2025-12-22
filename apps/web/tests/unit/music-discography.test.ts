import { describe, expect, it } from 'vitest';

import {
  buildSmartListenUrl,
  DEFAULT_SMART_LISTEN_PREFERENCE,
  type DSPLink,
  mapSpotifyAlbumToDiscographyRelease,
  mergeDSPLinks,
  pickSmartListenLink,
} from '@/lib/music/discography';

describe('discography + smart listen utilities', () => {
  it('maps Spotify album data to discography release with canonical DSP links', () => {
    const album = {
      id: 'album123',
      name: 'Test Album',
      album_type: 'album',
      release_date: '2025-01-01',
      external_ids: { upc: 'UPC123' },
      external_urls: {
        spotify: 'https://open.spotify.com/album/album123',
      },
      tracks: {
        items: [
          {
            id: 'track456',
            name: 'Track Name',
            duration_ms: 200_000,
            disc_number: 1,
            track_number: 1,
            explicit: false,
            external_ids: { isrc: 'ISRC123' },
            external_urls: {
              spotify: 'https://open.spotify.com/track/track456',
            },
          },
        ],
      },
    };

    const mapped = mapSpotifyAlbumToDiscographyRelease(album);

    expect(mapped.dspLinks).toHaveLength(1);
    expect(mapped.dspLinks[0]).toMatchObject({
      provider: 'spotify',
      url: 'https://open.spotify.com/album/album123',
      source: 'canonical',
      upc: 'UPC123',
    });

    expect(mapped.tracks).toHaveLength(1);
    expect(mapped.tracks[0]).toMatchObject({
      id: 'track456',
      name: 'Track Name',
      isrc: 'ISRC123',
      dspLinks: [
        expect.objectContaining({
          provider: 'spotify',
          url: 'https://open.spotify.com/track/track456',
          source: 'canonical',
          isrc: 'ISRC123',
        }),
      ],
    });
  });

  it('merges DSP links preferring canonical, identifiers, and higher confidence', () => {
    const baseLinks: DSPLink[] = [
      {
        provider: 'spotify',
        url: 'https://open.spotify.com/track/search',
        source: 'search',
        confidence: 0.6,
      },
      {
        provider: 'apple_music',
        url: 'https://music.apple.com/track/search',
        source: 'search',
        confidence: 0.7,
      },
    ];

    const canonicalOverrides: DSPLink[] = [
      {
        provider: 'spotify',
        url: 'https://open.spotify.com/track/canonical',
        source: 'canonical',
        confidence: 0.55,
        isrc: 'ISRC123',
      },
      {
        provider: 'apple_music',
        url: 'https://music.apple.com/track/canonical',
        source: 'canonical',
        confidence: 0.65,
        upc: 'UPC123',
      },
    ];

    const merged = mergeDSPLinks(baseLinks, canonicalOverrides);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      provider: 'spotify',
      url: 'https://open.spotify.com/track/canonical',
      source: 'canonical',
      isrc: 'ISRC123',
    });
    expect(merged[1]).toMatchObject({
      provider: 'apple_music',
      url: 'https://music.apple.com/track/canonical',
      source: 'canonical',
      upc: 'UPC123',
    });
  });

  it('selects best smart listen target using provider preference', () => {
    const links: DSPLink[] = [
      {
        provider: 'apple_music',
        url: 'https://music.apple.com/track/canonical',
        source: 'canonical',
        confidence: 0.8,
      },
      {
        provider: 'spotify',
        url: 'https://open.spotify.com/track/canonical',
        source: 'canonical',
        confidence: 0.7,
      },
    ];

    const best = pickSmartListenLink(links, DEFAULT_SMART_LISTEN_PREFERENCE);
    expect(best?.provider).toBe('spotify');

    const appleFirst = pickSmartListenLink(links, ['apple_music', 'spotify']);
    expect(appleFirst?.provider).toBe('apple_music');
  });

  it('builds smart listen URLs with encoded params', () => {
    expect(buildSmartListenUrl('artist', 'code123')).toBe(
      '/artist/listen/code123'
    );
    expect(buildSmartListenUrl('artist name', 'code 123', 'spotify')).toBe(
      '/artist%20name/listen/code%20123?p=spotify'
    );
  });
});
