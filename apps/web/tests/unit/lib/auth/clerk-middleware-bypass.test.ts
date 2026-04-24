import { describe, expect, it } from 'vitest';
import { shouldBypassClerkForRequest } from '@/lib/auth/clerk-middleware-bypass';

const PUBLIC_PATH_INFO = {
  isAuthCallbackPath: false,
  isAuthPath: false,
  isProtectedPath: false,
} as const;

const PROTECTED_PATH_INFO = {
  isAuthCallbackPath: false,
  isAuthPath: false,
  isProtectedPath: true,
} as const;

describe('shouldBypassClerkForRequest', () => {
  it('bypasses unauthenticated public API routes', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/stripe/pricing-options',
      })
    ).toBe(true);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/dev/test-auth/enter',
      })
    ).toBe(true);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/profile/view',
      })
    ).toBe(true);
  });

  it('keeps Clerk enabled for authenticated API families', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/dsp/matches',
      })
    ).toBe(false);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/promo-downloads/confirm',
      })
    ).toBe(false);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/mobile/v1/me',
      })
    ).toBe(false);
  });

  it('keeps Clerk enabled for API requests with an active session', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [{ name: '__session', value: 'sess_123' }],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/api/stripe/pricing-options',
      })
    ).toBe(false);
  });

  it('keeps Clerk enabled for protected app routes', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PROTECTED_PATH_INFO,
        pathname: '/app',
      })
    ).toBe(false);
  });

  it('force-bypasses protected and auth routes when runtime Clerk is unavailable', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        forceBypass: true,
        pathInfo: PROTECTED_PATH_INFO,
        pathname: '/onboarding',
      })
    ).toBe(true);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        forceBypass: true,
        pathInfo: { ...PUBLIC_PATH_INFO, isAuthPath: true },
        pathname: '/signin',
      })
    ).toBe(true);
  });

  it('keeps Clerk enabled for auth and Clerk proxy routes', () => {
    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: { ...PUBLIC_PATH_INFO, isAuthPath: true },
        pathname: '/signin',
      })
    ).toBe(false);

    expect(
      shouldBypassClerkForRequest({
        cookies: [],
        pathInfo: PUBLIC_PATH_INFO,
        pathname: '/__clerk/v1/client',
      })
    ).toBe(false);
  });

  it('bypasses auth routes in mock lanes without an active Clerk session', () => {
    expect(
      shouldBypassClerkForRequest({
        allowAuthRouteBypass: true,
        cookies: [],
        pathInfo: { ...PUBLIC_PATH_INFO, isAuthPath: true },
        pathname: '/signin',
      })
    ).toBe(true);

    expect(
      shouldBypassClerkForRequest({
        allowAuthRouteBypass: true,
        cookies: [],
        pathInfo: { ...PUBLIC_PATH_INFO, isAuthPath: true },
        pathname: '/signup',
      })
    ).toBe(true);
  });

  it('keeps Clerk enabled for auth routes in mock lanes when a session exists', () => {
    expect(
      shouldBypassClerkForRequest({
        allowAuthRouteBypass: true,
        cookies: [{ name: '__session', value: 'sess_123' }],
        pathInfo: { ...PUBLIC_PATH_INFO, isAuthPath: true },
        pathname: '/signin',
      })
    ).toBe(false);
  });
});
