import { describe, expect, it } from 'vitest';
import { buildPillLabel } from '@/features/dashboard/organisms/grouped-links/buildPillLabel';
import type { DetectedLink } from '@/lib/utils/platform-detection';

function createLink(overrides: Partial<DetectedLink> = {}): DetectedLink {
  return {
    platform: {
      id: 'instagram',
      name: 'Instagram',
      category: 'social',
      icon: 'instagram',
      color: '#E4405F',
      placeholder: 'https://instagram.com/',
    },
    normalizedUrl: 'https://instagram.com/testuser',
    originalUrl: 'https://instagram.com/testuser',
    suggestedTitle: 'Instagram',
    isValid: true,
    ...overrides,
  };
}

describe('buildPillLabel', () => {
  describe('fallback chain: displayText → handle → platform name', () => {
    it('should prefer displayText (via suggestedTitle) when it differs from platform name', () => {
      const link = createLink({
        suggestedTitle: 'My Official Page',
        normalizedUrl: 'https://instagram.com/testuser',
      });
      expect(buildPillLabel(link)).toBe('My Official Page');
    });

    it('should use @handle when no displayText is set', () => {
      const link = createLink({
        suggestedTitle: 'Instagram', // same as platform name, means no displayText
        normalizedUrl: 'https://instagram.com/testuser',
      });
      expect(buildPillLabel(link)).toBe('@testuser');
    });

    it('should fall back to platform name when no handle or displayText', () => {
      const link = createLink({
        platform: {
          id: 'spotify',
          name: 'Spotify',
          category: 'dsp',
          icon: 'spotify',
          color: '#1DB954',
          placeholder: 'https://open.spotify.com/artist/',
        },
        suggestedTitle: 'Spotify',
        normalizedUrl: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
      });
      expect(buildPillLabel(link)).toBe('Spotify');
    });
  });

  describe('displayText handling', () => {
    it('should not silently discard displayText under 40 chars', () => {
      const link = createLink({
        suggestedTitle: 'My Official YouTube Channel', // 28 chars, was at old limit
      });
      expect(buildPillLabel(link)).toBe('My Official YouTube Channel');
    });

    it('should truncate displayText over 40 chars with ellipsis', () => {
      const longTitle =
        'This Is A Very Long Custom Display Text That Exceeds The Limit';
      const link = createLink({ suggestedTitle: longTitle });
      const result = buildPillLabel(link);
      expect(result.length).toBeLessThanOrEqual(40);
      expect(result).toContain('...');
    });

    it('should strip " on Platform" suffix from suggested titles', () => {
      const link = createLink({
        suggestedTitle: '@testuser on Instagram',
        normalizedUrl: 'https://instagram.com/testuser',
      });
      expect(buildPillLabel(link)).toBe('@testuser');
    });

    it('should extract handle from "Platform (@handle)" auto-generated titles', () => {
      const link = createLink({
        platform: {
          id: 'tiktok',
          name: 'TikTok',
          category: 'social',
          icon: 'tiktok',
          color: '#000000',
          placeholder: 'https://www.tiktok.com/@',
        },
        suggestedTitle: 'TikTok (@itstimwhite)',
        normalizedUrl: 'https://www.tiktok.com/@itstimwhite',
      });
      expect(buildPillLabel(link)).toBe('@itstimwhite');
    });
  });

  describe('YouTube channel ID handling', () => {
    it('should not create fake handles from opaque channel IDs', () => {
      const link = createLink({
        platform: {
          id: 'youtube',
          name: 'YouTube',
          category: 'social',
          icon: 'youtube',
          color: '#FF0000',
          placeholder: 'https://youtube.com/@',
        },
        suggestedTitle: 'YouTube',
        normalizedUrl:
          'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
      });
      // Should fall back to platform name, not show @UCX6OQ3DkcsbYNE6H8uQQuVA
      expect(buildPillLabel(link)).toBe('YouTube');
    });

    it('should show @handle for YouTube @ URLs', () => {
      const link = createLink({
        platform: {
          id: 'youtube',
          name: 'YouTube',
          category: 'social',
          icon: 'youtube',
          color: '#FF0000',
          placeholder: 'https://youtube.com/@',
        },
        suggestedTitle: 'YouTube',
        normalizedUrl: 'https://www.youtube.com/@timwhite',
      });
      expect(buildPillLabel(link)).toBe('@timwhite');
    });
  });

  describe('new platform handlers', () => {
    it('should extract handle from SoundCloud URLs', () => {
      const link = createLink({
        platform: {
          id: 'soundcloud',
          name: 'SoundCloud',
          category: 'social',
          icon: 'soundcloud',
          color: '#FF3300',
          placeholder: 'https://soundcloud.com/',
        },
        suggestedTitle: 'SoundCloud',
        normalizedUrl: 'https://soundcloud.com/djsnake',
      });
      expect(buildPillLabel(link)).toBe('@djsnake');
    });

    it('should extract handle from Twitch URLs', () => {
      const link = createLink({
        platform: {
          id: 'twitch',
          name: 'Twitch',
          category: 'social',
          icon: 'twitch',
          color: '#9146FF',
          placeholder: 'https://twitch.tv/',
        },
        suggestedTitle: 'Twitch',
        normalizedUrl: 'https://twitch.tv/ninja',
      });
      expect(buildPillLabel(link)).toBe('@ninja');
    });

    it('should extract handle from LinkedIn profile URLs', () => {
      const link = createLink({
        platform: {
          id: 'linkedin',
          name: 'LinkedIn',
          category: 'social',
          icon: 'linkedin',
          color: '#0A66C2',
          placeholder: 'https://linkedin.com/in/',
        },
        suggestedTitle: 'LinkedIn',
        normalizedUrl: 'https://linkedin.com/in/timwhite',
      });
      expect(buildPillLabel(link)).toBe('@timwhite');
    });
  });

  describe('website links', () => {
    it('should show hostname for website links', () => {
      const link = createLink({
        platform: {
          id: 'website',
          name: 'Website',
          category: 'custom' as 'social',
          icon: 'website',
          color: '#000000',
          placeholder: 'https://',
        },
        suggestedTitle: 'Website',
        normalizedUrl: 'https://example.com/page',
      });
      expect(buildPillLabel(link)).toBe('example.com');
    });
  });
});
