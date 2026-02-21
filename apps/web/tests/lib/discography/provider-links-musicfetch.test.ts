/**
 * Tests for MusicFetch integration in the provider-links module.
 *
 * Covers how resolveProviderLinks uses musicfetch results alongside
 * Apple Music and Deezer ISRC lookups, and how search fallbacks are
 * generated when musicfetch is unavailable or returns partial results.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

// MusicFetch mock
const mockIsMusicfetchAvailable = vi.fn(() => true);
const mockMusicfetchLookupByIsrc = vi.fn();

vi.mock('@/lib/discography/musicfetch', () => ({
  isMusicfetchAvailable: () => mockIsMusicfetchAvailable(),
  lookupByIsrc: (...args: unknown[]) => mockMusicfetchLookupByIsrc(...args),
}));

import {
  resolveProviderLinks,
  type TrackDescriptor,
} from '@/lib/discography/provider-links';

const baseTrack: TrackDescriptor = {
  title: 'Blinding Lights',
  artistName: 'The Weeknd',
  isrc: 'USUG11904201',
};

describe('resolveProviderLinks — MusicFetch integration', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    mockIsMusicfetchAvailable.mockReturnValue(true);
    mockMusicfetchLookupByIsrc.mockResolvedValue(null);

    // Default: iTunes returns no results
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ resultCount: 0, results: [] }),
    } as unknown as Response);
  });

  it('includes all providers from MusicFetch when available', async () => {
    mockMusicfetchLookupByIsrc.mockResolvedValue({
      links: {
        youtube: 'https://music.youtube.com/watch?v=abc',
        tidal: 'https://tidal.com/track/def',
        amazon_music: 'https://music.amazon.com/albums/ghi',
        soundcloud: 'https://soundcloud.com/weeknd/blinding-lights',
        pandora: 'https://www.pandora.com/artist/weeknd/blinding-lights',
      },
      raw: {},
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['youtube', 'tidal', 'amazon_music', 'soundcloud', 'pandora'],
      fetcher: fetchMock,
    });

    // All should be canonical from musicfetch
    const canonicalLinks = links.filter(l => l.quality === 'canonical');
    expect(canonicalLinks).toHaveLength(5);

    expect(canonicalLinks.map(l => l.provider).sort()).toEqual([
      'amazon_music',
      'pandora',
      'soundcloud',
      'tidal',
      'youtube',
    ]);

    for (const link of canonicalLinks) {
      expect(link.discovered_from).toBe('musicfetch_isrc');
    }
  });

  it('providers get search_fallback URLs when MusicFetch is unavailable', async () => {
    mockIsMusicfetchAvailable.mockReturnValue(false);

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['youtube', 'tidal', 'soundcloud'],
      fetcher: fetchMock,
    });

    // All should be search fallbacks
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.quality).toBe('search_fallback');
      expect(link.discovered_from).toBe('search_url');
    }
  });

  it('Apple Music/Deezer canonical results coexist with MusicFetch', async () => {
    // Both Apple Music (via iTunes) and MusicFetch return apple_music URL.
    // Since lookups run in parallel via Promise.all, the first to resolve wins
    // the seenProviders race. The important guarantee is that:
    // 1. apple_music gets a canonical link (from either source)
    // 2. deezer gets a canonical link (from either source)
    // 3. youtube comes from MusicFetch (no custom lookup exists)
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('itunes.apple.com')) {
        return {
          ok: true,
          json: async () => ({
            resultCount: 1,
            results: [
              {
                trackId: 999,
                trackViewUrl:
                  'https://itunes.apple.com/us/album/blinding-lights/999?i=999',
              },
            ],
          }),
        } as unknown as Response;
      }

      if (urlStr.includes('api.deezer.com')) {
        return {
          ok: true,
          json: async () => ({
            id: 777,
            link: 'https://www.deezer.com/track/777',
            album: { id: 888, link: 'https://www.deezer.com/album/888' },
          }),
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      } as unknown as Response;
    });

    // MusicFetch also returns apple_music and deezer
    mockMusicfetchLookupByIsrc.mockResolvedValue({
      links: {
        apple_music: 'https://music.apple.com/us/album/mf-version/111',
        deezer: 'https://www.deezer.com/track/mf-version',
        youtube: 'https://music.youtube.com/watch?v=fromMF',
      },
      raw: {},
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['apple_music', 'deezer', 'youtube'],
      fetcher: fetchMock,
    });

    // All three should be canonical (from whichever source won the race)
    const amLink = links.find(l => l.provider === 'apple_music');
    expect(amLink?.quality).toBe('canonical');
    expect(amLink?.url).toContain('music.apple.com');

    const dzLink = links.find(l => l.provider === 'deezer');
    expect(dzLink?.quality).toBe('canonical');
    expect(dzLink?.url).toContain('deezer.com');

    // YouTube should come from MusicFetch (no custom lookup for YouTube)
    const ytLink = links.find(l => l.provider === 'youtube');
    expect(ytLink?.discovered_from).toBe('musicfetch_isrc');
    expect(ytLink?.url).toBe('https://music.youtube.com/watch?v=fromMF');
  });

  it('remaining providers get search fallback when MusicFetch returns partial results', async () => {
    mockMusicfetchLookupByIsrc.mockResolvedValue({
      links: {
        youtube: 'https://music.youtube.com/watch?v=partial',
        // tidal and soundcloud not returned
      },
      raw: {},
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['youtube', 'tidal', 'soundcloud'],
      fetcher: fetchMock,
    });

    expect(links).toHaveLength(3);

    // YouTube should be canonical
    const ytLink = links.find(l => l.provider === 'youtube');
    expect(ytLink?.quality).toBe('canonical');

    // Tidal and SoundCloud should be search fallbacks
    const tidalLink = links.find(l => l.provider === 'tidal');
    expect(tidalLink?.quality).toBe('search_fallback');

    const scLink = links.find(l => l.provider === 'soundcloud');
    expect(scLink?.quality).toBe('search_fallback');
  });

  it('MusicFetch only resolves providers that are in the requested list', async () => {
    mockMusicfetchLookupByIsrc.mockResolvedValue({
      links: {
        youtube: 'https://music.youtube.com/watch?v=abc',
        tidal: 'https://tidal.com/track/def',
        amazon_music: 'https://music.amazon.com/albums/ghi',
      },
      raw: {},
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['youtube'], // Only requesting YouTube
      fetcher: fetchMock,
    });

    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe('youtube');
  });

  it('all 15 default providers get at least a search_fallback', async () => {
    mockIsMusicfetchAvailable.mockReturnValue(false);

    const links = await resolveProviderLinks(baseTrack, {
      fetcher: fetchMock,
    });

    // Default providers list has 15 entries
    expect(links.length).toBe(15);

    // Every provider should have a link
    const providers = new Set(links.map(l => l.provider));
    expect(providers).toContain('apple_music');
    expect(providers).toContain('spotify');
    expect(providers).toContain('youtube');
    expect(providers).toContain('soundcloud');
    expect(providers).toContain('deezer');
    expect(providers).toContain('amazon_music');
    expect(providers).toContain('tidal');
    expect(providers).toContain('pandora');
    expect(providers).toContain('napster');
    expect(providers).toContain('audiomack');
    expect(providers).toContain('qobuz');
    expect(providers).toContain('anghami');
    expect(providers).toContain('boomplay');
    expect(providers).toContain('iheartradio');
    expect(providers).toContain('tiktok');
  });

  it('falls back to search URLs when MusicFetch returns null', async () => {
    // When MusicFetch is available but the lookup returns null (e.g. track
    // not found), providers should still get search fallback URLs.
    mockMusicfetchLookupByIsrc.mockResolvedValue(null);

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['youtube', 'tidal'],
      fetcher: fetchMock,
    });

    // Should still get search fallback URLs
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.quality).toBe('search_fallback');
    }
  });

  it('does not call MusicFetch when no ISRC is provided', async () => {
    const trackWithoutIsrc: TrackDescriptor = {
      title: 'Unknown Track',
      artistName: 'Unknown Artist',
    };

    const links = await resolveProviderLinks(trackWithoutIsrc, {
      providers: ['youtube'],
      fetcher: fetchMock,
    });

    expect(mockMusicfetchLookupByIsrc).not.toHaveBeenCalled();
    expect(links).toHaveLength(1);
    expect(links[0].quality).toBe('search_fallback');
  });
});
