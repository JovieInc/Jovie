import { describe, expect, it } from 'vitest';
import {
  CROSS_CATEGORY,
  canMoveTo,
  groupLinks,
  type LinkSection,
  sectionOf,
} from '@/components/dashboard/organisms/links/utils/link-categorization';
import { type DetectedLink } from '@/lib/utils/platform-detection';

// Helper to create a mock DetectedLink
function createMockLink(
  platformId: string,
  category: 'social' | 'dsp' | 'earnings' | 'websites' | 'custom' = 'custom',
  normalizedUrl = 'https://example.com'
): DetectedLink {
  return {
    platform: {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      category,
      icon: platformId,
      color: '#000000',
      placeholder: '',
    },
    normalizedUrl,
    originalUrl: normalizedUrl,
    isValid: true,
  };
}

describe('link-categorization', () => {
  describe('CROSS_CATEGORY', () => {
    it('should define YouTube as cross-category for social and dsp', () => {
      expect(CROSS_CATEGORY.youtube).toEqual(['social', 'dsp']);
    });

    it('should not have any other platforms defined by default', () => {
      const keys = Object.keys(CROSS_CATEGORY);
      expect(keys).toEqual(['youtube']);
    });
  });

  describe('sectionOf', () => {
    it('should return social for social category links', () => {
      const link = createMockLink('instagram', 'social');
      expect(sectionOf(link)).toBe('social');
    });

    it('should return dsp for dsp category links', () => {
      const link = createMockLink('spotify', 'dsp');
      expect(sectionOf(link)).toBe('dsp');
    });

    it('should return earnings for earnings category links', () => {
      const link = createMockLink('venmo', 'earnings');
      expect(sectionOf(link)).toBe('earnings');
    });

    it('should return custom for websites category links', () => {
      const link = createMockLink('website', 'websites');
      expect(sectionOf(link)).toBe('custom');
    });

    it('should return custom for custom category links', () => {
      const link = createMockLink('mysite', 'custom');
      expect(sectionOf(link)).toBe('custom');
    });

    it('should return custom when category is undefined', () => {
      const link = createMockLink('unknown');
      // Remove category to simulate undefined
      (link.platform as { category?: string }).category = undefined;
      expect(sectionOf(link)).toBe('custom');
    });
  });

  describe('canMoveTo', () => {
    describe('same section moves', () => {
      it('should allow moving within the same section', () => {
        const socialLink = createMockLink('instagram', 'social');
        expect(canMoveTo(socialLink, 'social')).toBe(true);

        const dspLink = createMockLink('spotify', 'dsp');
        expect(canMoveTo(dspLink, 'dsp')).toBe(true);

        const earningsLink = createMockLink('venmo', 'earnings');
        expect(canMoveTo(earningsLink, 'earnings')).toBe(true);

        const customLink = createMockLink('website', 'custom');
        expect(canMoveTo(customLink, 'custom')).toBe(true);
      });
    });

    describe('cross-category moves for YouTube', () => {
      it('should allow YouTube to move from social to dsp', () => {
        const youtubeLink = createMockLink('youtube', 'social');
        expect(canMoveTo(youtubeLink, 'dsp')).toBe(true);
      });

      it('should allow YouTube to move from dsp to social', () => {
        const youtubeLink = createMockLink('youtube', 'dsp');
        expect(canMoveTo(youtubeLink, 'social')).toBe(true);
      });

      it('should not allow YouTube to move to earnings', () => {
        const youtubeLink = createMockLink('youtube', 'social');
        expect(canMoveTo(youtubeLink, 'earnings')).toBe(false);
      });

      it('should not allow YouTube to move to custom', () => {
        const youtubeLink = createMockLink('youtube', 'social');
        expect(canMoveTo(youtubeLink, 'custom')).toBe(false);
      });
    });

    describe('non-cross-category platforms', () => {
      it('should not allow Instagram to move from social to dsp', () => {
        const instagramLink = createMockLink('instagram', 'social');
        expect(canMoveTo(instagramLink, 'dsp')).toBe(false);
      });

      it('should not allow Spotify to move from dsp to social', () => {
        const spotifyLink = createMockLink('spotify', 'dsp');
        expect(canMoveTo(spotifyLink, 'social')).toBe(false);
      });

      it('should not allow Venmo to move from earnings to social', () => {
        const venmoLink = createMockLink('venmo', 'earnings');
        expect(canMoveTo(venmoLink, 'social')).toBe(false);
      });
    });
  });

  describe('groupLinks', () => {
    it('should return empty arrays for all sections when given empty array', () => {
      const result = groupLinks([]);
      expect(result).toEqual({
        social: [],
        dsp: [],
        earnings: [],
        custom: [],
      });
    });

    it('should group social links correctly', () => {
      const links = [
        createMockLink('instagram', 'social'),
        createMockLink('twitter', 'social'),
      ];
      const result = groupLinks(links);
      expect(result.social).toHaveLength(2);
      expect(result.social[0].platform.id).toBe('instagram');
      expect(result.social[1].platform.id).toBe('twitter');
    });

    it('should group dsp links correctly', () => {
      const links = [
        createMockLink('spotify', 'dsp'),
        createMockLink('apple-music', 'dsp'),
      ];
      const result = groupLinks(links);
      expect(result.dsp).toHaveLength(2);
      expect(result.dsp[0].platform.id).toBe('spotify');
      expect(result.dsp[1].platform.id).toBe('apple-music');
    });

    it('should group earnings links correctly', () => {
      const links = [createMockLink('venmo', 'earnings')];
      const result = groupLinks(links);
      expect(result.earnings).toHaveLength(1);
      expect(result.earnings[0].platform.id).toBe('venmo');
    });

    it('should group custom/website links correctly', () => {
      const links = [
        createMockLink('website', 'websites'),
        createMockLink('custom-link', 'custom'),
      ];
      const result = groupLinks(links);
      expect(result.custom).toHaveLength(2);
    });

    it('should handle links with undefined category as custom', () => {
      const link = createMockLink('unknown');
      (link.platform as { category?: string }).category = undefined;
      const result = groupLinks([link]);
      expect(result.custom).toHaveLength(1);
      expect(result.social).toHaveLength(0);
      expect(result.dsp).toHaveLength(0);
      expect(result.earnings).toHaveLength(0);
    });

    it('should group mixed links correctly', () => {
      const links = [
        createMockLink('instagram', 'social'),
        createMockLink('spotify', 'dsp'),
        createMockLink('venmo', 'earnings'),
        createMockLink('website', 'websites'),
        createMockLink('twitter', 'social'),
        createMockLink('apple-music', 'dsp'),
      ];
      const result = groupLinks(links);

      expect(result.social).toHaveLength(2);
      expect(result.dsp).toHaveLength(2);
      expect(result.earnings).toHaveLength(1);
      expect(result.custom).toHaveLength(1);
    });

    it('should preserve original order within each group', () => {
      const links = [
        createMockLink('instagram', 'social', 'https://instagram.com/first'),
        createMockLink('spotify', 'dsp', 'https://spotify.com/first'),
        createMockLink('twitter', 'social', 'https://twitter.com/second'),
        createMockLink('apple-music', 'dsp', 'https://apple.com/second'),
        createMockLink('tiktok', 'social', 'https://tiktok.com/third'),
      ];
      const result = groupLinks(links);

      // Check that social links are in original order
      expect(result.social[0].normalizedUrl).toBe(
        'https://instagram.com/first'
      );
      expect(result.social[1].normalizedUrl).toBe('https://twitter.com/second');
      expect(result.social[2].normalizedUrl).toBe('https://tiktok.com/third');

      // Check that dsp links are in original order
      expect(result.dsp[0].normalizedUrl).toBe('https://spotify.com/first');
      expect(result.dsp[1].normalizedUrl).toBe('https://apple.com/second');
    });
  });

  describe('LinkSection type', () => {
    it('should accept valid section values', () => {
      const sections: LinkSection[] = ['social', 'dsp', 'earnings', 'custom'];
      expect(sections).toHaveLength(4);
    });
  });
});
