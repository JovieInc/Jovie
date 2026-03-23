import { describe, expect, it } from 'vitest';
import { shouldBypassClerkForRequest } from '@/lib/auth/clerk-middleware-bypass';

describe('shouldBypassClerkForRequest', () => {
  const publicPathInfo = {
    isAuthCallbackPath: false,
    isAuthPath: false,
    isProtectedPath: false,
  };

  it('bypasses Clerk for anonymous homepage requests', () => {
    expect(
      shouldBypassClerkForRequest({
        pathname: '/',
        pathInfo: publicPathInfo,
        cookies: [],
      })
    ).toBe(true);
  });

  it('keeps Clerk enabled when an active session cookie is present', () => {
    expect(
      shouldBypassClerkForRequest({
        pathname: '/',
        pathInfo: publicPathInfo,
        cookies: [{ name: '__session', value: 'sess_123' }],
      })
    ).toBe(false);
  });

  it('treats zero-value client activity cookies as anonymous', () => {
    expect(
      shouldBypassClerkForRequest({
        pathname: '/',
        pathInfo: publicPathInfo,
        cookies: [{ name: '__client_uat', value: '0' }],
      })
    ).toBe(true);
  });

  it('does not bypass Clerk on auth routes', () => {
    expect(
      shouldBypassClerkForRequest({
        pathname: '/signin',
        pathInfo: {
          ...publicPathInfo,
          isAuthPath: true,
        },
        cookies: [],
      })
    ).toBe(false);
  });

  it('does not bypass Clerk on protected app routes', () => {
    expect(
      shouldBypassClerkForRequest({
        pathname: '/app/releases',
        pathInfo: {
          ...publicPathInfo,
          isProtectedPath: true,
        },
        cookies: [],
      })
    ).toBe(false);
  });
});
