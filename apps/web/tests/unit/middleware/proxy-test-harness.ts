/**
 * Shared helpers for proxy.ts middleware behavioral tests.
 *
 * Contains request/response factories and common user state fixtures.
 * Mock setup (vi.hoisted + vi.mock) must be in the test file itself
 * for vitest hoisting to work correctly.
 *
 * @see apps/web/proxy.ts
 */

import { NextRequest } from 'next/server';
import type { ProxyUserState } from '@/lib/auth/proxy-state';

// ============================================================================
// Request factory
// ============================================================================

interface CreateRequestOptions {
  pathname?: string;
  hostname?: string;
  method?: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  searchParams?: Record<string, string>;
}

export function createTestRequest(options: CreateRequestOptions = {}) {
  const {
    pathname = '/',
    hostname = 'localhost',
    method = 'GET',
    headers = {},
    cookies = {},
    searchParams = {},
  } = options;

  const url = new URL(pathname, `https://${hostname}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  const reqHeaders = new Headers({
    'x-test-mode': 'test-auth-bypass',
    ...headers,
  });

  const cookieEntries = Object.entries(cookies);
  if (cookieEntries.length > 0) {
    reqHeaders.set(
      'cookie',
      cookieEntries.map(([k, v]) => `${k}=${v}`).join('; ')
    );
  }

  return new NextRequest(url.toString(), { method, headers: reqHeaders });
}

// ============================================================================
// Response helpers
// ============================================================================

export function getResponseCookies(
  res: import('next/server').NextResponse
): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of res.cookies.getAll()) {
    cookies[cookie.name] = cookie.value;
  }
  return cookies;
}

export function isRedirectTo(
  res: import('next/server').NextResponse,
  path: string
): boolean {
  const location = res.headers.get('location');
  if (!location) return false;
  try {
    const url = new URL(location, 'https://localhost');
    return url.pathname === path || url.pathname.startsWith(`${path}/`);
  } catch {
    return location.startsWith(path);
  }
}

// ============================================================================
// Common user states
// ============================================================================

export const USER_STATES = {
  active: {
    needsWaitlist: false,
    needsOnboarding: false,
    isActive: true,
    isBanned: false,
  } satisfies ProxyUserState,

  needsOnboarding: {
    needsWaitlist: false,
    needsOnboarding: true,
    isActive: false,
    isBanned: false,
  } satisfies ProxyUserState,

  needsWaitlist: {
    needsWaitlist: true,
    needsOnboarding: false,
    isActive: false,
    isBanned: false,
  } satisfies ProxyUserState,

  banned: {
    needsWaitlist: false,
    needsOnboarding: false,
    isActive: false,
    isBanned: true,
  } satisfies ProxyUserState,
} as const;
