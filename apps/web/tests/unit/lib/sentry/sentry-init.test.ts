/**
 * Unit tests for Sentry SDK configuration and initialization logic
 *
 * These tests verify the new Sentry lazy loading and feature subsetting
 * implementation without actually initializing the Sentry SDK.
 *
 * @module tests/unit/lib/sentry/sentry-init.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Import config functions
import {
  createBeforeSendHook,
  getBaseClientConfig,
  getBaseServerConfig,
  isClientSide,
  isDevelopment,
  isProduction,
  isServerSide,
  SENSITIVE_HEADERS,
  scrubPii,
} from '@/lib/sentry/config';

// Import init module functions (need to reset state between tests)
import {
  _resetSentryModeForTesting,
  detectSentryMode,
  getSentryMode,
  isDashboardRoute as initIsDashboardRoute,
  isPublicRoute as initIsPublicRoute,
  isFullModeActive,
  isLiteModeActive,
  isSentryInitialized,
} from '@/lib/sentry/init';
// Import lazy-replay functions
import {
  _resetUpgradeStateForTesting,
  getUpgradeState,
  isUpgraded,
  isUpgrading,
} from '@/lib/sentry/lazy-replay';
// Import route-detector functions (pure functions, no side effects)
import {
  classifyRoute,
  getSdkMode,
  hasDynamicSegments,
  isApiRoute,
  isDashboardRoute,
  isExplicitPublicRoute,
  isProfileRoute,
  isPublicRoute,
  isRouteGroupPath,
  normalizePathname,
  ROUTE_CONFIG,
} from '@/lib/sentry/route-detector';

// ============================================================================
// Route Detector Tests
// ============================================================================

describe('Sentry Route Detector', () => {
  describe('normalizePathname', () => {
    it('should convert pathname to lowercase', () => {
      expect(normalizePathname('/App/Dashboard')).toBe('/app/dashboard');
    });

    it('should remove trailing slashes except for root', () => {
      expect(normalizePathname('/app/')).toBe('/app');
      expect(normalizePathname('/app/dashboard/')).toBe('/app/dashboard');
    });

    it('should preserve root path', () => {
      expect(normalizePathname('/')).toBe('/');
    });

    it('should trim whitespace', () => {
      expect(normalizePathname('  /app  ')).toBe('/app');
    });
  });

  describe('isDashboardRoute', () => {
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
      '/artist-selection',
    ])('should return true for dashboard route: %s', pathname => {
      expect(isDashboardRoute(pathname)).toBe(true);
    });

    it.each([
      '/',
      '/artists',
      '/artists/featured',
      '/waitlist',
      '/claim',
      '/go/abc',
      '/beyonce',
      '/taylor-swift',
      '/api/users',
    ])('should return false for non-dashboard route: %s', pathname => {
      expect(isDashboardRoute(pathname)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isDashboardRoute('/APP/Dashboard')).toBe(true);
      expect(isDashboardRoute('/BILLING')).toBe(true);
    });
  });

  describe('isPublicRoute', () => {
    it.each([
      '/',
      '/artists',
      '/artists/featured',
      '/waitlist',
      '/claim',
      '/beyonce',
      '/taylor-swift',
      '/some-artist/listen',
    ])('should return true for public route: %s', pathname => {
      expect(isPublicRoute(pathname)).toBe(true);
    });

    it.each([
      '/app',
      '/app/dashboard',
      '/account',
      '/billing',
      '/onboarding',
    ])('should return false for dashboard route: %s', pathname => {
      expect(isPublicRoute(pathname)).toBe(false);
    });

    it.each([
      '/api/users',
      '/api/health',
      '/ingest/events',
    ])('should return false for API route: %s', pathname => {
      expect(isPublicRoute(pathname)).toBe(false);
    });
  });

  describe('isProfileRoute', () => {
    it.each([
      '/beyonce',
      '/taylor-swift',
      '/some-artist',
      '/artist-name/listen',
    ])('should return true for profile route: %s', pathname => {
      expect(isProfileRoute(pathname)).toBe(true);
    });

    it.each([
      '/',
      '/app',
      '/artists',
      '/api/users',
      '/billing',
    ])('should return false for non-profile route: %s', pathname => {
      expect(isProfileRoute(pathname)).toBe(false);
    });
  });

  describe('isApiRoute', () => {
    it.each([
      '/api/users',
      '/api/health',
      '/api/track',
    ])('should return true for API route: %s', pathname => {
      expect(isApiRoute(pathname)).toBe(true);
    });

    it.each([
      '/ingest/events',
      '/ingest/data',
    ])('should return true for ingest route: %s', pathname => {
      expect(isApiRoute(pathname)).toBe(true);
    });

    it.each([
      '/',
      '/app',
      '/artists',
      '/beyonce',
    ])('should return false for non-API route: %s', pathname => {
      expect(isApiRoute(pathname)).toBe(false);
    });
  });

  describe('isExplicitPublicRoute', () => {
    it.each([
      '/',
      '/artists',
      '/artists/featured',
      '/waitlist',
      '/claim',
      '/go/abc',
      '/r/xyz',
    ])('should return true for explicit public route: %s', pathname => {
      expect(isExplicitPublicRoute(pathname)).toBe(true);
    });

    it.each([
      '/beyonce',
      '/taylor-swift',
      '/app',
      '/account',
    ])('should return false for non-explicit public route: %s', pathname => {
      expect(isExplicitPublicRoute(pathname)).toBe(false);
    });
  });

  describe('classifyRoute', () => {
    it('should classify dashboard routes correctly', () => {
      const result = classifyRoute('/app/dashboard');
      expect(result.type).toBe('dashboard');
      expect(result.useFullSdk).toBe(true);
      expect(result.useLiteSdk).toBe(false);
      expect(result.matchedPattern).toBe('/app/*');
    });

    it('should classify public routes correctly', () => {
      const result = classifyRoute('/artists');
      expect(result.type).toBe('public');
      expect(result.useFullSdk).toBe(false);
      expect(result.useLiteSdk).toBe(true);
    });

    it('should classify API routes correctly', () => {
      const result = classifyRoute('/api/users');
      expect(result.type).toBe('api');
      expect(result.useFullSdk).toBe(false);
      expect(result.useLiteSdk).toBe(false);
    });

    it('should classify profile routes as public with dynamic flag', () => {
      const result = classifyRoute('/beyonce');
      expect(result.type).toBe('public');
      expect(result.useLiteSdk).toBe(true);
      expect(result.isDynamic).toBe(true);
      expect(result.matchedPattern).toBe('/[username]/*');
    });

    it('should classify home route correctly', () => {
      const result = classifyRoute('/');
      expect(result.type).toBe('public');
      expect(result.matchedPattern).toBe('/');
    });
  });

  describe('getSdkMode', () => {
    it.each([
      ['/app', 'full'],
      ['/app/dashboard', 'full'],
      ['/account', 'full'],
      ['/billing', 'full'],
      ['/onboarding', 'full'],
    ] as const)('should return "full" for dashboard route: %s', (pathname, expected) => {
      expect(getSdkMode(pathname)).toBe(expected);
    });

    it.each([
      ['/', 'lite'],
      ['/artists', 'lite'],
      ['/beyonce', 'lite'],
      ['/waitlist', 'lite'],
    ] as const)('should return "lite" for public route: %s', (pathname, expected) => {
      expect(getSdkMode(pathname)).toBe(expected);
    });

    it.each([
      ['/api/users', 'none'],
      ['/ingest/events', 'none'],
    ] as const)('should return "none" for API route: %s', (pathname, expected) => {
      expect(getSdkMode(pathname)).toBe(expected);
    });
  });

  describe('hasDynamicSegments', () => {
    it('should detect dynamic segments', () => {
      expect(hasDynamicSegments('/[username]')).toBe(true);
      expect(hasDynamicSegments('/app/[id]')).toBe(true);
      expect(hasDynamicSegments('/[...slug]')).toBe(true);
    });

    it('should return false for static paths', () => {
      expect(hasDynamicSegments('/app')).toBe(false);
      expect(hasDynamicSegments('/artists/featured')).toBe(false);
    });
  });

  describe('isRouteGroupPath', () => {
    it('should detect route groups', () => {
      expect(isRouteGroupPath('/(marketing)/about')).toBe(true);
      expect(isRouteGroupPath('/(auth)/login')).toBe(true);
    });

    it('should return false for non-route-group paths', () => {
      expect(isRouteGroupPath('/app')).toBe(false);
      expect(isRouteGroupPath('/artists')).toBe(false);
    });
  });

  describe('ROUTE_CONFIG', () => {
    it('should export dashboard routes', () => {
      expect(ROUTE_CONFIG.dashboardRoutes).toContain('/app');
      expect(ROUTE_CONFIG.dashboardRoutes).toContain('/account');
      expect(ROUTE_CONFIG.dashboardRoutes).toContain('/billing');
    });

    it('should export public routes', () => {
      expect(ROUTE_CONFIG.publicRoutes).toContain('/artists');
      expect(ROUTE_CONFIG.publicRoutes).toContain('/waitlist');
    });

    it('should export route prefixes', () => {
      expect(ROUTE_CONFIG.apiPrefix).toBe('/api');
      expect(ROUTE_CONFIG.ingestPrefix).toBe('/ingest');
    });
  });
});

// ============================================================================
// Init Module Tests
// ============================================================================

describe('Sentry Init Module', () => {
  beforeEach(() => {
    _resetSentryModeForTesting();
  });

  afterEach(() => {
    _resetSentryModeForTesting();
  });

  describe('isDashboardRoute (from init)', () => {
    it('should identify dashboard routes', () => {
      expect(initIsDashboardRoute('/app')).toBe(true);
      expect(initIsDashboardRoute('/app/dashboard')).toBe(true);
      expect(initIsDashboardRoute('/account')).toBe(true);
    });

    it('should not match non-dashboard routes', () => {
      expect(initIsDashboardRoute('/')).toBe(false);
      expect(initIsDashboardRoute('/artists')).toBe(false);
      expect(initIsDashboardRoute('/beyonce')).toBe(false);
    });
  });

  describe('isPublicRoute (from init)', () => {
    it('should identify public routes', () => {
      expect(initIsPublicRoute('/')).toBe(true);
      expect(initIsPublicRoute('/artists')).toBe(true);
      expect(initIsPublicRoute('/beyonce')).toBe(true);
    });

    it('should not match dashboard routes', () => {
      expect(initIsPublicRoute('/app')).toBe(false);
      expect(initIsPublicRoute('/account')).toBe(false);
    });
  });

  describe('detectSentryMode', () => {
    it('should return "full" for dashboard routes', () => {
      expect(detectSentryMode('/app')).toBe('full');
      expect(detectSentryMode('/app/dashboard')).toBe('full');
      expect(detectSentryMode('/account')).toBe('full');
    });

    it('should return "lite" for public routes', () => {
      expect(detectSentryMode('/')).toBe('lite');
      expect(detectSentryMode('/artists')).toBe('lite');
      expect(detectSentryMode('/beyonce')).toBe('lite');
    });

    it('should return "lite" for unknown routes (safe default)', () => {
      expect(detectSentryMode('/some-random-path')).toBe('lite');
    });
  });

  describe('state tracking functions', () => {
    it('should start with "none" mode', () => {
      expect(getSentryMode()).toBe('none');
    });

    it('should report not initialized initially', () => {
      expect(isSentryInitialized()).toBe(false);
    });

    it('should report full mode as inactive initially', () => {
      expect(isFullModeActive()).toBe(false);
    });

    it('should report lite mode as inactive initially', () => {
      expect(isLiteModeActive()).toBe(false);
    });
  });

  describe('_resetSentryModeForTesting', () => {
    it('should reset mode to "none"', () => {
      // Mode is already set to 'none' by beforeEach, but verify reset works
      _resetSentryModeForTesting();
      expect(getSentryMode()).toBe('none');
    });
  });
});

// ============================================================================
// Config Module Tests
// ============================================================================

describe('Sentry Config Module', () => {
  describe('scrubPii', () => {
    it('should anonymize IP addresses', () => {
      const event = {
        user: {
          ip_address: '192.168.1.1',
        },
      };

      const result = scrubPii(event as any);
      expect(result?.user?.ip_address).toBe('{{auto}}');
    });

    it('should remove email addresses', () => {
      const event = {
        user: {
          email: 'test@example.com',
          id: 'user_123',
        },
      };

      const result = scrubPii(event as any);
      expect(result?.user?.email).toBeUndefined();
      expect(result?.user?.id).toBe('user_123');
    });

    it('should scrub sensitive headers', () => {
      const event = {
        request: {
          headers: {
            authorization: 'Bearer token123',
            cookie: 'session=abc',
            'x-api-key': 'secret-key',
            'x-auth-token': 'auth-token',
            'content-type': 'application/json',
          },
        },
      };

      const result = scrubPii(event as any);
      expect(result?.request?.headers?.authorization).toBe('[Filtered]');
      expect(result?.request?.headers?.cookie).toBe('[Filtered]');
      expect(result?.request?.headers?.['x-api-key']).toBe('[Filtered]');
      expect(result?.request?.headers?.['x-auth-token']).toBe('[Filtered]');
      expect(result?.request?.headers?.['content-type']).toBe(
        'application/json'
      );
    });

    it('should handle events without user or request', () => {
      const event = {
        message: 'Test error',
      };

      const result = scrubPii(event as any);
      expect(result).toEqual(event);
    });

    it('should return the event (not null) for valid events', () => {
      const event = { message: 'Test' };
      const result = scrubPii(event as any);
      expect(result).not.toBeNull();
    });
  });

  describe('createBeforeSendHook', () => {
    it('should apply PII scrubbing', () => {
      const beforeSend = createBeforeSendHook();
      const event = {
        user: {
          ip_address: '192.168.1.1',
          email: 'test@example.com',
        },
      };

      const result = beforeSend(event as any);
      expect(result?.user?.ip_address).toBe('{{auto}}');
      expect(result?.user?.email).toBeUndefined();
    });

    it('should apply custom processor after PII scrubbing', () => {
      const customProcessor = vi.fn(event => {
        return { ...event, tags: { custom: 'tag' } };
      });

      const beforeSend = createBeforeSendHook(customProcessor);
      const event = {
        user: { ip_address: '192.168.1.1' },
      };

      const result = beforeSend(event as any);

      expect(customProcessor).toHaveBeenCalled();
      expect(result?.user?.ip_address).toBe('{{auto}}');
      expect(result?.tags?.custom).toBe('tag');
    });

    it('should handle custom processor returning null', () => {
      const customProcessor = vi.fn(() => null);

      const beforeSend = createBeforeSendHook(customProcessor);
      const event = { message: 'Test' };

      const result = beforeSend(event as any);
      expect(result).toBeNull();
    });
  });

  describe('getBaseClientConfig', () => {
    it('should return base client configuration', () => {
      const config = getBaseClientConfig();

      expect(config).toHaveProperty('dsn');
      expect(config).toHaveProperty('tracesSampleRate');
      expect(config).toHaveProperty('enableLogs');
      expect(config).toHaveProperty('sendDefaultPii');
      expect(config).toHaveProperty('beforeSend');
    });

    it('should have sendDefaultPii disabled for client', () => {
      const config = getBaseClientConfig();
      expect(config.sendDefaultPii).toBe(false);
    });

    it('should have enableLogs enabled', () => {
      const config = getBaseClientConfig();
      expect(config.enableLogs).toBe(true);
    });

    it('should have beforeSend function', () => {
      const config = getBaseClientConfig();
      expect(typeof config.beforeSend).toBe('function');
    });
  });

  describe('getBaseServerConfig', () => {
    it('should return base server configuration', () => {
      const config = getBaseServerConfig();

      expect(config).toHaveProperty('dsn');
      expect(config).toHaveProperty('tracesSampleRate');
      expect(config).toHaveProperty('enableLogs');
      expect(config).toHaveProperty('sendDefaultPii');
      expect(config).toHaveProperty('beforeSend');
      expect(config).toHaveProperty('debug');
    });

    it('should have sendDefaultPii enabled for server (scrubbed via beforeSend)', () => {
      const config = getBaseServerConfig();
      expect(config.sendDefaultPii).toBe(true);
    });

    it('should have debug disabled', () => {
      const config = getBaseServerConfig();
      expect(config.debug).toBe(false);
    });
  });

  describe('SENSITIVE_HEADERS', () => {
    it('should include common sensitive headers', () => {
      expect(SENSITIVE_HEADERS).toContain('authorization');
      expect(SENSITIVE_HEADERS).toContain('cookie');
      expect(SENSITIVE_HEADERS).toContain('x-api-key');
      expect(SENSITIVE_HEADERS).toContain('x-auth-token');
    });
  });

  describe('environment detection', () => {
    // Note: These tests depend on NODE_ENV which is set by vitest
    it('should detect environment correctly', () => {
      // In test environment, we expect NODE_ENV to be 'test'
      // isProduction should be false, isDevelopment should be false
      expect(typeof isProduction).toBe('boolean');
      expect(typeof isDevelopment).toBe('boolean');
    });

    it('isClientSide should return true in jsdom environment', () => {
      expect(isClientSide()).toBe(true);
    });

    it('isServerSide should return false in jsdom environment', () => {
      expect(isServerSide()).toBe(false);
    });
  });
});

// ============================================================================
// Lazy Replay Module Tests
// ============================================================================

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

// ============================================================================
// Integration Tests (Route Detection + SDK Mode)
// ============================================================================

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

// ============================================================================
// Edge Case Tests
// ============================================================================

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
