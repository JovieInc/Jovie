/**
 * Unit tests for Sentry Init Module State Functions
 *
 * These tests verify the state tracking and route detection
 * functions in the Sentry initialization module.
 *
 * @module tests/unit/lib/sentry/init-state.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Import init module functions
import {
  _resetSentryModeForTesting,
  detectSentryMode,
  getSentryMode,
  isDashboardRoute,
  isFullModeActive,
  isLiteModeActive,
  isPublicRoute,
  isSentryInitialized,
} from '@/lib/sentry/init';

// ============================================================================
// State Tracking Tests
// ============================================================================

describe('Sentry Init State Tracking', () => {
  beforeEach(() => {
    _resetSentryModeForTesting();
  });

  afterEach(() => {
    _resetSentryModeForTesting();
  });

  describe('getSentryMode', () => {
    it('should start with "none" mode', () => {
      expect(getSentryMode()).toBe('none');
    });
  });

  describe('isSentryInitialized', () => {
    it('should report not initialized initially', () => {
      expect(isSentryInitialized()).toBe(false);
    });
  });

  describe('isFullModeActive', () => {
    it('should report full mode as inactive initially', () => {
      expect(isFullModeActive()).toBe(false);
    });
  });

  describe('isLiteModeActive', () => {
    it('should report lite mode as inactive initially', () => {
      expect(isLiteModeActive()).toBe(false);
    });
  });

  describe('_resetSentryModeForTesting', () => {
    it('should reset mode to "none"', () => {
      _resetSentryModeForTesting();
      expect(getSentryMode()).toBe('none');
      expect(isSentryInitialized()).toBe(false);
    });
  });
});

// ============================================================================
// Route Detection Tests (from init module)
// ============================================================================

describe('isDashboardRoute (from init)', () => {
  it.each([
    '/app',
    '/app/dashboard',
    '/app/settings/profile',
    '/account',
    '/account/settings',
    '/billing',
    '/billing/success',
    '/onboarding',
    '/onboarding/step-1',
    '/sso-callback',
  ])('should identify dashboard route: %s', pathname => {
    expect(isDashboardRoute(pathname)).toBe(true);
  });

  it.each([
    '/',
    '/artists',
    '/artists/featured',
    '/beyonce',
    '/waitlist',
    '/claim',
  ])('should not match non-dashboard route: %s', pathname => {
    expect(isDashboardRoute(pathname)).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isDashboardRoute('/APP')).toBe(true);
    expect(isDashboardRoute('/App/Dashboard')).toBe(true);
  });
});

describe('isPublicRoute (from init)', () => {
  it.each([
    '/',
    '/artists',
    '/artists/featured',
    '/waitlist',
    '/claim',
    '/beyonce',
    '/taylor-swift',
    '/some-artist/listen',
  ])('should identify public route: %s', pathname => {
    expect(isPublicRoute(pathname)).toBe(true);
  });

  it.each([
    '/app',
    '/app/dashboard',
    '/account',
    '/billing',
    '/onboarding',
  ])('should not match dashboard route: %s', pathname => {
    expect(isPublicRoute(pathname)).toBe(false);
  });
});

// ============================================================================
// Mode Detection Tests
// ============================================================================

describe('detectSentryMode', () => {
  it.each([
    ['/app', 'full'],
    ['/app/dashboard', 'full'],
    ['/account', 'full'],
    ['/account/settings', 'full'],
    ['/billing', 'full'],
    ['/billing/success', 'full'],
    ['/onboarding', 'full'],
    ['/onboarding/step-2', 'full'],
    ['/sso-callback', 'full'],
  ] as const)('should return "full" for dashboard route: %s', (pathname, expected) => {
    expect(detectSentryMode(pathname)).toBe(expected);
  });

  it.each([
    ['/', 'lite'],
    ['/artists', 'lite'],
    ['/artists/featured', 'lite'],
    ['/waitlist', 'lite'],
    ['/claim', 'lite'],
    ['/beyonce', 'lite'],
    ['/taylor-swift', 'lite'],
  ] as const)('should return "lite" for public route: %s', (pathname, expected) => {
    expect(detectSentryMode(pathname)).toBe(expected);
  });

  it('should return "lite" for unknown routes (safe default)', () => {
    expect(detectSentryMode('/some-random-path')).toBe('lite');
    expect(detectSentryMode('/unknown/nested/path')).toBe('lite');
  });

  it('should handle case variations', () => {
    expect(detectSentryMode('/APP')).toBe('full');
    expect(detectSentryMode('/App/Dashboard')).toBe('full');
    expect(detectSentryMode('/ARTISTS')).toBe('lite');
  });

  it('should handle trailing slashes', () => {
    expect(detectSentryMode('/app/')).toBe('full');
    expect(detectSentryMode('/artists/')).toBe('lite');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Route and Mode Integration', () => {
  it('should correctly map dashboard routes to full mode', () => {
    const dashboardRoutes = [
      '/app',
      '/account',
      '/billing',
      '/onboarding',
      '/sso-callback',
    ];

    for (const route of dashboardRoutes) {
      expect(isDashboardRoute(route)).toBe(true);
      expect(isPublicRoute(route)).toBe(false);
      expect(detectSentryMode(route)).toBe('full');
    }
  });

  it('should correctly map public routes to lite mode', () => {
    const publicRoutes = ['/', '/artists', '/waitlist', '/claim', '/beyonce'];

    for (const route of publicRoutes) {
      expect(isDashboardRoute(route)).toBe(false);
      expect(isPublicRoute(route)).toBe(true);
      expect(detectSentryMode(route)).toBe('lite');
    }
  });
});
