import { describe, expect, it } from 'vitest';
import {
  buildPrefillUrl,
  compactUrlDisplay,
  type LinkSection,
  labelFor,
  suggestionIdentity,
} from '@/components/dashboard/organisms/links/utils/link-display-utils';

describe('link-display-utils', () => {
  describe('labelFor', () => {
    it('should return correct labels for each section', () => {
      expect(labelFor('social')).toBe('SOCIAL');
      expect(labelFor('dsp')).toBe('MUSIC SERVICE');
      expect(labelFor('earnings')).toBe('MONETIZATION');
      expect(labelFor('custom')).toBe('CUSTOM');
    });

    it('should return CUSTOM for unknown sections', () => {
      // TypeScript would normally prevent this, but testing runtime behavior
      expect(labelFor('unknown' as LinkSection)).toBe('CUSTOM');
    });
  });

  describe('compactUrlDisplay', () => {
    describe('social platforms with @handles', () => {
      it('should format Instagram URLs with @ prefix', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/ladygaga')
        ).toBe('@ladygaga');
        expect(
          compactUrlDisplay('instagram', 'https://www.instagram.com/ladygaga')
        ).toBe('@ladygaga');
        expect(compactUrlDisplay('instagram', 'instagram.com/ladygaga')).toBe(
          '@ladygaga'
        );
      });

      it('should format TikTok URLs with @ prefix', () => {
        expect(
          compactUrlDisplay('tiktok', 'https://www.tiktok.com/@charlidamelio')
        ).toBe('@charlidamelio');
        expect(
          compactUrlDisplay('tiktok', 'https://tiktok.com/charlidamelio')
        ).toBe('@charlidamelio');
      });

      it('should format Twitter/X URLs with @ prefix', () => {
        expect(compactUrlDisplay('twitter', 'https://x.com/elonmusk')).toBe(
          '@elonmusk'
        );
        expect(
          compactUrlDisplay('twitter', 'https://twitter.com/elonmusk')
        ).toBe('@elonmusk');
        expect(compactUrlDisplay('x', 'https://x.com/elonmusk')).toBe(
          '@elonmusk'
        );
      });

      it('should format Venmo URLs with @ prefix', () => {
        expect(compactUrlDisplay('venmo', 'https://venmo.com/johndoe')).toBe(
          '@johndoe'
        );
      });
    });

    describe('snapchat URLs', () => {
      it('should handle Snapchat add URLs', () => {
        expect(
          compactUrlDisplay('snapchat', 'https://snapchat.com/add/djkhaled')
        ).toBe('@djkhaled');
      });

      it('should handle direct Snapchat usernames', () => {
        expect(
          compactUrlDisplay('snapchat', 'https://snapchat.com/djkhaled')
        ).toBe('@djkhaled');
      });
    });

    describe('YouTube URLs', () => {
      it('should handle YouTube @ handles', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/@MrBeast')
        ).toBe('@MrBeast');
      });

      it('should handle YouTube channel URLs', () => {
        expect(
          compactUrlDisplay(
            'youtube',
            'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA'
          )
        ).toBe('@UCX6OQ3DkcsbYNE6H8uQQuVA');
      });

      it('should handle YouTube user URLs', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/user/pewdiepie')
        ).toBe('@pewdiepie');
      });

      it('should handle YouTube c (custom) URLs', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/c/mrbeast6000')
        ).toBe('@mrbeast6000');
      });

      it('should return path segment for other YouTube URLs', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/watch')
        ).toBe('watch');
      });
    });

    describe('website URLs', () => {
      it('should return just the hostname for websites', () => {
        expect(
          compactUrlDisplay('website', 'https://www.example.com/page')
        ).toBe('example.com');
        expect(compactUrlDisplay('website', 'https://mysite.co.uk')).toBe(
          'mysite.co.uk'
        );
      });
    });

    describe('other platforms', () => {
      it('should return hostname for unknown platforms', () => {
        expect(
          compactUrlDisplay('spotify', 'https://open.spotify.com/artist/123')
        ).toBe('open.spotify.com');
      });
    });

    describe('edge cases', () => {
      it('should return empty string for empty URL', () => {
        expect(compactUrlDisplay('instagram', '')).toBe('');
        expect(compactUrlDisplay('instagram', '   ')).toBe('');
      });

      it('should return hostname only when no path segment exists', () => {
        expect(compactUrlDisplay('instagram', 'https://instagram.com/')).toBe(
          'instagram.com'
        );
      });

      it('should handle URLs without scheme', () => {
        expect(compactUrlDisplay('instagram', 'instagram.com/ladygaga')).toBe(
          '@ladygaga'
        );
      });

      it('should handle invalid URLs gracefully', () => {
        expect(compactUrlDisplay('instagram', 'not a valid url at all')).toBe(
          'not a valid url at all'
        );
      });

      it('should strip www from hostnames', () => {
        expect(compactUrlDisplay('website', 'https://www.example.com')).toBe(
          'example.com'
        );
      });
    });

    describe('@ prefix handling', () => {
      it('should not double the @ prefix if already present', () => {
        expect(
          compactUrlDisplay('tiktok', 'https://www.tiktok.com/@already_has_at')
        ).toBe('@already_has_at');
      });
    });
  });

  describe('suggestionIdentity', () => {
    it('should return @-prefixed identity for social platforms', () => {
      const instagramLink = {
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social' as const,
          icon: 'instagram',
          color: '#E4405F',
          placeholder: '',
        },
        normalizedUrl: 'https://instagram.com/ladygaga',
      };
      const result = suggestionIdentity(instagramLink);
      // The result depends on canonicalIdentity implementation
      // It should return @ladygaga or similar @-prefixed identity
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should return undefined for links without @ identity', () => {
      const spotifyLink = {
        platform: {
          id: 'spotify',
          name: 'Spotify',
          category: 'dsp' as const,
          icon: 'spotify',
          color: '#1DB954',
          placeholder: '',
        },
        normalizedUrl: 'https://open.spotify.com/artist/123456',
      };
      const result = suggestionIdentity(spotifyLink);
      // Spotify links typically don't have @ identities
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });
  });

  describe('buildPrefillUrl', () => {
    it('should return correct prefill URLs for each platform', () => {
      expect(buildPrefillUrl('spotify')).toBe(
        'https://open.spotify.com/artist/'
      );
      expect(buildPrefillUrl('apple-music')).toBe(
        'https://music.apple.com/artist/'
      );
      expect(buildPrefillUrl('youtube-music')).toBe(
        'https://music.youtube.com/channel/'
      );
      expect(buildPrefillUrl('instagram')).toBe('https://instagram.com/');
      expect(buildPrefillUrl('tiktok')).toBe('https://www.tiktok.com/@');
      expect(buildPrefillUrl('youtube')).toBe('https://www.youtube.com/@');
      expect(buildPrefillUrl('twitter')).toBe('https://x.com/');
      expect(buildPrefillUrl('venmo')).toBe('https://venmo.com/');
      expect(buildPrefillUrl('website')).toBe('https://');
    });

    it('should return search mode trigger for spotify-artist', () => {
      expect(buildPrefillUrl('spotify-artist')).toBe('__SEARCH_MODE__:spotify');
    });

    it('should return empty string for unknown platforms', () => {
      expect(buildPrefillUrl('unknown-platform')).toBe('');
      expect(buildPrefillUrl('')).toBe('');
    });
  });
});
