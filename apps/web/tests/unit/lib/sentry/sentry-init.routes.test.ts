/**
 * Sentry Tests - Route Detector
 */
import { describe, expect, it } from 'vitest';

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
