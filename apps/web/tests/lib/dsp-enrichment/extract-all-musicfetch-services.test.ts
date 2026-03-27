/**
 * Unit tests for extractAllMusicFetchServices()
 *
 * Covers:
 * - Returns all services with valid URLs (streaming, video, metadata)
 * - Skips services with no URL (null/undefined link)
 * - Handles Spotify special case (uses spotifyUrl param)
 * - Deduplicates by platform key
 * - Preserves raw payload for each service
 * - Maps MusicFetch service keys to DSP registry keys
 * - Handles unknown service keys (not in DSP registry)
 */

import { describe, expect, it, vi } from 'vitest';
import type { MusicFetchArtistResult } from '@/lib/dsp-enrichment/providers/musicfetch';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/dsp-enrichment/providers/musicfetch', () => ({
  extractAppleMusicId: (url: string) => {
    const m = /\/artist\/[^/]+\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractDeezerId: (url: string) => {
    const m = /artist\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractTidalId: (url: string) => {
    const m = /artist\/(\d+)/.exec(url);
    return m?.[1] ?? null;
  },
  extractSoundcloudId: (url: string) => {
    const m = /soundcloud\.com\/([a-zA-Z0-9_-]+)\/?$/.exec(url);
    return m?.[1] ?? null;
  },
  extractYoutubeMusicId: (url: string) => {
    const m = /channel\/(UC[a-zA-Z0-9_-]+)/.exec(url);
    return m?.[1] ?? null;
  },
  getMusicFetchServiceUrl: (
    service: { link?: string; url?: string } | undefined
  ) => {
    return service?.link ?? service?.url;
  },
}));

import { extractAllMusicFetchServices } from '@/lib/dsp-enrichment/musicfetch-mapping';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SPOTIFY_URL = 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we';

function makeFullArtistResult(
  overrides: Partial<MusicFetchArtistResult> = {}
): MusicFetchArtistResult {
  return {
    type: 'artist',
    name: 'Test Artist',
    image: { url: 'https://i.scdn.co/image/abc123' },
    bio: 'A great artist.',
    services: {
      appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
      youtube: { url: 'https://www.youtube.com/channel/UCabc' },
      youtubeMusic: { url: 'https://music.youtube.com/channel/UCabc' },
      soundcloud: { url: 'https://soundcloud.com/testartist' },
      deezer: { url: 'https://www.deezer.com/artist/789012' },
      tidal: { url: 'https://tidal.com/browse/artist/345678' },
      amazonMusic: { url: 'https://music.amazon.com/artists/B001TEST' },
      bandcamp: { url: 'https://testartist.bandcamp.com' },
      instagram: { url: 'https://www.instagram.com/testartist' },
      tiktok: { url: 'https://www.tiktok.com/@testartist' },
      genius: { url: 'https://genius.com/artists/test-artist' },
      discogs: { url: 'https://www.discogs.com/artist/123456' },
    },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// extractAllMusicFetchServices — identity layer: all platforms
// ─────────────────────────────────────────────────────────────────────────────

describe('extractAllMusicFetchServices', () => {
  it('returns all services with valid URLs across streaming, video, and metadata categories', () => {
    const links = extractAllMusicFetchServices(
      makeFullArtistResult(),
      SPOTIFY_URL
    );

    const platforms = links.map(l => l.platform);

    // Streaming DSPs
    expect(platforms).toContain('apple_music');
    expect(platforms).toContain('youtube');
    expect(platforms).toContain('youtube_music');
    expect(platforms).toContain('soundcloud');
    expect(platforms).toContain('deezer');
    expect(platforms).toContain('tidal');
    expect(platforms).toContain('amazon_music');
    expect(platforms).toContain('bandcamp');

    // Video DSPs
    expect(platforms).toContain('instagram');
    expect(platforms).toContain('tiktok');

    // Metadata DSPs
    expect(platforms).toContain('genius');
    expect(platforms).toContain('discogs');

    // Spotify added from spotifyUrl param
    expect(platforms).toContain('spotify');
  });

  it('skips services with no URL (null/undefined link field)', () => {
    const artistData = makeFullArtistResult({
      services: {
        appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
        deezer: {},
        tidal: { url: undefined as unknown as string },
        instagram: { url: '' },
      },
    });

    const links = extractAllMusicFetchServices(artistData);
    const platforms = links.map(l => l.platform);

    expect(platforms).toContain('apple_music');
    // deezer has no url/link property → getMusicFetchServiceUrl returns undefined
    expect(platforms).not.toContain('deezer');
    // tidal has undefined url → skipped
    expect(platforms).not.toContain('tidal');
  });

  it('handles the Spotify special case — uses spotifyUrl param when not in services', () => {
    const artistData = makeFullArtistResult({
      services: {
        appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
      },
    });

    const links = extractAllMusicFetchServices(artistData, SPOTIFY_URL);
    const spotifyLink = links.find(l => l.platform === 'spotify');

    expect(spotifyLink).toBeDefined();
    expect(spotifyLink!.url).toBe(SPOTIFY_URL);
    expect(spotifyLink!.rawPayload).toEqual({});
  });

  it('does not duplicate Spotify when it is already in services', () => {
    const artistData = makeFullArtistResult({
      services: {
        spotify: {
          url: 'https://open.spotify.com/artist/fromservice',
          id: 'fromservice',
        },
      },
    });

    const links = extractAllMusicFetchServices(artistData, SPOTIFY_URL);
    const spotifyLinks = links.filter(l => l.platform === 'spotify');

    // Only one Spotify entry (from services, not the param)
    expect(spotifyLinks).toHaveLength(1);
    expect(spotifyLinks[0].url).toBe(
      'https://open.spotify.com/artist/fromservice'
    );
  });

  it('does not add Spotify when spotifyUrl param is not provided and not in services', () => {
    const artistData = makeFullArtistResult({
      services: {
        appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
      },
    });

    const links = extractAllMusicFetchServices(artistData);
    const platforms = links.map(l => l.platform);

    // No spotify param → no spotify link
    expect(platforms).not.toContain('spotify');
  });

  it('maps corrected canonical service keys such as soundcloud and netease', () => {
    const artistData = makeFullArtistResult({
      services: {
        soundcloud: { url: 'https://soundcloud.com/testartist', id: 'sc1' },
        netease: { url: 'https://music.163.com/artist?id=123', id: 'ne1' },
      },
    });

    const platforms = extractAllMusicFetchServices(artistData).map(
      link => link.platform
    );

    expect(platforms).toContain('soundcloud');
    expect(platforms).toContain('netease');
    expect(platforms).not.toContain('soundCloud');
    expect(platforms).not.toContain('netEase');
  });

  it('preserves raw payload for each service', () => {
    const artistData = makeFullArtistResult({
      services: {
        deezer: {
          id: '8706544',
          link: 'https://www.deezer.com/artist/8706544',
        },
        tidal: {
          id: '7985446',
          link: 'https://tidal.com/browse/artist/7985446',
        },
      },
    });

    const links = extractAllMusicFetchServices(artistData);

    const deezerLink = links.find(l => l.platform === 'deezer');
    expect(deezerLink).toBeDefined();
    expect(deezerLink!.rawPayload).toEqual({
      id: '8706544',
      link: 'https://www.deezer.com/artist/8706544',
    });
    expect(deezerLink!.externalId).toBe('8706544');

    const tidalLink = links.find(l => l.platform === 'tidal');
    expect(tidalLink).toBeDefined();
    expect(tidalLink!.rawPayload).toEqual({
      id: '7985446',
      link: 'https://tidal.com/browse/artist/7985446',
    });
    expect(tidalLink!.externalId).toBe('7985446');
  });

  it('maps MusicFetch service keys to DSP registry keys correctly', () => {
    const artistData = makeFullArtistResult({
      services: {
        appleMusic: { url: 'https://music.apple.com/us/artist/test/123456' },
        youtubeMusic: { url: 'https://music.youtube.com/channel/UCabc' },
        amazonMusic: { url: 'https://music.amazon.com/artists/B001TEST' },
        soundcloud: { url: 'https://soundcloud.com/testartist' },
        netease: { url: 'https://music.163.com/artist?id=123' },
      },
    });

    const links = extractAllMusicFetchServices(artistData);
    const platforms = links.map(l => l.platform);

    // camelCase service keys → snake_case DSP keys
    expect(platforms).toContain('apple_music');
    expect(platforms).toContain('youtube_music');
    expect(platforms).toContain('amazon_music');
    expect(platforms).toContain('soundcloud');
    expect(platforms).toContain('netease');

    // Should NOT contain raw MusicFetch service names
    expect(platforms).not.toContain('appleMusic');
    expect(platforms).not.toContain('youtubeMusic');
    expect(platforms).not.toContain('amazonMusic');
    expect(platforms).not.toContain('soundCloud');
    expect(platforms).not.toContain('netEase');
  });

  it('handles unknown service keys by using raw service key as platform', () => {
    const artistData = makeFullArtistResult({
      services: {
        unknownPlatform: {
          url: 'https://unknown-platform.com/testartist',
          id: 'unknown-123',
        },
      },
    });

    const links = extractAllMusicFetchServices(artistData);
    const unknownLink = links.find(l => l.platform === 'unknownPlatform');

    // Falls back to raw service key when not in MUSICFETCH_SERVICE_TO_DSP
    expect(unknownLink).toBeDefined();
    expect(unknownLink!.url).toBe('https://unknown-platform.com/testartist');
    expect(unknownLink!.externalId).toBe('unknown-123');
  });

  it('returns empty array for artist with no services', () => {
    const artistData = makeFullArtistResult({ services: {} });
    const links = extractAllMusicFetchServices(artistData);
    expect(links).toHaveLength(0);
  });

  it('returns only Spotify when no services but spotifyUrl provided', () => {
    const artistData = makeFullArtistResult({ services: {} });
    const links = extractAllMusicFetchServices(artistData, SPOTIFY_URL);
    expect(links).toHaveLength(1);
    expect(links[0].platform).toBe('spotify');
    expect(links[0].url).toBe(SPOTIFY_URL);
  });
});
