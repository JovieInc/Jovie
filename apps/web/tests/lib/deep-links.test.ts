import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDeepLink,
  DSP_DEEP_LINKS,
  detectPlatform,
  getDSPDeepLinkConfig,
  getSocialDeepLinkConfig,
  SOCIAL_DEEP_LINKS,
} from '@/lib/deep-links';

// Mock window and document for testing
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: '',
  },
  writable: true,
});

describe('Deep Links', () => {
  beforeEach(() => {
    // Reset userAgent before each test
    Object.defineProperty(window.navigator, 'userAgent', {
      writable: true,
      value: '',
    });
  });

  describe('Platform Detection', () => {
    it('should detect iOS platform', () => {
      const result = detectPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)'
      );
      expect(result.platform).toBe('ios');
    });

    it('should detect Android platform', () => {
      const result = detectPlatform(
        'Mozilla/5.0 (Linux; Android 11; SM-G991B)'
      );
      expect(result.platform).toBe('android');
    });

    it('should detect desktop platform', () => {
      const result = detectPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      );
      expect(result.platform).toBe('desktop');
    });
  });

  describe('Social Deep Links', () => {
    describe('Instagram', () => {
      const config = SOCIAL_DEEP_LINKS.instagram;

      it('should extract username from Instagram URL', () => {
        const username = config.extractUsername?.(
          'https://instagram.com/testuser'
        );
        expect(username).toBe('testuser');
      });

      it('should create iOS deep link', () => {
        const result = createDeepLink(
          'https://instagram.com/testuser',
          config,
          { platform: 'ios' }
        );
        expect(result.nativeUrl).toBe('instagram://user?username=testuser');
        expect(result.shouldTryNative).toBe(true);
      });

      it('should create Android deep link', () => {
        const result = createDeepLink(
          'https://instagram.com/testuser',
          config,
          { platform: 'android' }
        );
        expect(result.nativeUrl).toContain(
          'intent://instagram.com/_u/testuser'
        );
        expect(result.shouldTryNative).toBe(true);
      });

      it('should fallback to web on desktop', () => {
        const result = createDeepLink(
          'https://instagram.com/testuser',
          config,
          { platform: 'desktop' }
        );
        expect(result.shouldTryNative).toBe(false);
        expect(result.fallbackUrl).toBe('https://instagram.com/testuser');
      });
    });

    describe('TikTok', () => {
      const config = SOCIAL_DEEP_LINKS.tiktok;

      it('should extract username from TikTok URL', () => {
        const username = config.extractUsername?.(
          'https://www.tiktok.com/@testuser'
        );
        expect(username).toBe('testuser');
      });

      it('should create iOS deep link', () => {
        const result = createDeepLink(
          'https://www.tiktok.com/@testuser',
          config,
          { platform: 'ios' }
        );
        expect(result.nativeUrl).toBe('tiktok://user?username=testuser');
      });
    });

    describe('YouTube', () => {
      const config = SOCIAL_DEEP_LINKS.youtube;

      it('should extract username from YouTube @username URL', () => {
        const username = config.extractUsername?.(
          'https://www.youtube.com/@testuser'
        );
        expect(username).toBe('testuser');
      });

      it('should extract username from YouTube user URL', () => {
        const username = config.extractUsername?.(
          'https://www.youtube.com/user/testuser'
        );
        expect(username).toBe('testuser');
      });

      it('should extract channel ID from YouTube channel URL', () => {
        const channelId = config.extractId?.(
          'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw'
        );
        expect(channelId).toBe('UC_x5XG1OV2P6uZZ5FSM9Ttw');
      });
    });
  });

  describe('DSP Deep Links', () => {
    describe('Spotify', () => {
      const config = DSP_DEEP_LINKS.spotify;

      it('should extract artist ID from Spotify URL', () => {
        const artistId = config.extractId?.(
          'https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw'
        );
        expect(artistId).toBe('4YRxDV8wJFPHPTeXepOstw');
      });

      it('should create iOS deep link', () => {
        const result = createDeepLink(
          'https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw',
          config,
          { platform: 'ios' }
        );
        expect(result.nativeUrl).toBe(
          'spotify://artist/4YRxDV8wJFPHPTeXepOstw'
        );
        expect(result.shouldTryNative).toBe(true);
      });

      it('should create Android deep link', () => {
        const result = createDeepLink(
          'https://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw',
          config,
          { platform: 'android' }
        );
        expect(result.nativeUrl).toContain(
          'intent://open.spotify.com/artist/4YRxDV8wJFPHPTeXepOstw'
        );
        expect(result.shouldTryNative).toBe(true);
      });
    });

    describe('Apple Music', () => {
      const config = DSP_DEEP_LINKS.apple_music;

      it('should extract artist ID from Apple Music URL', () => {
        const artistId = config.extractId?.(
          'https://music.apple.com/us/artist/taylor-swift/159260351'
        );
        expect(artistId).toBe('159260351');
      });

      it('should create iOS deep link', () => {
        const result = createDeepLink(
          'https://music.apple.com/us/artist/taylor-swift/159260351',
          config,
          { platform: 'ios' }
        );
        expect(result.nativeUrl).toBe('music://artist/159260351');
      });
    });
  });

  describe('Extended platform coverage', () => {
    it('should extract SoundCloud username and create iOS deep link', () => {
      const config = DSP_DEEP_LINKS.soundcloud;
      const username = config.extractUsername?.(
        'https://soundcloud.com/artistname'
      );
      expect(username).toBe('artistname');

      const result = createDeepLink(
        'https://soundcloud.com/artistname',
        config,
        {
          platform: 'ios',
        }
      );
      expect(result.nativeUrl).toBe('soundcloud://users:artistname');
    });

    it('should extract Tidal artist ID', () => {
      const config = DSP_DEEP_LINKS.tidal;
      const artistId = config.extractId?.(
        'https://tidal.com/browse/artist/123456'
      );
      expect(artistId).toBe('123456');
    });

    it('should extract LinkedIn username and create Android deep link', () => {
      const config = SOCIAL_DEEP_LINKS.linkedin;
      const username = config.extractUsername?.(
        'https://www.linkedin.com/in/test-artist/'
      );
      expect(username).toBe('test-artist');

      const result = createDeepLink(
        'https://www.linkedin.com/in/test-artist/',
        config,
        { platform: 'android' }
      );
      expect(result.nativeUrl).toContain(
        'intent://www.linkedin.com/in/test-artist'
      );
    });

    it('should extract WhatsApp number from wa.me URL', () => {
      const config = SOCIAL_DEEP_LINKS.whatsapp;
      const phone = config.extractId?.('https://wa.me/15551234567');
      expect(phone).toBe('15551234567');
    });
  });

  describe('Configuration Getters', () => {
    it('should get social deep link config', () => {
      const config = getSocialDeepLinkConfig('instagram');
      expect(config).toBe(SOCIAL_DEEP_LINKS.instagram);
    });

    it('should return null for unknown social platform', () => {
      const config = getSocialDeepLinkConfig('unknown');
      expect(config).toBeNull();
    });

    it('should get DSP deep link config', () => {
      const config = getDSPDeepLinkConfig('spotify');
      expect(config).toBe(DSP_DEEP_LINKS.spotify);
    });

    it('should return null for unknown DSP platform', () => {
      const config = getDSPDeepLinkConfig('unknown');
      expect(config).toBeNull();
    });

    it('should handle case insensitive platform names', () => {
      const config = getSocialDeepLinkConfig('INSTAGRAM');
      expect(config).toBe(SOCIAL_DEEP_LINKS.instagram);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed URLs gracefully', () => {
      const config = SOCIAL_DEEP_LINKS.instagram;
      const username = config.extractUsername?.('not-a-valid-url');
      expect(username).toBeNull();
    });

    it('should handle missing URL parts', () => {
      const config = DSP_DEEP_LINKS.spotify;
      const result = createDeepLink('https://spotify.com', config, {
        platform: 'ios',
      });
      expect(result.shouldTryNative).toBe(false);
    });

    it('should use original URL as fallback when no web fallback configured', () => {
      const originalUrl = 'https://example.com/test';
      const config = {
        name: 'Test',
        webFallback: '',
      };
      const result = createDeepLink(originalUrl, config, {
        platform: 'desktop',
      });
      expect(result.fallbackUrl).toBe(originalUrl);
    });
  });
});
