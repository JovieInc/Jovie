import { describe, expect, it } from 'vitest';

import { sanitizeRedirectUrl } from '@/lib/auth/constants';

describe('sanitizeRedirectUrl', () => {
  describe('valid redirect URLs', () => {
    it('should accept valid relative paths', () => {
      expect(sanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(sanitizeRedirectUrl('/onboarding')).toBe('/onboarding');
      expect(sanitizeRedirectUrl('/settings/profile')).toBe(
        '/settings/profile'
      );
    });

    it('should accept paths with query parameters', () => {
      expect(sanitizeRedirectUrl('/dashboard?tab=overview')).toBe(
        '/dashboard?tab=overview'
      );
      expect(sanitizeRedirectUrl('/onboarding?handle=test')).toBe(
        '/onboarding?handle=test'
      );
    });

    it('should preserve complex query strings', () => {
      expect(sanitizeRedirectUrl('/search?q=test&page=2&sort=asc')).toBe(
        '/search?q=test&page=2&sort=asc'
      );
    });
  });

  describe('invalid redirect URLs', () => {
    it('should return null for null/undefined inputs', () => {
      expect(sanitizeRedirectUrl(null)).toBeNull();
      expect(sanitizeRedirectUrl(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(sanitizeRedirectUrl('')).toBeNull();
    });

    it('should reject protocol-relative URLs (security risk)', () => {
      expect(sanitizeRedirectUrl('//evil.com')).toBeNull();
      expect(sanitizeRedirectUrl('//evil.com/path')).toBeNull();
    });

    it('should reject absolute URLs', () => {
      expect(sanitizeRedirectUrl('https://evil.com')).toBeNull();
      expect(sanitizeRedirectUrl('http://evil.com/path')).toBeNull();
      expect(sanitizeRedirectUrl('ftp://server.com')).toBeNull();
    });

    it('should reject URLs not starting with /', () => {
      expect(sanitizeRedirectUrl('dashboard')).toBeNull();
      expect(sanitizeRedirectUrl('../')).toBeNull();
      expect(sanitizeRedirectUrl('path/to/page')).toBeNull();
    });

    it('should return null for root path only', () => {
      expect(sanitizeRedirectUrl('/')).toBeNull();
    });
  });

  describe('hash fragment stripping (PR #2146 fix)', () => {
    it('should strip hash fragments from URLs', () => {
      expect(sanitizeRedirectUrl('/dashboard#section')).toBe('/dashboard');
      expect(sanitizeRedirectUrl('/settings#privacy')).toBe('/settings');
    });

    it('should handle the specific bug case: /signin#/reset-password', () => {
      // This was the actual bug - hash fragments causing malformed redirects
      expect(sanitizeRedirectUrl('/signin#/reset-password')).toBe('/signin');
      expect(sanitizeRedirectUrl('/signup#/verify')).toBe('/signup');
    });

    it('should preserve query params but strip hash', () => {
      expect(sanitizeRedirectUrl('/dashboard?tab=settings#anchor')).toBe(
        '/dashboard?tab=settings'
      );
      expect(sanitizeRedirectUrl('/page?foo=bar&baz=qux#section')).toBe(
        '/page?foo=bar&baz=qux'
      );
    });

    it('should return null if only hash fragment remains after path', () => {
      // Edge case: path is just "/" followed by hash
      expect(sanitizeRedirectUrl('/#hash')).toBeNull();
    });

    it('should handle multiple hash symbols (only first matters)', () => {
      expect(sanitizeRedirectUrl('/path#hash1#hash2')).toBe('/path');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with special characters', () => {
      expect(sanitizeRedirectUrl('/user/@username')).toBe('/user/@username');
      expect(sanitizeRedirectUrl('/search?q=hello%20world')).toBe(
        '/search?q=hello%20world'
      );
    });

    it('should handle very long paths', () => {
      const longPath = '/a'.repeat(500);
      expect(sanitizeRedirectUrl(longPath)).toBe(longPath);
    });

    it('should handle paths with unicode characters', () => {
      expect(sanitizeRedirectUrl('/user/名前')).toBe('/user/名前');
    });

    it('should not modify paths without hash fragments', () => {
      const path = '/dashboard/analytics?period=30d&metric=views';
      expect(sanitizeRedirectUrl(path)).toBe(path);
    });
  });
});
