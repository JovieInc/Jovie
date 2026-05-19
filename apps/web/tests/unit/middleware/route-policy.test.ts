/**
 * Direct unit tests for the route-policy logic extracted to proxy-routing.ts
 * (single module owning classification, public-profile candidate detection,
 * rewrite exemptions, and APP_ROUTES-derived reserved segments).
 *
 * These tests assert the classification bugfix: /start, /pricing, /about,
 * /investors etc NEVER trigger the public-profile audience block DB path.
 */
import { describe, expect, it } from 'vitest';
import {
  categorizePath,
  getPublicProfileCandidate,
  isProxyRewriteExempt,
  isPublicProfileAudienceBlockCandidate,
} from '@/lib/routing/proxy-routing';

describe('route-policy (proxy-routing)', () => {
  describe('public profile candidate classification (bugfix)', () => {
    it('returns null for /start, /pricing, /about, /investors (never enter DB block lookup)', () => {
      expect(getPublicProfileCandidate('/start')).toBeNull();
      expect(isPublicProfileAudienceBlockCandidate('/start')).toBe(false);

      expect(getPublicProfileCandidate('/pricing')).toBeNull();
      expect(isPublicProfileAudienceBlockCandidate('/pricing')).toBe(false);

      expect(getPublicProfileCandidate('/about')).toBeNull();
      expect(isPublicProfileAudienceBlockCandidate('/about')).toBe(false);

      expect(getPublicProfileCandidate('/investors')).toBeNull();
      expect(isPublicProfileAudienceBlockCandidate('/investors')).toBe(false);
    });

    it('returns null for other reserved APP_ROUTES and system segments', () => {
      expect(getPublicProfileCandidate('/app')).toBeNull();
      expect(getPublicProfileCandidate('/waitlist')).toBeNull();
      expect(getPublicProfileCandidate('/onboarding')).toBeNull();
      expect(getPublicProfileCandidate('/signin')).toBeNull();
      expect(getPublicProfileCandidate('/sign-up')).toBeNull();
      expect(getPublicProfileCandidate('/_next/static')).toBeNull(); // multi but first seg
      expect(getPublicProfileCandidate('/__clerk')).toBeNull();
      expect(getPublicProfileCandidate('/api/foo')).toBeNull();
    });

    it('returns the username for valid single-segment profile-shaped paths', () => {
      expect(getPublicProfileCandidate('/tim')).toBe('tim');
      expect(getPublicProfileCandidate('/joviewhite')).toBe('joviewhite');
      expect(getPublicProfileCandidate('/user_123')).toBe('user_123');
      expect(getPublicProfileCandidate('/a.b-c')).toBe('a.b-c');
    });

    it('rejects too-short or invalid usernames', () => {
      expect(getPublicProfileCandidate('/ab')).toBeNull();
      expect(getPublicProfileCandidate('/a')).toBeNull();
      expect(getPublicProfileCandidate('/user with space')).toBeNull();
    });
  });

  describe('categorizePath now owns publicProfileCandidate', () => {
    it('exposes publicProfileCandidate on the returned category', () => {
      const cat = categorizePath('/timwhite');
      expect(cat.publicProfileCandidate).toBe('timwhite');

      const catReserved = categorizePath('/start');
      expect(catReserved.publicProfileCandidate).toBeNull();
    });
  });

  describe('rewrite exemptions (owned by route-policy)', () => {
    it('exempts known paths', () => {
      expect(isProxyRewriteExempt('/api/foo')).toBe(true);
      expect(isProxyRewriteExempt('/app')).toBe(true);
      expect(isProxyRewriteExempt('/app/dashboard')).toBe(true);
      expect(isProxyRewriteExempt('/start')).toBe(true);
      expect(isProxyRewriteExempt('/onboarding')).toBe(true);
      expect(isProxyRewriteExempt('/onboarding/checkout')).toBe(true);
      expect(isProxyRewriteExempt('/pricing')).toBe(false);
    });
  });
});
