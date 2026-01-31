import { describe, expect, it } from 'vitest';
import {
  FREQUENT_CACHE,
  PAGINATED_CACHE,
  REALTIME_CACHE,
  STABLE_CACHE,
  STANDARD_CACHE,
  STATIC_CACHE,
} from '@/lib/queries/cache-strategies';

// Time constants for assertions
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('cache-strategies', () => {
  describe('REALTIME_CACHE', () => {
    it('has zero stale time (always refetch)', () => {
      expect(REALTIME_CACHE.staleTime).toBe(0);
    });

    it('has short gc time (5 minutes)', () => {
      expect(REALTIME_CACHE.gcTime).toBe(5 * MINUTE);
    });

    it('always refetches on mount', () => {
      expect(REALTIME_CACHE.refetchOnMount).toBe('always');
    });

    it('refetches on window focus', () => {
      expect(REALTIME_CACHE.refetchOnWindowFocus).toBe(true);
    });

    it('does NOT have refetchInterval by default (polling is opt-in)', () => {
      expect(REALTIME_CACHE.refetchInterval).toBeUndefined();
    });

    it('disables background refetching', () => {
      expect(REALTIME_CACHE.refetchIntervalInBackground).toBe(false);
    });
  });

  describe('FREQUENT_CACHE', () => {
    it('has 1 minute stale time', () => {
      expect(FREQUENT_CACHE.staleTime).toBe(1 * MINUTE);
    });

    it('has 10 minute gc time', () => {
      expect(FREQUENT_CACHE.gcTime).toBe(10 * MINUTE);
    });

    it('refetches on mount', () => {
      expect(FREQUENT_CACHE.refetchOnMount).toBe(true);
    });

    it('refetches on window focus', () => {
      expect(FREQUENT_CACHE.refetchOnWindowFocus).toBe(true);
    });

    it('gcTime is longer than staleTime', () => {
      expect(FREQUENT_CACHE.gcTime).toBeGreaterThan(
        FREQUENT_CACHE.staleTime ?? 0
      );
    });
  });

  describe('STANDARD_CACHE', () => {
    it('has 5 minute stale time', () => {
      expect(STANDARD_CACHE.staleTime).toBe(5 * MINUTE);
    });

    it('has 30 minute gc time', () => {
      expect(STANDARD_CACHE.gcTime).toBe(30 * MINUTE);
    });

    it('refetches on mount', () => {
      expect(STANDARD_CACHE.refetchOnMount).toBe(true);
    });

    it('only refetches on focus in production', () => {
      // In test environment, NODE_ENV is 'test', so this should be false
      // In production, it would be true
      const isProduction = process.env.NODE_ENV === 'production';
      expect(STANDARD_CACHE.refetchOnWindowFocus).toBe(isProduction);
    });

    it('gcTime is significantly longer than staleTime', () => {
      // gc time should be at least 5x stale time for good buffer
      expect(STANDARD_CACHE.gcTime).toBeGreaterThanOrEqual(
        (STANDARD_CACHE.staleTime ?? 0) * 5
      );
    });
  });

  describe('STABLE_CACHE', () => {
    it('has 15 minute stale time', () => {
      expect(STABLE_CACHE.staleTime).toBe(15 * MINUTE);
    });

    it('has 1 hour gc time', () => {
      expect(STABLE_CACHE.gcTime).toBe(1 * HOUR);
    });

    it('does NOT refetch on mount', () => {
      expect(STABLE_CACHE.refetchOnMount).toBe(false);
    });

    it('does NOT refetch on window focus', () => {
      expect(STABLE_CACHE.refetchOnWindowFocus).toBe(false);
    });
  });

  describe('STATIC_CACHE', () => {
    it('has 1 hour stale time', () => {
      expect(STATIC_CACHE.staleTime).toBe(1 * HOUR);
    });

    it('has 2 hour gc time', () => {
      expect(STATIC_CACHE.gcTime).toBe(2 * HOUR);
    });

    it('does NOT refetch on mount', () => {
      expect(STATIC_CACHE.refetchOnMount).toBe(false);
    });

    it('does NOT refetch on window focus', () => {
      expect(STATIC_CACHE.refetchOnWindowFocus).toBe(false);
    });

    it('does NOT refetch on reconnect', () => {
      expect(STATIC_CACHE.refetchOnReconnect).toBe(false);
    });

    it('gcTime provides buffer window after stale', () => {
      // Static data should have buffer time so unmount/remount doesn't lose cache
      expect(STATIC_CACHE.gcTime).toBeGreaterThan(STATIC_CACHE.staleTime ?? 0);
    });
  });

  describe('PAGINATED_CACHE', () => {
    it('has 5 minute stale time', () => {
      expect(PAGINATED_CACHE.staleTime).toBe(5 * MINUTE);
    });

    it('has 30 minute gc time', () => {
      expect(PAGINATED_CACHE.gcTime).toBe(30 * MINUTE);
    });

    it('does NOT refetch on mount (preserves scroll position)', () => {
      expect(PAGINATED_CACHE.refetchOnMount).toBe(false);
    });

    it('does NOT refetch on window focus (prevents UX disruption)', () => {
      expect(PAGINATED_CACHE.refetchOnWindowFocus).toBe(false);
    });
  });

  describe('cache strategy hierarchy', () => {
    it('REALTIME has shortest stale time', () => {
      const strategies = [
        REALTIME_CACHE,
        FREQUENT_CACHE,
        STANDARD_CACHE,
        STABLE_CACHE,
        STATIC_CACHE,
      ];

      const staleTimes = strategies.map(s => s.staleTime ?? 0);
      expect(Math.min(...staleTimes)).toBe(REALTIME_CACHE.staleTime ?? 0);
    });

    it('STATIC has longest stale time', () => {
      const strategies = [
        REALTIME_CACHE,
        FREQUENT_CACHE,
        STANDARD_CACHE,
        STABLE_CACHE,
        STATIC_CACHE,
      ];

      const staleTimes = strategies.map(s => s.staleTime ?? 0);
      expect(Math.max(...staleTimes)).toBe(STATIC_CACHE.staleTime ?? 0);
    });

    it('stale times increase in expected order', () => {
      const realtimeStale = REALTIME_CACHE.staleTime ?? 0;
      const frequentStale = FREQUENT_CACHE.staleTime ?? 0;
      const standardStale = STANDARD_CACHE.staleTime ?? 0;
      const stableStale = STABLE_CACHE.staleTime ?? 0;
      const staticStale = STATIC_CACHE.staleTime ?? 0;

      expect(realtimeStale).toBeLessThan(frequentStale);
      expect(frequentStale).toBeLessThan(standardStale);
      expect(standardStale).toBeLessThan(stableStale);
      expect(stableStale).toBeLessThan(staticStale);
    });

    it('gc times are always longer than stale times', () => {
      const strategies = [
        { name: 'REALTIME', ...REALTIME_CACHE },
        { name: 'FREQUENT', ...FREQUENT_CACHE },
        { name: 'STANDARD', ...STANDARD_CACHE },
        { name: 'STABLE', ...STABLE_CACHE },
        { name: 'STATIC', ...STATIC_CACHE },
        { name: 'PAGINATED', ...PAGINATED_CACHE },
      ];

      for (const strategy of strategies) {
        expect(
          strategy.gcTime,
          `${strategy.name} gcTime should be > staleTime`
        ).toBeGreaterThan(strategy.staleTime ?? 0);
      }
    });
  });

  describe('strategy appropriateness', () => {
    it('REALTIME is suitable for notifications (always fresh)', () => {
      // Notifications should always show latest data
      expect(REALTIME_CACHE.staleTime).toBe(0);
      expect(REALTIME_CACHE.refetchOnMount).toBe('always');
    });

    it('FREQUENT is suitable for billing status (1 min freshness)', () => {
      // Billing status should be relatively fresh but not instant
      expect(FREQUENT_CACHE.staleTime).toBe(1 * MINUTE);
      expect(FREQUENT_CACHE.refetchOnWindowFocus).toBe(true);
    });

    it('STANDARD is suitable for user profile (5 min freshness)', () => {
      // Profile data changes infrequently, 5 min is reasonable
      expect(STANDARD_CACHE.staleTime).toBe(5 * MINUTE);
      expect(STANDARD_CACHE.refetchOnMount).toBe(true);
    });

    it('STABLE is suitable for feature flags (15 min freshness)', () => {
      // Feature flags rarely change, longer cache is fine
      expect(STABLE_CACHE.staleTime).toBe(15 * MINUTE);
      expect(STABLE_CACHE.refetchOnMount).toBe(false);
    });

    it('STATIC is suitable for platform lists (1 hour freshness)', () => {
      // Reference data like platform lists almost never change
      expect(STATIC_CACHE.staleTime).toBe(1 * HOUR);
      expect(STATIC_CACHE.refetchOnReconnect).toBe(false);
    });

    it('PAGINATED is suitable for infinite scroll (no auto-refetch)', () => {
      // Paginated data should not refetch and reset scroll position
      expect(PAGINATED_CACHE.refetchOnMount).toBe(false);
      expect(PAGINATED_CACHE.refetchOnWindowFocus).toBe(false);
    });
  });

  describe('strategy completeness', () => {
    it('all strategies define staleTime', () => {
      expect(REALTIME_CACHE.staleTime).toBeDefined();
      expect(FREQUENT_CACHE.staleTime).toBeDefined();
      expect(STANDARD_CACHE.staleTime).toBeDefined();
      expect(STABLE_CACHE.staleTime).toBeDefined();
      expect(STATIC_CACHE.staleTime).toBeDefined();
      expect(PAGINATED_CACHE.staleTime).toBeDefined();
    });

    it('all strategies define gcTime', () => {
      expect(REALTIME_CACHE.gcTime).toBeDefined();
      expect(FREQUENT_CACHE.gcTime).toBeDefined();
      expect(STANDARD_CACHE.gcTime).toBeDefined();
      expect(STABLE_CACHE.gcTime).toBeDefined();
      expect(STATIC_CACHE.gcTime).toBeDefined();
      expect(PAGINATED_CACHE.gcTime).toBeDefined();
    });

    it('all strategies define refetchOnMount', () => {
      expect(REALTIME_CACHE.refetchOnMount).toBeDefined();
      expect(FREQUENT_CACHE.refetchOnMount).toBeDefined();
      expect(STANDARD_CACHE.refetchOnMount).toBeDefined();
      expect(STABLE_CACHE.refetchOnMount).toBeDefined();
      expect(STATIC_CACHE.refetchOnMount).toBeDefined();
      expect(PAGINATED_CACHE.refetchOnMount).toBeDefined();
    });

    it('all strategies define refetchOnWindowFocus', () => {
      expect(REALTIME_CACHE.refetchOnWindowFocus).toBeDefined();
      expect(FREQUENT_CACHE.refetchOnWindowFocus).toBeDefined();
      expect(STANDARD_CACHE.refetchOnWindowFocus).toBeDefined();
      expect(STABLE_CACHE.refetchOnWindowFocus).toBeDefined();
      expect(STATIC_CACHE.refetchOnWindowFocus).toBeDefined();
      expect(PAGINATED_CACHE.refetchOnWindowFocus).toBeDefined();
    });
  });
});
