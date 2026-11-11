/**
 * Mac app marketing guard at the proxy boundary: desktop-shell requests for
 * marketing pages go to the app home; browsers and app routes are untouched.
 *
 * @see apps/web/proxy.ts
 * @see apps/web/lib/desktop/desktop-marketing-guard.ts
 */
import type { NextFetchEvent, NextResponse } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn().mockReturnValue(null),
}));

import middleware from '@/proxy';
import { createTestRequest, isRedirectTo } from './proxy-test-harness';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Electron/44 JovieDesktop/26.10.16';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140';

const fetchEvent = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as NextFetchEvent;

async function request(pathname: string, userAgent: string) {
  const req = createTestRequest({
    pathname,
    headers: { 'user-agent': userAgent },
  });
  return (await middleware(req, fetchEvent)) as NextResponse | undefined;
}

describe('proxy Mac app marketing guard', () => {
  it.each(['/', '/pricing', '/blog/some-post', '/compare/linktree'])(
    'sends a desktop request for %s to the app home',
    async pathname => {
      const res = await request(pathname, DESKTOP_UA);

      expect(res?.status).toBe(307);
      expect(res && isRedirectTo(res, APP_ROUTES.CHAT)).toBe(true);
      expect(
        new URL(res?.headers.get('location') ?? '').searchParams.get('runtime')
      ).toBe('electron');
      expect(res?.headers.get('cache-control')).toBe('private, no-store');
    }
  );

  it('leaves browser requests for marketing pages alone', async () => {
    const res = await request('/pricing', BROWSER_UA);

    expect(res && isRedirectTo(res, APP_ROUTES.CHAT)).toBeFalsy();
  });

  it.each([APP_ROUTES.SIGNIN, '/support'])(
    'keeps %s reachable in the desktop app',
    async pathname => {
      const res = await request(pathname, DESKTOP_UA);

      expect(res && isRedirectTo(res, APP_ROUTES.CHAT)).toBeFalsy();
    }
  );
});
