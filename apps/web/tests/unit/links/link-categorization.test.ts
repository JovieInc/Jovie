import { describe, expect, it } from 'vitest';
import {
  CROSS_CATEGORY,
  canMoveTo,
  groupLinks,
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
    suggestedTitle: platformId.charAt(0).toUpperCase() + platformId.slice(1),
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

    it('should be a Record type with correct structure', () => {
      expect(typeof CROSS_CATEGORY).toBe('object');
      expect(Array.isArray(CROSS_CATEGORY.youtube)).toBe(true);
    });

    it('should not include earnings or custom in YouTube cross-category', () => {
      expect(CROSS_CATEGORY.youtube).not.toContain('earnings');
      expect(CROSS_CATEGORY.youtube).not.toContain('custom');
      expect(CROSS_CATEGORY.youtube).not.toContain('websites');
    });
  });

  describe('sectionOf', () => {
    describe('standard categories', () => {
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
    });

    describe('edge cases', () => {
      it('should return custom when category is undefined', () => {
        const link = createMockLink('unknown');
        // Remove category to simulate undefined
        (link.platform as { category?: string }).category = undefined;
        expect(sectionOf(link)).toBe('custom');
      });

      it('should return custom when category is null', () => {
        const link = createMockLink('unknown');
        (link.platform as { category?: string | null }).category = null;
        expect(sectionOf(link)).toBe('custom');
      });

      it('should return custom for unknown category values', () => {
        const link = createMockLink('unknown');
        (link.platform as { category?: string }).category =
          'some-unknown-category';
        expect(sectionOf(link)).toBe('custom');
      });
    });

    describe('platform-specific tests', () => {
      it('should correctly categorize Instagram', () => {
        const link = createMockLink('instagram', 'social');
        expect(sectionOf(link)).toBe('social');
      });

      it('should correctly categorize TikTok', () => {
        const link = createMockLink('tiktok', 'social');
        expect(sectionOf(link)).toBe('social');
      });

      it('should correctly categorize Twitter/X', () => {
        const link = createMockLink('twitter', 'social');
        expect(sectionOf(link)).toBe('social');
      });

      it('should correctly categorize YouTube as social', () => {
        const link = createMockLink('youtube', 'social');
        expect(sectionOf(link)).toBe('social');
      });

      it('should correctly categorize YouTube as dsp', () => {
        const link = createMockLink('youtube', 'dsp');
        expect(sectionOf(link)).toBe('dsp');
      });

      it('should correctly categorize Spotify', () => {
        const link = createMockLink('spotify', 'dsp');
        expect(sectionOf(link)).toBe('dsp');
      });

      it('should correctly categorize Apple Music', () => {
        const link = createMockLink('apple-music', 'dsp');
        expect(sectionOf(link)).toBe('dsp');
      });

      it('should correctly categorize Venmo as earnings', () => {
        const link = createMockLink('venmo', 'earnings');
        expect(sectionOf(link)).toBe('earnings');
      });
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

      it('should allow YouTube to stay in social', () => {
        const youtubeLink = createMockLink('youtube', 'social');
        expect(canMoveTo(youtubeLink, 'social')).toBe(true);
      });

      it('should allow YouTube to stay in dsp', () => {
        const youtubeLink = createMockLink('youtube', 'dsp');
        expect(canMoveTo(youtubeLink, 'dsp')).toBe(true);
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

      it('should not allow YouTube to move from dsp to earnings', () => {
        const youtubeLink = createMockLink('youtube', 'dsp');
        expect(canMoveTo(youtubeLink, 'earnings')).toBe(false);
      });

      it('should not allow YouTube to move from dsp to custom', () => {
        const youtubeLink = createMockLink('youtube', 'dsp');
        expect(canMoveTo(youtubeLink, 'custom')).toBe(false);
      });
    });

    describe('non-cross-category platforms', () => {
      it('should not allow Instagram to move from social to dsp', () => {
        const instagramLink = createMockLink('instagram', 'social');
        expect(canMoveTo(instagramLink, 'dsp')).toBe(false);
      });

      it('should not allow Instagram to move from social to earnings', () => {
        const instagramLink = createMockLink('instagram', 'social');
        expect(canMoveTo(instagramLink, 'earnings')).toBe(false);
      });

      it('should not allow Instagram to move from social to custom', () => {
        const instagramLink = createMockLink('instagram', 'social');
        expect(canMoveTo(instagramLink, 'custom')).toBe(false);
      });

      it('should not allow Spotify to move from dsp to social', () => {
        const spotifyLink = createMockLink('spotify', 'dsp');
        expect(canMoveTo(spotifyLink, 'social')).toBe(false);
      });

      it('should not allow Spotify to move from dsp to earnings', () => {
        const spotifyLink = createMockLink('spotify', 'dsp');
        expect(canMoveTo(spotifyLink, 'earnings')).toBe(false);
      });

      it('should not allow Spotify to move from dsp to custom', () => {
        const spotifyLink = createMockLink('spotify', 'dsp');
        expect(canMoveTo(spotifyLink, 'custom')).toBe(false);
      });

      it('should not allow Venmo to move from earnings to social', () => {
        const venmoLink = createMockLink('venmo', 'earnings');
        expect(canMoveTo(venmoLink, 'social')).toBe(false);
      });

      it('should not allow Venmo to move from earnings to dsp', () => {
        const venmoLink = createMockLink('venmo', 'earnings');
        expect(canMoveTo(venmoLink, 'dsp')).toBe(false);
      });

      it('should not allow Venmo to move from earnings to custom', () => {
        const venmoLink = createMockLink('venmo', 'earnings');
        expect(canMoveTo(venmoLink, 'custom')).toBe(false);
      });

      it('should not allow custom links to move to other sections', () => {
        const websiteLink = createMockLink('website', 'custom');
        expect(canMoveTo(websiteLink, 'social')).toBe(false);
        expect(canMoveTo(websiteLink, 'dsp')).toBe(false);
        expect(canMoveTo(websiteLink, 'earnings')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle platforms not in CROSS_CATEGORY gracefully', () => {
        const unknownLink = createMockLink('unknown-platform', 'social');
        expect(canMoveTo(unknownLink, 'dsp')).toBe(false);
        expect(canMoveTo(unknownLink, 'social')).toBe(true);
      });

      it('should handle links with websites category', () => {
        const websiteLink = createMockLink('website', 'websites');
        expect(canMoveTo(websiteLink, 'custom')).toBe(true); // Same section (websites -> custom)
        expect(canMoveTo(websiteLink, 'social')).toBe(false);
      });
    });
  });

  describe('groupLinks', () => {
    describe('empty and single link cases', () => {
      it('should return empty arrays for all sections when given empty array', () => {
        const result = groupLinks([]);
        expect(result).toEqual({
          social: [],
          dsp: [],
          earnings: [],
          custom: [],
        });
      });

      it('should group a single social link correctly', () => {
        const link = createMockLink('instagram', 'social');
        const result = groupLinks([link]);
        expect(result.social).toHaveLength(1);
        expect(result.dsp).toHaveLength(0);
        expect(result.earnings).toHaveLength(0);
        expect(result.custom).toHaveLength(0);
      });

      it('should group a single dsp link correctly', () => {
        const link = createMockLink('spotify', 'dsp');
        const result = groupLinks([link]);
        expect(result.social).toHaveLength(0);
        expect(result.dsp).toHaveLength(1);
        expect(result.earnings).toHaveLength(0);
        expect(result.custom).toHaveLength(0);
      });

      it('should group a single earnings link correctly', () => {
        const link = createMockLink('venmo', 'earnings');
        const result = groupLinks([link]);
        expect(result.social).toHaveLength(0);
        expect(result.dsp).toHaveLength(0);
        expect(result.earnings).toHaveLength(1);
        expect(result.custom).toHaveLength(0);
      });

      it('should group a single custom link correctly', () => {
        const link = createMockLink('website', 'custom');
        const result = groupLinks([link]);
        expect(result.social).toHaveLength(0);
        expect(result.dsp).toHaveLength(0);
        expect(result.earnings).toHaveLength(0);
        expect(result.custom).toHaveLength(1);
      });
    });

    describe('multiple links per section', () => {
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
    });

    describe('edge cases', () => {
      it('should handle links with undefined category as custom', () => {
        const link = createMockLink('unknown');
        (link.platform as { category?: string }).category = undefined;
        const result = groupLinks([link]);
        expect(result.custom).toHaveLength(1);
        expect(result.social).toHaveLength(0);
        expect(result.dsp).toHaveLength(0);
        expect(result.earnings).toHaveLength(0);
      });

      it('should handle links with unknown category as custom', () => {
        const link = createMockLink('unknown');
        (link.platform as { category?: string }).category =
          'some-unknown-category';
        const result = groupLinks([link]);
        expect(result.custom).toHaveLength(1);
      });

      it('should handle links with null category as custom', () => {
        const link = createMockLink('unknown');
        (link.platform as { category?: string | null }).category = null;
        const result = groupLinks([link]);
        expect(result.custom).toHaveLength(1);
      });
    });

    describe('mixed links', () => {
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

      it('should maintain insertion order within sections', () => {
        const links = [
          createMockLink('twitter', 'social'),
          createMockLink('instagram', 'social'),
          createMockLink('tiktok', 'social'),
        ];
        const result = groupLinks(links);
        expect(result.social[0].platform.id).toBe('twitter');
        expect(result.social[1].platform.id).toBe('instagram');
        expect(result.social[2].platform.id).toBe('tiktok');
      });
    });
  });
});
