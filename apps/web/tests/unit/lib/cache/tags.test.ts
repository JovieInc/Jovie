/**
 * Cache Tags Tests
 *
 * Tests for cache tag constants and helper functions.
 */

import { describe, expect, it } from 'vitest';
import {
  CACHE_TAGS,
  CACHE_TTL,
  type CacheTag,
  type CacheTTL,
  createAvatarTag,
  createProfileTag,
  createSocialLinksTag,
} from '@/lib/cache/tags';

describe('Cache Tags', () => {
  describe('CACHE_TAGS', () => {
    it('should have PUBLIC_PROFILE tag', () => {
      expect(CACHE_TAGS.PUBLIC_PROFILE).toBe('public-profile');
    });

    it('should have DASHBOARD_DATA tag', () => {
      expect(CACHE_TAGS.DASHBOARD_DATA).toBe('dashboard-data');
    });

    it('should have FEATURED_CREATORS tag', () => {
      expect(CACHE_TAGS.FEATURED_CREATORS).toBe('featured-creators');
    });

    it('should have BILLING_DATA tag', () => {
      expect(CACHE_TAGS.BILLING_DATA).toBe('billing-data');
    });

    it('should have all expected tags', () => {
      const expectedTags = [
        'PUBLIC_PROFILE',
        'DASHBOARD_DATA',
        'FEATURED_CREATORS',
        'BILLING_DATA',
      ];

      for (const tag of expectedTags) {
        expect(CACHE_TAGS).toHaveProperty(tag);
      }
    });

    it('should have unique tag values', () => {
      const values = Object.values(CACHE_TAGS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have lowercase kebab-case tag values', () => {
      for (const value of Object.values(CACHE_TAGS)) {
        expect(value).toMatch(/^[a-z-]+$/);
      }
    });
  });

  describe('CACHE_TTL', () => {
    it('should have INSTANT TTL of 5 seconds', () => {
      expect(CACHE_TTL.INSTANT).toBe(5);
    });

    it('should have SHORT TTL of 1 minute', () => {
      expect(CACHE_TTL.SHORT).toBe(60);
    });

    it('should have MEDIUM TTL of 5 minutes', () => {
      expect(CACHE_TTL.MEDIUM).toBe(5 * 60);
    });

    it('should have LONG TTL of 1 hour', () => {
      expect(CACHE_TTL.LONG).toBe(60 * 60);
    });

    it('should have DAY TTL of 24 hours', () => {
      expect(CACHE_TTL.DAY).toBe(24 * 60 * 60);
    });

    it('should have WEEK TTL of 7 days', () => {
      expect(CACHE_TTL.WEEK).toBe(7 * 24 * 60 * 60);
    });

    it('should have TTLs in increasing order', () => {
      expect(CACHE_TTL.INSTANT).toBeLessThan(CACHE_TTL.SHORT);
      expect(CACHE_TTL.SHORT).toBeLessThan(CACHE_TTL.MEDIUM);
      expect(CACHE_TTL.MEDIUM).toBeLessThan(CACHE_TTL.LONG);
      expect(CACHE_TTL.LONG).toBeLessThan(CACHE_TTL.DAY);
      expect(CACHE_TTL.DAY).toBeLessThan(CACHE_TTL.WEEK);
    });

    it('should have all TTLs be positive integers', () => {
      for (const ttl of Object.values(CACHE_TTL)) {
        expect(Number.isInteger(ttl)).toBe(true);
        expect(ttl).toBeGreaterThan(0);
      }
    });
  });

  describe('createProfileTag', () => {
    it('should create tag with username', () => {
      const tag = createProfileTag('johndoe');
      expect(tag).toBe('public-profile:johndoe');
    });

    it('should preserve username case', () => {
      const tag = createProfileTag('JohnDoe');
      expect(tag).toBe('public-profile:JohnDoe');
    });

    it('should handle usernames with special characters', () => {
      const tag = createProfileTag('user_123');
      expect(tag).toBe('public-profile:user_123');
    });

    it('should handle empty string', () => {
      const tag = createProfileTag('');
      expect(tag).toBe('public-profile:');
    });

    it('should create unique tags for different usernames', () => {
      const tag1 = createProfileTag('user1');
      const tag2 = createProfileTag('user2');
      expect(tag1).not.toBe(tag2);
    });
  });

  describe('createSocialLinksTag', () => {
    it('should create tag with profile ID', () => {
      const tag = createSocialLinksTag('profile-123');
      expect(tag).toBe('social-links:profile-123');
    });

    it('should handle UUID format', () => {
      const tag = createSocialLinksTag('550e8400-e29b-41d4-a716-446655440000');
      expect(tag).toBe('social-links:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should create unique tags for different profile IDs', () => {
      const tag1 = createSocialLinksTag('id1');
      const tag2 = createSocialLinksTag('id2');
      expect(tag1).not.toBe(tag2);
    });
  });

  describe('createAvatarTag', () => {
    it('should create tag with user ID', () => {
      const tag = createAvatarTag('user-123');
      expect(tag).toBe('avatar:user-123');
    });

    it('should handle clerk ID format', () => {
      const tag = createAvatarTag('user_2NNEqL2nrIRdJ194ndJqAHwEfxC');
      expect(tag).toBe('avatar:user_2NNEqL2nrIRdJ194ndJqAHwEfxC');
    });

    it('should handle UUID format', () => {
      const tag = createAvatarTag('550e8400-e29b-41d4-a716-446655440000');
      expect(tag).toBe('avatar:550e8400-e29b-41d4-a716-446655440000');
    });

    it('should create unique tags for different user IDs', () => {
      const tag1 = createAvatarTag('user1');
      const tag2 = createAvatarTag('user2');
      expect(tag1).not.toBe(tag2);
    });
  });

  describe('type safety', () => {
    it('should allow CacheTag type for tag values', () => {
      // Type-level test - these should compile without errors
      const profileTag: CacheTag = 'public-profile';
      const dashboardTag: CacheTag = 'dashboard-data';

      expect(profileTag).toBe(CACHE_TAGS.PUBLIC_PROFILE);
      expect(dashboardTag).toBe(CACHE_TAGS.DASHBOARD_DATA);
    });

    it('should allow CacheTTL type for TTL values', () => {
      // Type-level test - these should compile without errors
      const shortTTL: CacheTTL = 60;
      const longTTL: CacheTTL = 3600;

      expect(shortTTL).toBe(CACHE_TTL.SHORT);
      expect(longTTL).toBe(CACHE_TTL.LONG);
    });
  });

  describe('tag format consistency', () => {
    it('should use colon as separator in parameterized tags', () => {
      expect(createProfileTag('test')).toContain(':');
      expect(createSocialLinksTag('test')).toContain(':');
      expect(createAvatarTag('test')).toContain(':');
    });

    it('should have consistent prefix format', () => {
      expect(createProfileTag('x')).toMatch(/^public-profile:/);
      expect(createSocialLinksTag('x')).toMatch(/^social-links:/);
      expect(createAvatarTag('x')).toMatch(/^avatar:/);
    });
  });
});
