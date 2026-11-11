/**
 * `/<username>?mode=<mode>` at the proxy boundary: the proxy rewrites the
 * query to the server-rendered mode route before the filesystem, so a
 * prerendered profile (the afterFiles rewrite in next.config.js never reaches
 * one) does not swap modes after hydration. Product crawl run 42541628916:
 * desktop CLS 0.836 on /tim?mode=listen.
 *
 * @see apps/web/lib/routing/profile-mode-query-rewrite.ts
 */
import type { NextFetchEvent, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionCookie: vi.fn<() => string | null>(),
}));

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: mocks.getSessionCookie,
}));
vi.mock('@/lib/audience/public-profile-block', () => ({
  checkProfileVisitorBlocked: vi.fn().mockResolvedValue(false),
  getAudienceBlockIpFromHeaders: vi.fn().mockReturnValue('masked-ip'),
}));

import middleware from '@/proxy';
import { createTestRequest } from './proxy-test-harness';

const fetchEvent = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as NextFetchEvent;

async function rewriteOf(
  pathname: string,
  searchParams: Record<string, string> = {}
): Promise<URL | null> {
  const res = (await middleware(
    createTestRequest({ pathname, searchParams }),
    fetchEvent
  )) as NextResponse;
  const header = res.headers.get('x-middleware-rewrite');
  return header ? new URL(header) : null;
}

describe('proxy profile ?mode= documents', () => {
  beforeEach(() => {
    mocks.getSessionCookie.mockReturnValue(null);
  });

  it.each([
    ['/tim', 'listen'],
    ['/tim', 'subscribe'],
    ['/dualipa', 'tour'],
  ])('rewrites %s?mode=%s to its mode render route', async (pathname, mode) => {
    const rewrite = await rewriteOf(pathname, { mode, source: 'qr' });

    expect(rewrite?.pathname).toBe(
      `${pathname}/profile-mode-render/${mode}/__profile-mode-alias`
    );
    expect(rewrite?.searchParams.get('source')).toBe('qr');
  });

  it('rewrites signed-in visitors the same way', async () => {
    mocks.getSessionCookie.mockReturnValue('session-token');

    expect((await rewriteOf('/tim', { mode: 'listen' }))?.pathname).toBe(
      '/tim/profile-mode-render/listen/__profile-mode-alias'
    );
  });

  it.each([
    ['/tim', {}],
    ['/tim', { mode: 'profile' }],
    ['/tim', { mode: 'kiosk' }],
    ['/pricing', { mode: 'pay' }],
    ['/tim/about', { mode: 'listen' }],
  ])('leaves %s %j alone', async (pathname, searchParams) => {
    expect(await rewriteOf(pathname, searchParams)).toBeNull();
  });
});
