import { describe, it, expect } from 'vitest';
import { 
  getIconByName, 
  getSocialIconByPlatform, 
  searchIcons, 
  getIconsByCategory,
  iconRegistry,
  socialIconRegistry,
} from '@/lib/icons/registry';

describe('Icon Registry', () => {
  describe('getIconByName', () => {
    it('should return icon entry for valid icon name', () => {
      const icon = getIconByName('chevron-right');
      expect(icon).toBeDefined();
      expect(icon?.name).toBe('chevron-right');
      expect(icon?.category).toBe('navigation');
      expect(icon?.component).toBeDefined();
    });

    it('should return undefined for invalid icon name', () => {
      const icon = getIconByName('non-existent-icon');
      expect(icon).toBeUndefined();
    });

    it('should have all required properties for registered icons', () => {
      const icon = getIconByName('check');
      expect(icon).toMatchObject({
        name: 'check',
        category: expect.any(String),
        component: expect.any(Function),
        description: expect.any(String),
      });
    });
  });

  describe('getSocialIconByPlatform', () => {
    it('should return social icon entry for valid platform', () => {
      const socialIcon = getSocialIconByPlatform('spotify');
      expect(socialIcon).toBeDefined();
      expect(socialIcon?.platform).toBe('spotify');
      expect(socialIcon?.name).toBe('Spotify');
      expect(socialIcon?.category).toBe('brand');
    });

    it('should return undefined for invalid platform', () => {
      const socialIcon = getSocialIconByPlatform('invalid-platform' as any);
      expect(socialIcon).toBeUndefined();
    });

    it('should support all major social platforms', () => {
      const platforms = ['instagram', 'twitter', 'tiktok', 'youtube', 'facebook'];
      platforms.forEach(platform => {
        const socialIcon = getSocialIconByPlatform(platform as any);
        expect(socialIcon).toBeDefined();
        expect(socialIcon?.category).toBe('social');
      });
    });

    it('should support all major music DSPs', () => {
      const dsps = ['spotify', 'applemusic', 'soundcloud', 'bandcamp'];
      dsps.forEach(dsp => {
        const socialIcon = getSocialIconByPlatform(dsp as any);
        expect(socialIcon).toBeDefined();
        expect(socialIcon?.category).toBe('brand');
      });
    });
  });

  describe('searchIcons', () => {
    it('should find icons by name', () => {
      const results = searchIcons('chevron');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(icon => icon.name.includes('chevron'))).toBe(true);
    });

    it('should find icons by description', () => {
      const results = searchIcons('navigation');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(icon => icon.description?.toLowerCase().includes('navigation'))).toBe(true);
    });

    it('should find icons by keywords', () => {
      const results = searchIcons('arrow');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(icon => icon.keywords?.includes('arrow'))).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = searchIcons('xyz-nonexistent-term');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const lowerResults = searchIcons('chevron');
      const upperResults = searchIcons('CHEVRON');
      expect(lowerResults).toEqual(upperResults);
    });
  });

  describe('getIconsByCategory', () => {
    it('should return icons for valid category', () => {
      const navigationIcons = getIconsByCategory('navigation');
      expect(navigationIcons.length).toBeGreaterThan(0);
      expect(navigationIcons.every(icon => icon.category === 'navigation')).toBe(true);
    });

    it('should return empty array for invalid category', () => {
      const results = getIconsByCategory('invalid-category');
      expect(results).toEqual([]);
    });

    it('should have icons in all expected categories', () => {
      const categories = ['navigation', 'action', 'state'];
      categories.forEach(category => {
        const icons = getIconsByCategory(category);
        expect(icons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Registry Completeness', () => {
    it('should have navigation icons', () => {
      const requiredNavIcons = ['chevron-right', 'chevron-left', 'home', 'menu'];
      requiredNavIcons.forEach(iconName => {
        const icon = getIconByName(iconName);
        expect(icon).toBeDefined();
        expect(icon?.category).toBe('navigation');
      });
    });

    it('should have action icons', () => {
      const requiredActionIcons = ['plus', 'x-mark', 'pencil', 'trash', 'search', 'settings'];
      requiredActionIcons.forEach(iconName => {
        const icon = getIconByName(iconName);
        expect(icon).toBeDefined();
        expect(icon?.category).toBe('action');
      });
    });

    it('should have state icons', () => {
      const requiredStateIcons = ['check', 'check-circle', 'x-circle', 'warning', 'info'];
      requiredStateIcons.forEach(iconName => {
        const icon = getIconByName(iconName);
        expect(icon).toBeDefined();
        expect(icon?.category).toBe('state');
      });
    });

    it('should have all social platforms in registry', () => {
      const requiredPlatforms = ['instagram', 'twitter', 'tiktok', 'youtube', 'spotify'];
      requiredPlatforms.forEach(platform => {
        const socialIcon = getSocialIconByPlatform(platform as any);
        expect(socialIcon).toBeDefined();
      });
    });
  });

  describe('Registry Structure', () => {
    it('should have consistent icon entry structure', () => {
      Object.values(iconRegistry).forEach(icon => {
        expect(icon).toMatchObject({
          name: expect.any(String),
          category: expect.any(String),
          component: expect.any(Function),
          description: expect.any(String),
        });
        
        if (icon.keywords) {
          expect(Array.isArray(icon.keywords)).toBe(true);
        }
      });
    });

    it('should have consistent social icon entry structure', () => {
      Object.values(socialIconRegistry).forEach(socialIcon => {
        expect(socialIcon).toMatchObject({
          platform: expect.any(String),
          name: expect.any(String),
          category: expect.stringMatching(/^(social|brand)$/),
        });
        
        if (socialIcon.description) {
          expect(typeof socialIcon.description).toBe('string');
        }
      });
    });

    it('should have unique icon names', () => {
      const names = Object.values(iconRegistry).map(icon => icon.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should have unique social platforms', () => {
      const platforms = Object.values(socialIconRegistry).map(icon => icon.platform);
      const uniquePlatforms = new Set(platforms);
      expect(platforms.length).toBe(uniquePlatforms.size);
    });
  });
});

