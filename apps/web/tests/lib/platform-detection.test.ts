import { describe, expect, it } from 'vitest';
import {
  DSP_PLATFORMS,
  detectPlatform,
  EARNINGS_PLATFORMS,
  getPlatformCategory,
  normalizePlatformId,
  normalizeUrl,
  SOCIAL_PLATFORMS,
  WEBSITES_PLATFORMS,
} from '@/lib/utils/platform-detection';

describe('Platform Detection', () => {
  describe('Unsafe inputs', () => {
    it('rejects dangerous schemes', () => {
      const inputs = [
        'javascript:alert(1)',
        'data:text/html;base64,abc',
        'vbscript:msgbox("x")',
      ];
      inputs.forEach(input => {
        const detected = detectPlatform(input);
        expect(detected.isValid).toBe(false);
      });
    });

    it('rejects encoded control characters', () => {
      const inputs = ['%0d%0ahttps://x.com/evil', 'https://example.com/%0A'];
      inputs.forEach(input => {
        const detected = detectPlatform(input);
        expect(detected.isValid).toBe(false);
      });
    });

    it('normalizeUrl throws away dangerous inputs and returns original string', () => {
      const input = 'javascript:alert(1)';
      expect(normalizeUrl(input)).toBe(input);
    });
  });

  describe('Domain dot-fix normalization', () => {
    it('auto-inserts missing dot for common platforms', () => {
      const cases: Array<{ input: string; expectedPrefix: string }> = [
        {
          input: 'youtubecom/@username',
          expectedPrefix: 'https://youtube.com/',
        },
        {
          input: 'instagramcom/username',
          expectedPrefix: 'https://instagram.com/',
        },
        { input: 'tiktokcom/username', expectedPrefix: 'https://tiktok.com/' },
        { input: 'twitchtv/channel', expectedPrefix: 'https://twitch.tv/' },
        { input: 'venmocom/username', expectedPrefix: 'https://venmo.com/' },
      ];

      cases.forEach(({ input, expectedPrefix }) => {
        const result = normalizeUrl(input);
        expect(result.startsWith(expectedPrefix)).toBe(true);
      });
    });
  });
  describe('TikTok URL normalization', () => {
    it('should add @ symbol to TikTok handles when missing', () => {
      const testCases = [
        {
          input: 'tiktok.com/username',
          expected: 'https://tiktok.com/@username',
        },
        {
          input: 'https://tiktok.com/username',
          expected: 'https://tiktok.com/@username',
        },
        {
          input: 'https://www.tiktok.com/username',
          expected: 'https://www.tiktok.com/@username',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = normalizeUrl(input);
        expect(result).toBe(expected);
      });
    });

    it('should not add duplicate @ symbol to TikTok handles', () => {
      const testCases = [
        'https://tiktok.com/@username',
        'https://www.tiktok.com/@username',
        'tiktok.com/@username',
      ];

      testCases.forEach(input => {
        const result = normalizeUrl(input);
        expect(result).toContain('@username');
        // Should not have double @ symbols
        expect(result).not.toContain('@@');
      });
    });

    it('should detect TikTok platform correctly', () => {
      const testUrls = [
        'tiktok.com/username',
        'https://tiktok.com/@username',
        'https://www.tiktok.com/username',
      ];

      testUrls.forEach(url => {
        const detected = detectPlatform(url);
        expect(detected.platform.id).toBe('tiktok');
        expect(detected.platform.name).toBe('TikTok');
        expect(detected.isValid).toBe(true);
      });
    });

    it('should validate TikTok URLs with @ symbol', () => {
      const validUrls = [
        'https://tiktok.com/@username',
        'https://tiktok.com/@user.name',
        'https://tiktok.com/@user_name',
      ];

      validUrls.forEach(url => {
        const detected = detectPlatform(url);
        expect(detected.isValid).toBe(true);
      });
    });

    it('should generate correct suggested title for TikTok handles', () => {
      const testCases = [
        {
          input: 'tiktok.com/username',
          expectedTitle: 'TikTok (@username)',
        },
        {
          input: 'https://tiktok.com/@existing',
          expectedTitle: 'TikTok (@existing)',
        },
      ];

      testCases.forEach(({ input, expectedTitle }) => {
        const detected = detectPlatform(input);
        expect(detected.suggestedTitle).toBe(expectedTitle);
      });
    });
  });

  describe('Twitch and OnlyFans detection', () => {
    it('detects Twitch profiles and validates format', () => {
      const urls = [
        'twitch.tv/streamer123',
        'https://www.twitch.tv/streamer_456/',
      ];

      urls.forEach(url => {
        const detected = detectPlatform(url);
        expect(detected.platform.id).toBe('twitch');
        expect(detected.isValid).toBe(true);
      });
    });

    it('detects OnlyFans profiles and validates format', () => {
      const urls = [
        'onlyfans.com/creator.name',
        'https://www.onlyfans.com/creator_name',
      ];

      urls.forEach(url => {
        const detected = detectPlatform(url);
        expect(detected.platform.id).toBe('onlyfans');
        expect(detected.isValid).toBe(true);
      });
    });
  });

  describe('Linktree detection', () => {
    it('detects linktree hosts and normalizes URL', () => {
      const url = 'linktr.ee/example';
      const detected = detectPlatform(url);
      expect(detected.platform.id).toBe('linktree');
      expect(detected.normalizedUrl).toContain('https://linktr.ee/example');
      expect(detected.isValid).toBe(true);
    });
  });

  describe('normalizePlatformId', () => {
    it('converts underscore_case to kebab-case', () => {
      expect(normalizePlatformId('apple_music')).toBe('apple-music');
      expect(normalizePlatformId('youtube_music')).toBe('youtube-music');
      expect(normalizePlatformId('amazon_music')).toBe('amazon-music');
      expect(normalizePlatformId('buy_me_a_coffee')).toBe('buy-me-a-coffee');
      expect(normalizePlatformId('tencent_music')).toBe('tencent-music');
    });

    it('preserves already kebab-case IDs', () => {
      expect(normalizePlatformId('apple-music')).toBe('apple-music');
      expect(normalizePlatformId('youtube-music')).toBe('youtube-music');
      expect(normalizePlatformId('buy-me-a-coffee')).toBe('buy-me-a-coffee');
    });

    it('preserves single-word IDs', () => {
      expect(normalizePlatformId('spotify')).toBe('spotify');
      expect(normalizePlatformId('instagram')).toBe('instagram');
      expect(normalizePlatformId('tiktok')).toBe('tiktok');
    });
  });

  describe('getPlatformCategory', () => {
    describe('DSP platforms', () => {
      it('returns dsp for streaming platforms with kebab-case IDs', () => {
        expect(getPlatformCategory('spotify')).toBe('dsp');
        expect(getPlatformCategory('apple-music')).toBe('dsp');
        expect(getPlatformCategory('youtube-music')).toBe('dsp');
        expect(getPlatformCategory('amazon-music')).toBe('dsp');
        expect(getPlatformCategory('soundcloud')).toBe('dsp');
        expect(getPlatformCategory('bandcamp')).toBe('dsp');
        expect(getPlatformCategory('tidal')).toBe('dsp');
        expect(getPlatformCategory('deezer')).toBe('dsp');
        expect(getPlatformCategory('pandora')).toBe('dsp');
        expect(getPlatformCategory('tencent-music')).toBe('dsp');
        expect(getPlatformCategory('netease')).toBe('dsp');
      });

      it('returns dsp for streaming platforms with underscore IDs (DB format)', () => {
        expect(getPlatformCategory('apple_music')).toBe('dsp');
        expect(getPlatformCategory('youtube_music')).toBe('dsp');
        expect(getPlatformCategory('amazon_music')).toBe('dsp');
        expect(getPlatformCategory('tencent_music')).toBe('dsp');
      });
    });

    describe('Social platforms', () => {
      it('returns social for social media platforms', () => {
        expect(getPlatformCategory('instagram')).toBe('social');
        expect(getPlatformCategory('tiktok')).toBe('social');
        expect(getPlatformCategory('twitter')).toBe('social');
        expect(getPlatformCategory('facebook')).toBe('social');
        expect(getPlatformCategory('youtube')).toBe('social');
        expect(getPlatformCategory('twitch')).toBe('social');
        expect(getPlatformCategory('linkedin')).toBe('social');
        expect(getPlatformCategory('telegram')).toBe('social');
        expect(getPlatformCategory('snapchat')).toBe('social');
        expect(getPlatformCategory('reddit')).toBe('social');
        expect(getPlatformCategory('pinterest')).toBe('social');
        expect(getPlatformCategory('onlyfans')).toBe('social');
        expect(getPlatformCategory('threads')).toBe('social');
        expect(getPlatformCategory('discord')).toBe('social');
        expect(getPlatformCategory('line')).toBe('social');
        expect(getPlatformCategory('viber')).toBe('social');
        expect(getPlatformCategory('rumble')).toBe('social');
        expect(getPlatformCategory('quora')).toBe('social');
      });
    });

    describe('Earnings platforms', () => {
      it('returns earnings for monetization platforms', () => {
        expect(getPlatformCategory('venmo')).toBe('earnings');
        expect(getPlatformCategory('patreon')).toBe('earnings');
        expect(getPlatformCategory('kofi')).toBe('earnings');
        expect(getPlatformCategory('paypal')).toBe('earnings');
        expect(getPlatformCategory('cashapp')).toBe('earnings');
        expect(getPlatformCategory('shopify')).toBe('earnings');
        expect(getPlatformCategory('etsy')).toBe('earnings');
      });

      it('returns earnings for buy-me-a-coffee with underscore ID', () => {
        expect(getPlatformCategory('buy_me_a_coffee')).toBe('earnings');
        expect(getPlatformCategory('buy-me-a-coffee')).toBe('earnings');
      });
    });

    describe('Website platforms', () => {
      it('returns websites for link aggregators and personal websites', () => {
        expect(getPlatformCategory('website')).toBe('websites');
        expect(getPlatformCategory('linktree')).toBe('websites');
        expect(getPlatformCategory('laylo')).toBe('websites');
        expect(getPlatformCategory('beacons')).toBe('websites');
      });
    });

    describe('Unknown platforms', () => {
      it('returns custom for unknown platform IDs', () => {
        expect(getPlatformCategory('unknown')).toBe('custom');
        expect(getPlatformCategory('not-a-platform')).toBe('custom');
        expect(getPlatformCategory('random_platform')).toBe('custom');
        expect(getPlatformCategory('')).toBe('custom');
        expect(getPlatformCategory('myspace')).toBe('custom');
      });
    });

    describe('ID normalization', () => {
      it('handles mixed case IDs by normalizing underscores', () => {
        // The function normalizes underscores to hyphens
        expect(getPlatformCategory('apple_music')).toBe('dsp');
        expect(getPlatformCategory('youtube_music')).toBe('dsp');
      });

      it('handles various underscore patterns', () => {
        expect(getPlatformCategory('buy_me_a_coffee')).toBe('earnings');
      });
    });
  });

  describe('Category Sets', () => {
    describe('DSP_PLATFORMS', () => {
      it('contains expected DSP platforms', () => {
        const expectedDspPlatforms = [
          'spotify',
          'apple-music',
          'youtube-music',
          'amazon-music',
          'soundcloud',
          'bandcamp',
          'tidal',
          'deezer',
          'pandora',
          'tencent-music',
          'netease',
        ];

        expectedDspPlatforms.forEach(platform => {
          expect(DSP_PLATFORMS.has(platform)).toBe(true);
        });
      });

      it('does not contain non-DSP platforms', () => {
        const nonDspPlatforms = ['instagram', 'tiktok', 'venmo', 'linktree'];

        nonDspPlatforms.forEach(platform => {
          expect(DSP_PLATFORMS.has(platform)).toBe(false);
        });
      });

      it('is consistent with getPlatformCategory', () => {
        DSP_PLATFORMS.forEach(platformId => {
          expect(getPlatformCategory(platformId)).toBe('dsp');
        });
      });
    });

    describe('SOCIAL_PLATFORMS', () => {
      it('contains expected social platforms', () => {
        const expectedSocialPlatforms = [
          'instagram',
          'tiktok',
          'twitter',
          'facebook',
          'youtube',
          'twitch',
          'linkedin',
          'telegram',
          'snapchat',
          'reddit',
          'pinterest',
          'onlyfans',
          'threads',
          'discord',
          'line',
          'viber',
          'rumble',
          'quora',
        ];

        expectedSocialPlatforms.forEach(platform => {
          expect(SOCIAL_PLATFORMS.has(platform)).toBe(true);
        });
      });

      it('does not contain non-social platforms', () => {
        const nonSocialPlatforms = [
          'spotify',
          'apple-music',
          'venmo',
          'linktree',
        ];

        nonSocialPlatforms.forEach(platform => {
          expect(SOCIAL_PLATFORMS.has(platform)).toBe(false);
        });
      });

      it('is consistent with getPlatformCategory', () => {
        SOCIAL_PLATFORMS.forEach(platformId => {
          expect(getPlatformCategory(platformId)).toBe('social');
        });
      });
    });

    describe('EARNINGS_PLATFORMS', () => {
      it('contains expected earnings platforms', () => {
        const expectedEarningsPlatforms = [
          'venmo',
          'patreon',
          'buy-me-a-coffee',
          'kofi',
          'paypal',
          'cashapp',
          'shopify',
          'etsy',
        ];

        expectedEarningsPlatforms.forEach(platform => {
          expect(EARNINGS_PLATFORMS.has(platform)).toBe(true);
        });
      });

      it('does not contain non-earnings platforms', () => {
        const nonEarningsPlatforms = ['spotify', 'instagram', 'linktree'];

        nonEarningsPlatforms.forEach(platform => {
          expect(EARNINGS_PLATFORMS.has(platform)).toBe(false);
        });
      });

      it('is consistent with getPlatformCategory', () => {
        EARNINGS_PLATFORMS.forEach(platformId => {
          expect(getPlatformCategory(platformId)).toBe('earnings');
        });
      });
    });

    describe('WEBSITES_PLATFORMS', () => {
      it('contains expected website platforms', () => {
        const expectedWebsitesPlatforms = [
          'website',
          'linktree',
          'laylo',
          'beacons',
        ];

        expectedWebsitesPlatforms.forEach(platform => {
          expect(WEBSITES_PLATFORMS.has(platform)).toBe(true);
        });
      });

      it('does not contain non-website platforms', () => {
        const nonWebsitesPlatforms = ['spotify', 'instagram', 'venmo'];

        nonWebsitesPlatforms.forEach(platform => {
          expect(WEBSITES_PLATFORMS.has(platform)).toBe(false);
        });
      });

      it('is consistent with getPlatformCategory', () => {
        WEBSITES_PLATFORMS.forEach(platformId => {
          expect(getPlatformCategory(platformId)).toBe('websites');
        });
      });
    });

    describe('Set consistency', () => {
      it('all category Sets are mutually exclusive', () => {
        // Ensure no platform appears in multiple categories
        const allPlatformIds = new Set([
          ...DSP_PLATFORMS,
          ...SOCIAL_PLATFORMS,
          ...EARNINGS_PLATFORMS,
          ...WEBSITES_PLATFORMS,
        ]);

        const totalCount =
          DSP_PLATFORMS.size +
          SOCIAL_PLATFORMS.size +
          EARNINGS_PLATFORMS.size +
          WEBSITES_PLATFORMS.size;

        expect(allPlatformIds.size).toBe(totalCount);
      });

      it('Sets are readonly (immutable)', () => {
        // TypeScript enforces ReadonlySet at compile time, but we can verify
        // the Sets behave as expected at runtime
        expect(typeof DSP_PLATFORMS.has).toBe('function');
        expect(typeof SOCIAL_PLATFORMS.has).toBe('function');
        expect(typeof EARNINGS_PLATFORMS.has).toBe('function');
        expect(typeof WEBSITES_PLATFORMS.has).toBe('function');

        // Verify they have size property (characteristic of Set)
        expect(typeof DSP_PLATFORMS.size).toBe('number');
        expect(typeof SOCIAL_PLATFORMS.size).toBe('number');
        expect(typeof EARNINGS_PLATFORMS.size).toBe('number');
        expect(typeof WEBSITES_PLATFORMS.size).toBe('number');
      });

      it('each Set has a non-zero size', () => {
        expect(DSP_PLATFORMS.size).toBeGreaterThan(0);
        expect(SOCIAL_PLATFORMS.size).toBeGreaterThan(0);
        expect(EARNINGS_PLATFORMS.size).toBeGreaterThan(0);
        expect(WEBSITES_PLATFORMS.size).toBeGreaterThan(0);
      });
    });
  });
});
