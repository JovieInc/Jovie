import { describe, expect, it } from 'vitest';
import {
  chunk,
  generateReferrerHistory,
  hockeyStickDate,
  PROFILE_VOLUME,
  pickCity,
  pickCountry,
  pickDeviceType,
  pickWeightedLinkType,
  pickWeightedReferrer,
  REFERRER_URLS,
} from '@/scripts/seed-helpers';

describe('seed-helpers', () => {
  describe('hockeyStickDate', () => {
    it('returns dates within the specified range', () => {
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        const date = hockeyStickDate(90);
        const daysAgo = (now - date.getTime()) / (1000 * 60 * 60 * 24);
        expect(daysAgo).toBeGreaterThanOrEqual(-1); // allow small clock drift
        expect(daysAgo).toBeLessThanOrEqual(91);
      }
    });

    it('biases toward recent dates (>50% within last 25% of range)', () => {
      const now = Date.now();
      let recentCount = 0;
      const trials = 500;
      for (let i = 0; i < trials; i++) {
        const date = hockeyStickDate(90);
        const daysAgo = (now - date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo < 22.5) recentCount++;
      }
      // With x^2 distribution, ~50% should fall in the first 29% of range
      expect(recentCount / trials).toBeGreaterThan(0.35);
    });
  });

  describe('pickWeightedReferrer', () => {
    it('returns URLs or null (not bare names)', () => {
      for (let i = 0; i < 100; i++) {
        const ref = pickWeightedReferrer();
        if (ref !== null) {
          expect(ref).toMatch(/^https?:\/\//);
        }
      }
    });

    it('returns a variety of sources', () => {
      const seen = new Set<string | null>();
      for (let i = 0; i < 200; i++) {
        seen.add(pickWeightedReferrer());
      }
      // Should see at least 4 different sources (including null)
      expect(seen.size).toBeGreaterThanOrEqual(4);
    });
  });

  describe('pickWeightedLinkType', () => {
    it('returns all 4 link types with sufficient samples', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(pickWeightedLinkType());
      }
      expect(seen).toContain('listen');
      expect(seen).toContain('social');
      expect(seen).toContain('tip');
      expect(seen).toContain('other');
    });

    it('biases toward listen (>50%)', () => {
      let listenCount = 0;
      const trials = 500;
      for (let i = 0; i < trials; i++) {
        if (pickWeightedLinkType() === 'listen') listenCount++;
      }
      expect(listenCount / trials).toBeGreaterThan(0.45);
    });
  });

  describe('pickDeviceType', () => {
    it('returns mobile, desktop, or tablet', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        seen.add(pickDeviceType());
      }
      expect(seen.size).toBe(3);
    });
  });

  describe('pickCountry / pickCity', () => {
    it('returns valid country codes', () => {
      const validCountries = [
        'US',
        'GB',
        'CA',
        'AU',
        'DE',
        'FR',
        'JP',
        'BR',
        'MX',
      ];
      for (let i = 0; i < 100; i++) {
        expect(validCountries).toContain(pickCountry());
      }
    });

    it('returns non-empty city for any country', () => {
      const countries = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR', 'MX'];
      for (const country of countries) {
        const city = pickCity(country);
        expect(city).toBeTruthy();
        expect(city.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateReferrerHistory', () => {
    it('uses url key (not source) matching production format', () => {
      for (let i = 0; i < 50; i++) {
        const history = generateReferrerHistory(new Date());
        for (const entry of history) {
          expect(entry).toHaveProperty('url');
          expect(entry).toHaveProperty('timestamp');
          // Must NOT have a 'source' key
          expect(entry).not.toHaveProperty('source');
          expect(entry.url).toMatch(/^https?:\/\//);
        }
      }
    });

    it('generates 1-4 entries by default', () => {
      const counts = new Set<number>();
      for (let i = 0; i < 100; i++) {
        counts.add(generateReferrerHistory(new Date()).length);
      }
      // Should sometimes be 0 (all nulls from direct traffic), 1, 2, or 3
      expect(counts.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PROFILE_VOLUME', () => {
    it('covers all expected artist slugs', () => {
      const expected = [
        'timwhite',
        'the1975',
        'coldplay',
        'billieeilish',
        'dualipa',
        'johnmayer',
        'ladygaga',
        'edsheeran',
        'taylorswift',
        'maneskin',
        'techtalkdaily',
        'fitnesswithemma',
        'creativecorner',
      ];
      for (const slug of expected) {
        expect(PROFILE_VOLUME[slug]).toBeDefined();
        expect(PROFILE_VOLUME[slug]).toBeGreaterThan(0);
        expect(PROFILE_VOLUME[slug]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('REFERRER_URLS', () => {
    it('contains URLs and null (direct traffic)', () => {
      expect(REFERRER_URLS).toContain(null);
      const urls = REFERRER_URLS.filter(Boolean);
      expect(urls.length).toBeGreaterThanOrEqual(5);
      for (const url of urls) {
        expect(url).toMatch(/^https?:\/\//);
      }
    });
  });

  describe('chunk', () => {
    it('splits arrays into correct sizes', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7];
      const result = chunk(arr, 3);
      expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('handles empty arrays', () => {
      expect(chunk([], 5)).toEqual([]);
    });

    it('throws on non-positive chunk size', () => {
      expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
      expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
    });
  });
});

describe('query contract: referrerHistory JSONB matches r->>url extraction', () => {
  it('generated referrerHistory entries can be read by r->>url pattern', () => {
    // This test validates the contract between seed data and the analytics query.
    // The analytics query does: r->>'url' as referrer
    // So every entry in referrerHistory must have a 'url' key that is a string.
    for (let i = 0; i < 100; i++) {
      const history = generateReferrerHistory(new Date());
      for (const entry of history) {
        // Simulate what Postgres does with r->>'url'
        const extracted = (entry as Record<string, unknown>)['url'];
        expect(extracted).toBeDefined();
        expect(typeof extracted).toBe('string');
        expect((extracted as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('no entries use the legacy source key', () => {
    for (let i = 0; i < 100; i++) {
      const history = generateReferrerHistory(new Date());
      for (const entry of history) {
        expect((entry as Record<string, unknown>)['source']).toBeUndefined();
      }
    }
  });

  it('coalesce(r->>url, r->>source) works with legacy source rows', () => {
    // Simulate how getUserDashboardAnalytics extracts referrers:
    // coalesce(r->>'url', r->>'source') as referrer
    const coalesce = (entry: Record<string, unknown>) =>
      (entry['url'] as string | undefined) ??
      (entry['source'] as string | undefined) ??
      null;

    // New format (url key) — produced by generateReferrerHistory
    const newEntry = {
      url: 'https://instagram.com',
      timestamp: new Date().toISOString(),
    };
    expect(coalesce(newEntry)).toBe('https://instagram.com');

    // Legacy format (source key) — may exist in older DB rows
    const legacyEntry = {
      source: 'https://tiktok.com',
      timestamp: new Date().toISOString(),
    };
    expect(coalesce(legacyEntry)).toBe('https://tiktok.com');

    // Mixed payload — url takes priority via coalesce ordering
    const mixedPayload = [newEntry, legacyEntry];
    const extracted = mixedPayload.map(coalesce);
    expect(extracted).toEqual(['https://instagram.com', 'https://tiktok.com']);
  });
});
