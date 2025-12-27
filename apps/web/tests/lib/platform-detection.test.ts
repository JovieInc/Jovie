import { describe, expect, it } from 'vitest';
import {
  detectPlatform,
  getAllPlatforms,
  getPlatformInfo,
  getPlatformsByCategory,
  normalizeUrl,
  validateLink,
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
        const detected = validateLink(input);
        expect(detected?.isValid).toBe(false);
      });
    });

    it('rejects encoded control characters', () => {
      const inputs = ['%0d%0ahttps://x.com/evil', 'https://example.com/%0A'];
      inputs.forEach(input => {
        const detected = validateLink(input);
        expect(detected?.isValid).toBe(false);
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
    it('should normalize TikTok URLs correctly', () => {
      const testCases = [
        {
          input: 'tiktok.com/username',
          expectedStart: 'https://tiktok.com/',
        },
        {
          input: 'https://tiktok.com/username',
          expectedStart: 'https://tiktok.com/',
        },
        {
          input: 'https://www.tiktok.com/username',
          expectedStart: 'https://www.tiktok.com/',
        },
      ];

      testCases.forEach(({ input, expectedStart }) => {
        const result = normalizeUrl(input);
        expect(result.startsWith(expectedStart)).toBe(true);
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
        expect(detected?.id).toBe('tiktok');
        expect(detected?.name).toBe('TikTok');
      });
    });

    it('should validate TikTok URLs with @ symbol', () => {
      const validUrls = [
        'https://tiktok.com/@username',
        'https://tiktok.com/@user.name',
        'https://tiktok.com/@user_name',
      ];

      validUrls.forEach(url => {
        const detected = validateLink(url);
        expect(detected?.isValid).toBe(true);
      });
    });

    it('should generate correct suggested title for TikTok handles', () => {
      const testCases = [
        {
          input: 'tiktok.com/username',
          expectedTitle: 'TikTok',
        },
        {
          input: 'https://tiktok.com/@existing',
          expectedTitle: 'TikTok',
        },
      ];

      testCases.forEach(({ input, expectedTitle }) => {
        const detected = validateLink(input);
        expect(detected?.suggestedTitle).toBe(expectedTitle);
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
        expect(detected?.id).toBe('twitch');
        const validated = validateLink(url);
        expect(validated?.isValid).toBe(true);
      });
    });

    it('detects OnlyFans profiles and validates format', () => {
      const urls = [
        'onlyfans.com/creator.name',
        'https://www.onlyfans.com/creator_name',
      ];

      urls.forEach(url => {
        const detected = detectPlatform(url);
        expect(detected?.id).toBe('onlyfans');
        const validated = validateLink(url);
        expect(validated?.isValid).toBe(true);
      });
    });
  });

  describe('Linktree detection', () => {
    it('detects linktree hosts and normalizes URL', () => {
      const url = 'linktr.ee/example';
      const detected = detectPlatform(url);
      expect(detected?.id).toBe('linktree');
      const validated = validateLink(url);
      expect(validated?.normalizedUrl).toContain('https://linktr.ee/example');
      expect(validated?.isValid).toBe(true);
    });
  });

  describe('getPlatformsByCategory', () => {
    describe('DSP platforms', () => {
      it('returns dsp platforms', () => {
        const dspPlatforms = getPlatformsByCategory('dsp');
        const platformIds = dspPlatforms.map(p => p.id);

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
          expect(platformIds).toContain(platform);
        });
      });
    });

    describe('Social platforms', () => {
      it('returns social media platforms', () => {
        const socialPlatforms = getPlatformsByCategory('social');
        const platformIds = socialPlatforms.map(p => p.id);

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
          expect(platformIds).toContain(platform);
        });
      });
    });

    describe('Earnings platforms', () => {
      it('returns monetization platforms', () => {
        const earningsPlatforms = getPlatformsByCategory('earnings');
        const platformIds = earningsPlatforms.map(p => p.id);

        const expectedEarningsPlatforms = [
          'venmo',
          'patreon',
          'kofi',
          'paypal',
          'cashapp',
          'shopify',
          'etsy',
          'buy-me-a-coffee',
        ];

        expectedEarningsPlatforms.forEach(platform => {
          expect(platformIds).toContain(platform);
        });
      });
    });

    describe('Website platforms', () => {
      it('returns link aggregators and personal websites', () => {
        const websitesPlatforms = getPlatformsByCategory('websites');
        const platformIds = websitesPlatforms.map(p => p.id);

        const expectedWebsitesPlatforms = [
          'website',
          'linktree',
          'laylo',
          'beacons',
        ];

        expectedWebsitesPlatforms.forEach(platform => {
          expect(platformIds).toContain(platform);
        });
      });
    });

    describe('Unknown platforms', () => {
      it('returns null for unknown platform IDs', () => {
        expect(getPlatformInfo('unknown')).toBeNull();
        expect(getPlatformInfo('not-a-platform')).toBeNull();
        expect(getPlatformInfo('random_platform')).toBeNull();
        expect(getPlatformInfo('')).toBeNull();
        expect(getPlatformInfo('myspace')).toBeNull();
      });
    });
  });

  describe('Category Sets', () => {
    describe('DSP_PLATFORMS', () => {
      it('contains expected DSP platforms', () => {
        const dspPlatforms = getPlatformsByCategory('dsp');
        const platformIds = dspPlatforms.map(p => p.id);

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
          expect(platformIds).toContain(platform);
        });
      });

      it('does not contain non-DSP platforms', () => {
        const dspPlatforms = getPlatformsByCategory('dsp');
        const platformIds = dspPlatforms.map(p => p.id);

        const nonDspPlatforms = ['instagram', 'tiktok', 'venmo', 'linktree'];

        nonDspPlatforms.forEach(platform => {
          expect(platformIds).not.toContain(platform);
        });
      });

      it('is consistent with getPlatformsByCategory', () => {
        const dspPlatforms = getPlatformsByCategory('dsp');
        dspPlatforms.forEach(platform => {
          expect(platform.category).toBe('dsp');
        });
      });
    });

    describe('SOCIAL_PLATFORMS', () => {
      it('contains expected social platforms', () => {
        const socialPlatforms = getPlatformsByCategory('social');
        const platformIds = socialPlatforms.map(p => p.id);

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
          expect(platformIds).toContain(platform);
        });
      });

      it('does not contain non-social platforms', () => {
        const socialPlatforms = getPlatformsByCategory('social');
        const platformIds = socialPlatforms.map(p => p.id);

        const nonSocialPlatforms = [
          'spotify',
          'apple-music',
          'venmo',
          'linktree',
        ];

        nonSocialPlatforms.forEach(platform => {
          expect(platformIds).not.toContain(platform);
        });
      });

      it('is consistent with getPlatformsByCategory', () => {
        const socialPlatforms = getPlatformsByCategory('social');
        socialPlatforms.forEach(platform => {
          expect(platform.category).toBe('social');
        });
      });
    });

    describe('EARNINGS_PLATFORMS', () => {
      it('contains expected earnings platforms', () => {
        const earningsPlatforms = getPlatformsByCategory('earnings');
        const platformIds = earningsPlatforms.map(p => p.id);

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
          expect(platformIds).toContain(platform);
        });
      });

      it('does not contain non-earnings platforms', () => {
        const earningsPlatforms = getPlatformsByCategory('earnings');
        const platformIds = earningsPlatforms.map(p => p.id);

        const nonEarningsPlatforms = ['spotify', 'instagram', 'linktree'];

        nonEarningsPlatforms.forEach(platform => {
          expect(platformIds).not.toContain(platform);
        });
      });

      it('is consistent with getPlatformsByCategory', () => {
        const earningsPlatforms = getPlatformsByCategory('earnings');
        earningsPlatforms.forEach(platform => {
          expect(platform.category).toBe('earnings');
        });
      });
    });

    describe('WEBSITES_PLATFORMS', () => {
      it('contains expected website platforms', () => {
        const websitesPlatforms = getPlatformsByCategory('websites');
        const platformIds = websitesPlatforms.map(p => p.id);

        const expectedWebsitesPlatforms = [
          'website',
          'linktree',
          'laylo',
          'beacons',
        ];

        expectedWebsitesPlatforms.forEach(platform => {
          expect(platformIds).toContain(platform);
        });
      });

      it('does not contain non-website platforms', () => {
        const websitesPlatforms = getPlatformsByCategory('websites');
        const platformIds = websitesPlatforms.map(p => p.id);

        const nonWebsitesPlatforms = ['spotify', 'instagram', 'venmo'];

        nonWebsitesPlatforms.forEach(platform => {
          expect(platformIds).not.toContain(platform);
        });
      });

      it('is consistent with getPlatformsByCategory', () => {
        const websitesPlatforms = getPlatformsByCategory('websites');
        websitesPlatforms.forEach(platform => {
          expect(platform.category).toBe('websites');
        });
      });
    });

    describe('Set consistency', () => {
      it('all category Sets are mutually exclusive', () => {
        const allPlatforms = getAllPlatforms();
        const categories = ['dsp', 'social', 'earnings', 'websites'] as const;

        // Group platforms by category
        const platformsByCategory = new Map<string, Set<string>>();
        categories.forEach(cat => {
          platformsByCategory.set(
            cat,
            new Set(getPlatformsByCategory(cat).map(p => p.id))
          );
        });

        // Ensure no platform appears in multiple categories
        const allPlatformIds = new Set<string>();
        let totalCount = 0;

        platformsByCategory.forEach(platformIds => {
          platformIds.forEach(id => {
            expect(allPlatformIds.has(id)).toBe(false);
            allPlatformIds.add(id);
          });
          totalCount += platformIds.size;
        });

        expect(allPlatformIds.size).toBe(totalCount);
      });

      it('each category has a non-zero size', () => {
        expect(getPlatformsByCategory('dsp').length).toBeGreaterThan(0);
        expect(getPlatformsByCategory('social').length).toBeGreaterThan(0);
        expect(getPlatformsByCategory('earnings').length).toBeGreaterThan(0);
        expect(getPlatformsByCategory('websites').length).toBeGreaterThan(0);
      });
    });
  });
});
