/**
 * Sentry Tests - Lazy Replay, Integration & Edge Cases
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  _resetUpgradeStateForTesting,
  getUpgradeState,
  isUpgraded,
  isUpgrading,
} from '@/lib/sentry/lazy-replay';
import {
  classifyRoute,
  getSdkMode,
  isDashboardRoute,
  isProfileRoute,
  normalizePathname,
} from '@/lib/sentry/route-detector';

describe('Sentry Lazy Replay Module', () => {
  beforeEach(() => {
    _resetUpgradeStateForTesting();
  });

  afterEach(() => {
    _resetUpgradeStateForTesting();
  });

  describe('getUpgradeState', () => {
    it('should return "idle" initially', () => {
      expect(getUpgradeState()).toBe('idle');
    });
  });

  describe('isUpgrading', () => {
    it('should return false initially', () => {
      expect(isUpgrading()).toBe(false);
    });
  });

  describe('isUpgraded', () => {
    it('should return false initially', () => {
      expect(isUpgraded()).toBe(false);
    });
  });

  describe('_resetUpgradeStateForTesting', () => {
    it('should reset state to "idle"', () => {
      _resetUpgradeStateForTesting();
      expect(getUpgradeState()).toBe('idle');
    });
  });
});

describe('Sentry Route and SDK Mode Integration', () => {
  it('should correctly map routes to SDK modes', () => {
    const testCases = [
      // Dashboard routes -> full SDK
      { path: '/app', expectedMode: 'full', expectedType: 'dashboard' },
      {
        path: '/app/dashboard',
        expectedMode: 'full',
        expectedType: 'dashboard',
      },
      {
        path: '/account/settings',
        expectedMode: 'full',
        expectedType: 'dashboard',
      },
      {
        path: '/billing/success',
        expectedMode: 'full',
        expectedType: 'dashboard',
      },
      {
        path: '/onboarding/step-2',
        expectedMode: 'full',
        expectedType: 'dashboard',
      },

      // Public routes -> lite SDK
      { path: '/', expectedMode: 'lite', expectedType: 'public' },
      { path: '/artists', expectedMode: 'lite', expectedType: 'public' },
      {
        path: '/artists/featured',
        expectedMode: 'lite',
        expectedType: 'public',
      },
      { path: '/waitlist', expectedMode: 'lite', expectedType: 'public' },
      { path: '/claim', expectedMode: 'lite', expectedType: 'public' },

      // Profile routes (dynamic) -> lite SDK
      { path: '/beyonce', expectedMode: 'lite', expectedType: 'public' },
      { path: '/taylor-swift', expectedMode: 'lite', expectedType: 'public' },
      {
        path: '/artist-name/listen',
        expectedMode: 'lite',
        expectedType: 'public',
      },

      // API routes -> no SDK
      { path: '/api/users', expectedMode: 'none', expectedType: 'api' },
      { path: '/api/health', expectedMode: 'none', expectedType: 'api' },
      { path: '/ingest/events', expectedMode: 'none', expectedType: 'api' },
    ];

    for (const testCase of testCases) {
      const mode = getSdkMode(testCase.path);
      const classification = classifyRoute(testCase.path);

      expect(mode).toBe(testCase.expectedMode);
      expect(classification.type).toBe(testCase.expectedType);
    }
  });

  it('should handle case variations consistently', () => {
    expect(getSdkMode('/APP')).toBe('full');
    expect(getSdkMode('/App/Dashboard')).toBe('full');
    expect(getSdkMode('/ARTISTS')).toBe('lite');
    expect(getSdkMode('/API/users')).toBe('none');
  });

  it('should handle trailing slashes consistently', () => {
    expect(getSdkMode('/app/')).toBe('full');
    expect(getSdkMode('/artists/')).toBe('lite');
  });
});

describe('Sentry Edge Cases', () => {
  describe('unusual pathnames', () => {
    it('should handle empty string', () => {
      expect(normalizePathname('')).toBe('');
    });

    it('should handle paths with query strings (path only)', () => {
      // normalizePathname only handles the path portion
      expect(normalizePathname('/app?foo=bar')).toBe('/app?foo=bar');
    });

    it('should handle paths with special characters', () => {
      expect(normalizePathname('/artist-name')).toBe('/artist-name');
      expect(normalizePathname('/artist_name')).toBe('/artist_name');
    });
  });

  describe('route boundary cases', () => {
    it('should not match partial route prefixes', () => {
      // /application should not match /app
      expect(isDashboardRoute('/application')).toBe(false);
    });

    it('should match exact dashboard routes', () => {
      expect(isDashboardRoute('/app')).toBe(true);
    });

    it('should match dashboard routes with sub-paths', () => {
      expect(isDashboardRoute('/app/settings/profile')).toBe(true);
    });
  });

  describe('profile route detection', () => {
    it('should handle hyphenated usernames', () => {
      expect(isProfileRoute('/my-artist-name')).toBe(true);
    });

    it('should handle numeric-looking usernames', () => {
      expect(isProfileRoute('/12345')).toBe(true);
    });

    it('should handle single character usernames', () => {
      expect(isProfileRoute('/a')).toBe(true);
    });
  });
});
