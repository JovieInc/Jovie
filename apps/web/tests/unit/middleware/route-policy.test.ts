/**
 * Direct unit tests for the route-policy logic extracted to proxy-routing.ts
 * (single module owning classification, public-profile candidate detection,
 * rewrite exemptions, and APP_ROUTES-derived reserved segments).
 *
 * These tests assert the classification bugfix: /start, /pricing, /about,
 * /investors etc NEVER trigger the public-profile audience block DB path.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  _analyzeHostCache,
  _categorizePathCache,
  analyzeHost,
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

    it('reserves every single-segment APP_ROUTES value from public-profile lookup', () => {
      const topLevelRoutes = Object.values(APP_ROUTES).filter(route => {
        if (typeof route !== 'string' || !route.startsWith('/')) return false;
        const rest = route.slice(1);
        return rest.length > 0 && !rest.includes('/');
      });

      for (const route of topLevelRoutes) {
        expect(getPublicProfileCandidate(route), route).toBeNull();
        expect(isPublicProfileAudienceBlockCandidate(route), route).toBe(false);
      }
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

describe('proxy-routing memoization (#10992)', () => {
  afterEach(() => {
    _categorizePathCache.clear();
    _analyzeHostCache.clear();
  });

  describe('categorizePath cache', () => {
    it('returns the same object reference on repeated calls (cache hit)', () => {
      const first = categorizePath('/timwhite');
      const second = categorizePath('/timwhite');
      expect(second).toBe(first);
    });

    it('returns a fresh result for a different pathname', () => {
      const a = categorizePath('/timwhite');
      const b = categorizePath('/joviewhite');
      expect(b).not.toBe(a);
    });

    it('bounds the cache at 1000 entries with FIFO eviction', () => {
      // Seed a reference entry
      const evictedPath = '/memo-evict-probe-path';
      const first = categorizePath(evictedPath);
      expect(categorizePath(evictedPath)).toBe(first);

      // Fill 1000 entries so evictedPath is pushed out
      for (let i = 0; i < 1000; i++) {
        categorizePath(`/memo-filler-user-${i}`);
      }

      expect(_categorizePathCache.size).toBe(1000);
      // The evicted entry is no longer the same reference
      expect(categorizePath(evictedPath)).not.toBe(first);
    });
  });

  describe('analyzeHost cache', () => {
    it('returns the same object reference on repeated calls (cache hit)', () => {
      const first = analyzeHost('jov.ie');
      const second = analyzeHost('jov.ie');
      expect(second).toBe(first);
    });

    it('returns a fresh result for a different hostname', () => {
      const a = analyzeHost('jov.ie');
      const b = analyzeHost('staging.jov.ie');
      expect(b).not.toBe(a);
    });

    it('bounds the cache at 50 entries with FIFO eviction', () => {
      // Seed a reference entry
      const evictedHost = 'memo-evict-probe.example';
      const first = analyzeHost(evictedHost);
      expect(analyzeHost(evictedHost)).toBe(first);

      // Fill 50 entries so evictedHost is pushed out
      for (let i = 0; i < 50; i++) {
        analyzeHost(`memo-filler-${i}.example`);
      }

      expect(_analyzeHostCache.size).toBe(50);
      // The evicted entry is no longer the same reference
      expect(analyzeHost(evictedHost)).not.toBe(first);
    });
  });
});
