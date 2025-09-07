import { describe, expect, it } from 'vitest';
import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';

describe('Platform Detection', () => {
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
});
