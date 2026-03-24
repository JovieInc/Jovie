import { describe, expect, it } from 'vitest';
import {
  type ClerkBypassPathInfo,
  shouldBypassClerkForRequest,
} from './clerk-middleware-bypass';

describe('shouldBypassClerkForRequest', () => {
  const publicPathInfo: ClerkBypassPathInfo = {
    isAuthCallbackPath: false,
    isAuthPath: false,
    isProtectedPath: false,
  };

  it.each([
    {
      name: 'bypasses anonymous homepage requests',
      pathname: '/',
      pathInfo: publicPathInfo,
      cookies: [],
      expected: true,
    },
    {
      name: 'keeps Clerk enabled when an active session cookie is present',
      pathname: '/',
      pathInfo: publicPathInfo,
      cookies: [{ name: '__session', value: 'sess_123' }],
      expected: false,
    },
    {
      name: 'treats zero-value client activity cookies as anonymous',
      pathname: '/',
      pathInfo: publicPathInfo,
      cookies: [{ name: '__client_uat', value: '0' }],
      expected: true,
    },
    {
      name: 'does not bypass Clerk on auth routes',
      pathname: '/signin',
      pathInfo: {
        ...publicPathInfo,
        isAuthPath: true,
      },
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on auth callback routes',
      pathname: '/sso-callback',
      pathInfo: {
        ...publicPathInfo,
        isAuthCallbackPath: true,
      },
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on protected app routes',
      pathname: '/app/releases',
      pathInfo: {
        ...publicPathInfo,
        isProtectedPath: true,
      },
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on api routes even without path flags',
      pathname: '/api/user/profile',
      pathInfo: publicPathInfo,
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on trpc routes even without path flags',
      pathname: '/trpc/release.get',
      pathInfo: publicPathInfo,
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass when any cookie indicates an active session',
      pathname: '/',
      pathInfo: publicPathInfo,
      cookies: [
        { name: '__client_uat', value: '0' },
        { name: '__session', value: 'sess_123' },
      ],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on the FAPI proxy path',
      pathname: '/__clerk',
      pathInfo: publicPathInfo,
      cookies: [],
      expected: false,
    },
    {
      name: 'does not bypass Clerk on FAPI proxy sub-paths',
      pathname: '/__clerk/v1/client',
      pathInfo: publicPathInfo,
      cookies: [],
      expected: false,
    },
    {
      name: 'treats blank session cookies as anonymous',
      pathname: '/',
      pathInfo: publicPathInfo,
      cookies: [{ name: '__session', value: '   ' }],
      expected: true,
    },
  ])('$name', ({ pathname, pathInfo, cookies, expected }) => {
    expect(
      shouldBypassClerkForRequest({
        pathname,
        pathInfo,
        cookies,
      })
    ).toBe(expected);
  });
});
