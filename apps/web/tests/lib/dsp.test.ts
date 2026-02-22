import { describe, expect, it } from 'vitest';
import { geoAwarePopularityIndex } from '@/constants/app';
import { DSP_CONFIGS, getAvailableDSPs, sortDSPsForDevice } from '@/lib/dsp';
import { Artist } from '@/types/db';

describe('DSP Utils', () => {
  describe('geoAwarePopularityIndex', () => {
    it('should prioritize region-specific DSP ordering when country is known', () => {
      expect(geoAwarePopularityIndex('youtube', 'IN')).toBeLessThan(
        geoAwarePopularityIndex('spotify', 'IN')
      );
    });

    it('should fall back to global popularity for unsupported countries', () => {
      expect(geoAwarePopularityIndex('spotify', 'ZA')).toBe(0);
    });
  });
  const mockArtist: Artist = {
    id: '1',
    owner_user_id: '1',
    handle: 'testartist',
    spotify_id: 'spotify123',
    name: 'Test Artist',
    spotify_url: 'https://open.spotify.com/artist/spotify123',
    apple_music_url: 'https://music.apple.com/artist/apple123',
    youtube_url: 'https://youtube.com/channel/youtube123',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: '2024-01-01T00:00:00Z',
  };

  describe('getAvailableDSPs', () => {
    it('should return all DSPs when artist has all URLs configured', () => {
      const result = getAvailableDSPs(mockArtist);

      expect(result).toHaveLength(3);
      expect(result.map(d => d.key)).toEqual([
        'spotify',
        'apple_music',
        'youtube',
      ]);
    });

    it('should return only Spotify when only Spotify is configured', () => {
      const artistWithOnlySpotify: Artist = {
        ...mockArtist,
        apple_music_url: undefined,
        youtube_url: undefined,
      };

      const result = getAvailableDSPs(artistWithOnlySpotify);

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('spotify');
      expect(result[0].name).toBe('Spotify');
    });

    it('should return empty array when no DSPs are configured', () => {
      const artistWithNoDSPs: Artist = {
        ...mockArtist,
        spotify_id: '',
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
      };

      const result = getAvailableDSPs(artistWithNoDSPs);

      expect(result).toHaveLength(0);
    });

    it('should use Spotify ID fallback when spotify_url is not provided', () => {
      const artistWithSpotifyId: Artist = {
        ...mockArtist,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
      };

      const result = getAvailableDSPs(artistWithSpotifyId);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://open.spotify.com/artist/spotify123');
    });

    it('should sort DSPs by country-specific popularity when country code is provided', () => {
      const result = getAvailableDSPs(mockArtist, undefined, 'IN');

      expect(result.map(d => d.key)).toEqual([
        'youtube',
        'spotify',
        'apple_music',
      ]);
    });

    it('should include release URLs when releases are provided', () => {
      const artistWithNoUrls: Artist = {
        ...mockArtist,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
        spotify_id: '',
      };

      const releases = [
        {
          id: '1',
          creator_id: '1',
          dsp: 'spotify',
          title: 'Latest Song',
          url: 'https://open.spotify.com/track/track123',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      const result = getAvailableDSPs(artistWithNoUrls, releases);

      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://open.spotify.com/track/track123');
    });
  });

  describe('sortDSPsForDevice', () => {
    const dspSet = [
      {
        key: 'spotify',
        name: 'Spotify',
        url: 'https://open.spotify.com/artist/spotify123',
        config: DSP_CONFIGS.spotify,
      },
      {
        key: 'apple_music',
        name: 'Apple Music',
        url: 'https://music.apple.com/artist/apple123',
        config: DSP_CONFIGS.apple_music,
      },
      {
        key: 'youtube',
        name: 'YouTube',
        url: 'https://youtube.com/channel/youtube123',
        config: DSP_CONFIGS.youtube,
      },
    ];

    it('keeps geo popularity as default ordering when device weighting is disabled', () => {
      const result = sortDSPsForDevice([...dspSet], {
        countryCode: 'US',
        platform: 'ios',
        enableDevicePriority: false,
      });

      expect(result.map(d => d.key)).toEqual([
        'spotify',
        'apple_music',
        'youtube',
      ]);
    });

    it('preserves geo ordering as primary even when device weighting is enabled on iOS', () => {
      // US geo ranks: spotify=0, apple_music=1, youtube=2
      // Device priority is only a tiebreaker, so geo order is preserved
      const result = sortDSPsForDevice([...dspSet], {
        countryCode: 'US',
        platform: 'ios',
        enableDevicePriority: true,
      });

      expect(result.map(d => d.key)).toEqual([
        'spotify',
        'apple_music',
        'youtube',
      ]);
    });

    it('uses device weighting as tiebreaker when geo ranks are equal', () => {
      // With distinct global ranks, device priority does not change order
      const withoutDevice = sortDSPsForDevice([...dspSet], {
        countryCode: null,
        platform: 'ios',
        enableDevicePriority: false,
      });
      const withDevice = sortDSPsForDevice([...dspSet], {
        countryCode: null,
        platform: 'ios',
        enableDevicePriority: true,
      });

      expect(withoutDevice.map(d => d.key)).toEqual(withDevice.map(d => d.key));
    });

    it('does not prioritize Apple Music on Android when device weighting is enabled', () => {
      const result = sortDSPsForDevice([...dspSet], {
        countryCode: 'US',
        platform: 'android',
        enableDevicePriority: true,
      });

      expect(result.map(d => d.key)).toEqual([
        'spotify',
        'apple_music',
        'youtube',
      ]);
    });
  });

  describe('DSP_CONFIGS', () => {
    it('should have correct configuration for all DSPs', () => {
      expect(DSP_CONFIGS.spotify).toEqual({
        name: 'Spotify',
        color: '#1DB954',
        textColor: 'white',
        logoSvg: expect.stringContaining('<svg'),
      });

      expect(DSP_CONFIGS.apple_music).toEqual({
        name: 'Apple Music',
        color: '#FA243C',
        textColor: 'white',
        logoSvg: expect.stringContaining('<svg'),
      });

      expect(DSP_CONFIGS.youtube).toEqual({
        name: 'YouTube',
        color: '#FF0000',
        textColor: 'white',
        logoSvg: expect.stringContaining('<svg'),
      });
    });
  });
});
