import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSearchUrl,
  resolveProviderLinks,
  type TrackDescriptor,
} from '@/lib/discography/provider-links';

const baseTrack: TrackDescriptor = {
  title: 'Anti-Hero',
  artistName: 'Taylor Swift',
  isrc: 'USUM72212345',
};

describe('provider link discovery', () => {
  describe('buildSearchUrl', () => {
    it('builds provider-specific search URLs with ISRC-first query', () => {
      expect(buildSearchUrl('spotify', baseTrack)).toBe(
        'https://open.spotify.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('apple_music', baseTrack)).toBe(
        'https://music.apple.com/us/search?term=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('youtube', baseTrack)).toBe(
        'https://music.youtube.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('soundcloud', baseTrack)).toBe(
        'https://soundcloud.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('deezer', baseTrack)).toBe(
        'https://www.deezer.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('amazon_music', baseTrack)).toBe(
        'https://music.amazon.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('tidal', baseTrack)).toBe(
        'https://tidal.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('pandora', baseTrack)).toBe(
        'https://www.pandora.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero/tracks'
      );

      expect(buildSearchUrl('napster', baseTrack)).toBe(
        'https://web.napster.com/search?query=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('audiomack', baseTrack)).toBe(
        'https://audiomack.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('qobuz', baseTrack)).toBe(
        'https://www.qobuz.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('anghami', baseTrack)).toBe(
        'https://play.anghami.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('boomplay', baseTrack)).toBe(
        'https://www.boomplay.com/search/default/USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('iheartradio', baseTrack)).toBe(
        'https://www.iheart.com/search/?query=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );

      expect(buildSearchUrl('tiktok', baseTrack)).toBe(
        'https://www.tiktok.com/search?q=USUM72212345%20Taylor%20Swift%20Anti-Hero'
      );
    });

    it('falls back to title + artist when ISRC is missing', () => {
      const trackWithoutIsrc: TrackDescriptor = {
        ...baseTrack,
        isrc: undefined,
      };

      expect(buildSearchUrl('spotify', trackWithoutIsrc)).toBe(
        'https://open.spotify.com/search/Taylor%20Swift%20Anti-Hero'
      );
    });
  });

  describe('resolveProviderLinks', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
      fetchMock.mockReset();
    });

    it('prefers Apple canonical links from lookup when ISRC is available', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackId: 123456789,
              trackViewUrl:
                'https://itunes.apple.com/us/album/anti-hero/123456789?i=123456789',
            },
          ],
        }),
      } as unknown as Response);

      const links = await resolveProviderLinks(baseTrack, {
        providers: ['apple_music', 'spotify'],
        fetcher: fetchMock,
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('isrc=USUM72212345')
      );

      expect(links).toContainEqual({
        provider: 'apple_music',
        url: 'https://music.apple.com/us/album/anti-hero/123456789?i=123456789',
        quality: 'canonical',
        discovered_from: 'apple_music_isrc',
        provider_id: '123456789',
      });

      expect(links).toContainEqual({
        provider: 'spotify',
        url: 'https://open.spotify.com/search/USUM72212345%20Taylor%20Swift%20Anti-Hero',
        quality: 'search_fallback',
        discovered_from: 'search_url',
      });
    });

    it('falls back to search URLs when Apple lookup has no match', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      } as unknown as Response);

      const links = await resolveProviderLinks(baseTrack, {
        providers: ['apple_music', 'spotify'],
        fetcher: fetchMock,
      });

      expect(links).toContainEqual({
        provider: 'apple_music',
        url: 'https://music.apple.com/us/search?term=USUM72212345%20Taylor%20Swift%20Anti-Hero',
        quality: 'search_fallback',
        discovered_from: 'search_url',
      });
    });

    it('respects manual overrides and skips lookup', async () => {
      const links = await resolveProviderLinks(baseTrack, {
        providers: ['apple_music', 'spotify'],
        overrides: {
          apple_music: {
            url: 'https://music.apple.com/us/album/manual-override/1?i=1',
            discovered_from: 'manual curation',
          },
        },
        fetcher: fetchMock,
      });

      expect(fetchMock).not.toHaveBeenCalled();

      expect(links).toContainEqual({
        provider: 'apple_music',
        url: 'https://music.apple.com/us/album/manual-override/1?i=1',
        quality: 'manual_override',
        discovered_from: 'manual curation',
      });
    });
  });
});
