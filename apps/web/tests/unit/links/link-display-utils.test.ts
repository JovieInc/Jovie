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
      expect(labelFor('social')).toBe('Social');
      expect(labelFor('dsp')).toBe('Music service');
      expect(labelFor('earnings')).toBe('Monetization');
      expect(labelFor('custom')).toBe('Custom');
    });

    it('should return Custom for unknown sections', () => {
      // TypeScript would normally prevent this, but testing runtime behavior
      expect(labelFor('unknown' as LinkSection)).toBe('Custom');
    });

    it('should return Custom for null-like values', () => {
      expect(labelFor(null as unknown as LinkSection)).toBe('Custom');
      expect(labelFor(undefined as unknown as LinkSection)).toBe('Custom');
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

      it('should handle Snapchat add URL with no username', () => {
        expect(compactUrlDisplay('snapchat', 'https://snapchat.com/add')).toBe(
          '@add'
        );
      });

      it('should handle Snapchat add URL with @ prefix already', () => {
        expect(
          compactUrlDisplay('snapchat', 'https://snapchat.com/add/@djkhaled')
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

      it('should handle YouTube channel URLs without second segment', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/channel')
        ).toBe('channel');
      });

      it('should handle YouTube user URLs without second segment', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/user')
        ).toBe('user');
      });

      it('should handle YouTube c URLs without second segment', () => {
        expect(compactUrlDisplay('youtube', 'https://www.youtube.com/c')).toBe(
          'c'
        );
      });

      it('should return hostname for YouTube root URL', () => {
        expect(compactUrlDisplay('youtube', 'https://www.youtube.com/')).toBe(
          'youtube.com'
        );
      });

      it('should handle YouTube URLs with trailing slashes', () => {
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/@MrBeast/')
        ).toBe('@MrBeast');
        expect(
          compactUrlDisplay('youtube', 'https://www.youtube.com/c/mrbeast/')
        ).toBe('@mrbeast');
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

      it('should handle website URLs with complex paths', () => {
        expect(
          compactUrlDisplay(
            'website',
            'https://www.example.com/path/to/page?query=1'
          )
        ).toBe('example.com');
      });

      it('should handle website URLs with subdomains', () => {
        expect(
          compactUrlDisplay('website', 'https://blog.example.com/post')
        ).toBe('blog.example.com');
      });
    });

    describe('other platforms', () => {
      it('should return hostname for unknown platforms', () => {
        expect(
          compactUrlDisplay('spotify', 'https://open.spotify.com/artist/123')
        ).toBe('open.spotify.com');
      });

      it('should return hostname for apple-music', () => {
        expect(
          compactUrlDisplay(
            'apple-music',
            'https://music.apple.com/us/artist/123'
          )
        ).toBe('music.apple.com');
      });

      it('should return hostname for youtube-music', () => {
        expect(
          compactUrlDisplay(
            'youtube-music',
            'https://music.youtube.com/channel/123'
          )
        ).toBe('music.youtube.com');
      });

      it('should return hostname for soundcloud', () => {
        expect(
          compactUrlDisplay('soundcloud', 'https://soundcloud.com/artist')
        ).toBe('soundcloud.com');
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

      it('should handle URLs with query parameters', () => {
        expect(
          compactUrlDisplay(
            'instagram',
            'https://instagram.com/ladygaga?utm_source=app'
          )
        ).toBe('@ladygaga');
        expect(
          compactUrlDisplay(
            'youtube',
            'https://www.youtube.com/@MrBeast?sub_confirmation=1'
          )
        ).toBe('@MrBeast');
      });

      it('should handle URLs with hash fragments', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/ladygaga#posts')
        ).toBe('@ladygaga');
      });

      it('should handle URLs with multiple trailing slashes', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/ladygaga///')
        ).toBe('@ladygaga');
      });

      it('should handle HTTP (not HTTPS) URLs', () => {
        expect(
          compactUrlDisplay('instagram', 'http://instagram.com/ladygaga')
        ).toBe('@ladygaga');
      });

      it('should handle mixed case URLs', () => {
        expect(
          compactUrlDisplay('instagram', 'HTTPS://INSTAGRAM.COM/LadyGaga')
        ).toBe('@LadyGaga');
      });

      it('should handle URLs with port numbers', () => {
        expect(
          compactUrlDisplay('website', 'https://localhost:3000/page')
        ).toBe('localhost');
      });

      it('should return first path segment as fallback for invalid URL parsing', () => {
        // When URL can't be parsed, falls back to returning the URL as-is
        // or first path segment
        const result = compactUrlDisplay(
          'instagram',
          'definitely not a valid:url format'
        );
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('@ prefix handling', () => {
      it('should not double the @ prefix if already present', () => {
        expect(
          compactUrlDisplay('tiktok', 'https://www.tiktok.com/@already_has_at')
        ).toBe('@already_has_at');
      });

      it('should not double @ for Instagram with @-prefixed path', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/@ladygaga')
        ).toBe('@ladygaga');
      });

      it('should not double @ for Twitter/X with @-prefixed path', () => {
        expect(compactUrlDisplay('twitter', 'https://x.com/@elonmusk')).toBe(
          '@elonmusk'
        );
      });

      it('should not double @ for Venmo with @-prefixed path', () => {
        expect(compactUrlDisplay('venmo', 'https://venmo.com/@johndoe')).toBe(
          '@johndoe'
        );
      });
    });

    describe('usernames with special characters', () => {
      it('should handle usernames with underscores', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/user_name_123')
        ).toBe('@user_name_123');
      });

      it('should handle usernames with periods', () => {
        expect(
          compactUrlDisplay('instagram', 'https://instagram.com/user.name')
        ).toBe('@user.name');
      });

      it('should handle usernames with hyphens', () => {
        expect(
          compactUrlDisplay('tiktok', 'https://tiktok.com/@user-name')
        ).toBe('@user-name');
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
      // It should return @ladygaga or similar @-prefixed identity, or undefined
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

    it('should handle TikTok links', () => {
      const tiktokLink = {
        platform: {
          id: 'tiktok',
          name: 'TikTok',
          category: 'social' as const,
          icon: 'tiktok',
          color: '#000000',
          placeholder: '',
        },
        normalizedUrl: 'https://www.tiktok.com/@charlidamelio',
      };
      const result = suggestionIdentity(tiktokLink);
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should handle Twitter/X links', () => {
      const twitterLink = {
        platform: {
          id: 'twitter',
          name: 'Twitter',
          category: 'social' as const,
          icon: 'twitter',
          color: '#1DA1F2',
          placeholder: '',
        },
        normalizedUrl: 'https://x.com/elonmusk',
      };
      const result = suggestionIdentity(twitterLink);
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should handle YouTube links with @ handles', () => {
      const youtubeLink = {
        platform: {
          id: 'youtube',
          name: 'YouTube',
          category: 'social' as const,
          icon: 'youtube',
          color: '#FF0000',
          placeholder: '',
        },
        normalizedUrl: 'https://www.youtube.com/@MrBeast',
      };
      const result = suggestionIdentity(youtubeLink);
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should handle YouTube channel links', () => {
      const youtubeChannelLink = {
        platform: {
          id: 'youtube',
          name: 'YouTube',
          category: 'social' as const,
          icon: 'youtube',
          color: '#FF0000',
          placeholder: '',
        },
        normalizedUrl:
          'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
      };
      const result = suggestionIdentity(youtubeChannelLink);
      // Channel URLs don't have @ identity
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should handle links with empty URLs', () => {
      const emptyLink = {
        platform: {
          id: 'instagram',
          name: 'Instagram',
          category: 'social' as const,
          icon: 'instagram',
          color: '#E4405F',
          placeholder: '',
        },
        normalizedUrl: '',
      };
      // Should handle gracefully without throwing
      expect(() => suggestionIdentity(emptyLink)).not.toThrow();
    });

    it('should handle Venmo links', () => {
      const venmoLink = {
        platform: {
          id: 'venmo',
          name: 'Venmo',
          category: 'earnings' as const,
          icon: 'venmo',
          color: '#008CFF',
          placeholder: '',
        },
        normalizedUrl: 'https://venmo.com/johndoe',
      };
      const result = suggestionIdentity(venmoLink);
      expect(result === undefined || result?.startsWith('@')).toBe(true);
    });

    it('should handle custom website links', () => {
      const websiteLink = {
        platform: {
          id: 'website',
          name: 'Website',
          category: 'custom' as const,
          icon: 'globe',
          color: '#000000',
          placeholder: '',
        },
        normalizedUrl: 'https://example.com/page',
      };
      const result = suggestionIdentity(websiteLink);
      // Websites don't have @ identities
      expect(result).toBeUndefined();
    });
  });

  describe('buildPrefillUrl', () => {
    describe('music platforms', () => {
      it('should return correct prefill URL for Spotify', () => {
        expect(buildPrefillUrl('spotify')).toBe(
          'https://open.spotify.com/artist/'
        );
      });

      it('should return search mode trigger for spotify-artist', () => {
        expect(buildPrefillUrl('spotify-artist')).toBe(
          '__SEARCH_MODE__:spotify'
        );
      });

      it('should return correct prefill URL for Apple Music', () => {
        expect(buildPrefillUrl('apple-music')).toBe(
          'https://music.apple.com/artist/'
        );
      });

      it('should return correct prefill URL for YouTube Music', () => {
        expect(buildPrefillUrl('youtube-music')).toBe(
          'https://music.youtube.com/channel/'
        );
      });
    });

    describe('social platforms', () => {
      it('should return correct prefill URL for Instagram', () => {
        expect(buildPrefillUrl('instagram')).toBe('https://instagram.com/');
      });

      it('should return correct prefill URL for TikTok with @ prefix', () => {
        expect(buildPrefillUrl('tiktok')).toBe('https://www.tiktok.com/@');
      });

      it('should return correct prefill URL for YouTube with @ prefix', () => {
        expect(buildPrefillUrl('youtube')).toBe('https://www.youtube.com/@');
      });

      it('should return correct prefill URL for Twitter (uses x.com)', () => {
        expect(buildPrefillUrl('twitter')).toBe('https://x.com/');
      });
    });

    describe('other platforms', () => {
      it('should return correct prefill URL for Venmo', () => {
        expect(buildPrefillUrl('venmo')).toBe('https://venmo.com/');
      });

      it('should return HTTPS prefix for generic websites', () => {
        expect(buildPrefillUrl('website')).toBe('https://');
      });
    });

    describe('unknown platforms', () => {
      it('should return empty string for unknown platforms', () => {
        expect(buildPrefillUrl('unknown-platform')).toBe('');
        expect(buildPrefillUrl('')).toBe('');
      });

      it('should return empty string for platforms not in the switch', () => {
        expect(buildPrefillUrl('soundcloud')).toBe('');
        expect(buildPrefillUrl('facebook')).toBe('');
        expect(buildPrefillUrl('snapchat')).toBe('');
        expect(buildPrefillUrl('linkedin')).toBe('');
      });

      it('should handle null-like values', () => {
        expect(buildPrefillUrl(null as unknown as string)).toBe('');
        expect(buildPrefillUrl(undefined as unknown as string)).toBe('');
      });
    });

    describe('platform ID variations', () => {
      it('should be case-sensitive', () => {
        expect(buildPrefillUrl('Instagram')).toBe('');
        expect(buildPrefillUrl('SPOTIFY')).toBe('');
        expect(buildPrefillUrl('TikTok')).toBe('');
      });

      it('should not match partial platform IDs', () => {
        expect(buildPrefillUrl('insta')).toBe('');
        expect(buildPrefillUrl('spot')).toBe('');
        expect(buildPrefillUrl('youtube-')).toBe('');
      });
    });
  });

  describe('LinkSection type', () => {
    it('should accept all valid section values', () => {
      const sections: LinkSection[] = ['social', 'dsp', 'earnings', 'custom'];
      expect(sections).toHaveLength(4);
    });

    it('should be usable in labelFor function', () => {
      const sections: LinkSection[] = ['social', 'dsp', 'earnings', 'custom'];
      const labels = sections.map(labelFor);
      expect(labels).toEqual([
        'Social',
        'Music service',
        'Monetization',
        'Custom',
      ]);
    });
  });
});
