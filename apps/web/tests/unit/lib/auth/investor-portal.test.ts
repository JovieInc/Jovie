import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  and: vi.fn(() => 'and-clause'),
  eq: vi.fn(() => 'eq-clause'),
  captureError: vi.fn(),
  releaseInvestorViewDedup: vi.fn(),
  shouldRecordInvestorView: vi.fn(),
  apiLimiterLimit: vi.fn(),
  getSessionCookie: vi.fn(),
  isTestAuthBypassEnabled: vi.fn(() => false),
  resolveTestBypassUserId: vi.fn(() => null),
}));

vi.mock('better-auth/cookies', () => ({
  getSessionCookie: mocks.getSessionCookie,
}));

vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: mocks.isTestAuthBypassEnabled,
  resolveTestBypassUserId: mocks.resolveTestBypassUserId,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock('@/lib/db/schema/investors', () => ({
  investorLinks: {
    id: 'investorLinks.id',
    token: 'investorLinks.token',
    isActive: 'investorLinks.isActive',
    expiresAt: 'investorLinks.expiresAt',
    stage: 'investorLinks.stage',
    updatedAt: 'investorLinks.updatedAt',
  },
  investorViews: {
    investorLinkId: 'investorViews.investorLinkId',
    pagePath: 'investorViews.pagePath',
    userAgent: 'investorViews.userAgent',
    referrer: 'investorViews.referrer',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  eq: mocks.eq,
}));

vi.mock('@/lib/auth/investor-view-dedup', () => ({
  releaseInvestorViewDedup: mocks.releaseInvestorViewDedup,
  shouldRecordInvestorView: mocks.shouldRecordInvestorView,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  apiLimiter: {
    limit: mocks.apiLimiterLimit,
  },
}));

import {
  handleInvestorRequest,
  isRetiredInvestorPath,
} from '@/lib/auth/investor-portal';

function createInvestorRequest(path: string) {
  return new NextRequest(`https://jov.ie${path}`);
}

const CLAIM_TOKEN = 'a'.repeat(43);
const LIVE_LINK = {
  id: 'link-1',
  isActive: true,
  stage: 'shared',
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
};

function mockSelectRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mocks.select.mockReturnValue({ from });

  return { from, where, limit };
}

describe('investor portal proxy helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReset();
    mocks.getSessionCookie.mockReturnValue(null);
    mocks.isTestAuthBypassEnabled.mockReturnValue(false);
    mocks.shouldRecordInvestorView.mockResolvedValue(true);
    mocks.apiLimiterLimit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('lets response action links reach the page with token and action intact before DB validation', async () => {
    const res = await handleInvestorRequest(
      createInvestorRequest(
        `/investor-portal/respond?t=${CLAIM_TOKEN}&action=interested`
      )
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('lets token-only response links reach the page before DB validation', async () => {
    const res = await handleInvestorRequest(
      createInvestorRequest(`/investor-portal/respond?t=${CLAIM_TOKEN}`)
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('still validates regular portal token links and strips the token into a cookie', async () => {
    mockSelectRows([LIVE_LINK]);

    const res = await handleInvestorRequest(
      createInvestorRequest(`/investor-portal?t=${CLAIM_TOKEN}&utm=x`)
    );

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe(
      'https://jov.ie/investor-portal?utm=x'
    );
    expect(res?.cookies.get('__investor_token')?.value).toBe(CLAIM_TOKEN);
    expect(res?.cookies.get('__investor_token')?.path).toBe('/investor-portal');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('calls the rate limiter keyed by client IP before validating the token', async () => {
    mockSelectRows([LIVE_LINK]);

    const req = new NextRequest(
      `https://jov.ie/investor-portal?t=${CLAIM_TOKEN}`,
      {
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
      }
    );
    await handleInvestorRequest(req);

    expect(mocks.apiLimiterLimit).toHaveBeenCalledTimes(1);
    expect(mocks.apiLimiterLimit).toHaveBeenCalledWith(
      'investor-portal:token:203.0.113.7'
    );
  });

  it('returns 429 with a numeric Retry-After header when the rate limiter rejects the request, without touching the database', async () => {
    const resetInMs = 12_000;
    mocks.apiLimiterLimit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: new Date(Date.now() + resetInMs),
    });

    const res = await handleInvestorRequest(
      createInvestorRequest(`/investor-portal?t=${CLAIM_TOKEN}`)
    );

    expect(res?.status).toBe(429);

    const retryAfter = res?.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    const retryAfterSeconds = Number(retryAfter);
    expect(Number.isNaN(retryAfterSeconds)).toBe(false);
    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(12);

    // Anti-enumeration: the DB must never be consulted once the limiter
    // has rejected the request, and no cookie should be set.
    expect(mocks.select).not.toHaveBeenCalled();
    expect(res?.cookies.get('__investor_token')).toBeUndefined();
  });

  it('floors Retry-After at 1 second even when the reset window has already elapsed', async () => {
    mocks.apiLimiterLimit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: new Date(Date.now() - 5_000), // already in the past
    });

    const res = await handleInvestorRequest(
      createInvestorRequest(`/investor-portal?t=${CLAIM_TOKEN}`)
    );

    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBe('1');
  });

  it('still validates the token normally once the rate limiter allows the request (limiter pass -> normal flow)', async () => {
    mocks.apiLimiterLimit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: new Date(Date.now() + 60_000),
    });
    mockSelectRows([LIVE_LINK]);

    const res = await handleInvestorRequest(
      createInvestorRequest(`/investor-portal?t=${CLAIM_TOKEN}&utm=x`)
    );

    expect(mocks.apiLimiterLimit).toHaveBeenCalledTimes(1);
    expect(res?.status).toBe(307);
    expect(res?.cookies.get('__investor_token')?.value).toBe(CLAIM_TOKEN);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('does not rate-limit cookie-based revisits (no ?t= param)', async () => {
    const req = new NextRequest('https://jov.ie/investor-portal', {
      headers: { Cookie: `__investor_token=${CLAIM_TOKEN}` },
    });

    mockSelectRows([LIVE_LINK]);
    mocks.shouldRecordInvestorView.mockResolvedValue(false);

    await handleInvestorRequest(req);

    expect(mocks.apiLimiterLimit).not.toHaveBeenCalled();
  });

  function expectPrivateNotFound(res: Response | null | undefined) {
    expect(res?.status).toBe(404);
    expect(res?.headers.get('X-Robots-Tag')).toBe(
      'noindex, nofollow, noarchive, nosnippet'
    );
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
  }

  it.each([
    '/investors',
    '/investors/',
    '/investors/deck',
    '/pitch',
    '/pitch/index.html',
    '/pitch/assets/tim-universal.png',
    '/Jovie-Pitch-Deck.pdf',
  ])('answers a neutral noindex 404 for retired public path %s', async path => {
    mocks.getSessionCookie.mockReturnValue('session-token');

    const res = await handleInvestorRequest(createInvestorRequest(path));

    expectPrivateNotFound(res);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('leaves profile handles that merely share a prefix alone', async () => {
    expect(isRetiredInvestorPath('/pitchfork')).toBe(false);
    expect(isRetiredInvestorPath('/investorsclub')).toBe(false);
    expect(
      await handleInvestorRequest(createInvestorRequest('/pitchfork'))
    ).toBeNull();
    expect(
      await handleInvestorRequest(createInvestorRequest('/investor-portalx'))
    ).toBeNull();
  });

  it.each([
    '/investor-portal',
    '/investor-portal/memo',
    '/investor-portal/deck/Jovie-Pitch-Deck.pdf',
  ])(
    'answers a neutral noindex 404 for %s without a cookie or session',
    async path => {
      const res = await handleInvestorRequest(createInvestorRequest(path));

      expectPrivateNotFound(res);
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it('answers a neutral noindex 404 for a short token without querying', async () => {
    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal?t=unknown')
    );

    expectPrivateNotFound(res);
    expect(res?.cookies.get('__investor_token')).toBeUndefined();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('answers a neutral 404 and clears an invalid cookie for a signed-out visitor', async () => {
    mockSelectRows([]);
    const req = new NextRequest('https://jov.ie/investor-portal', {
      headers: { Cookie: '__investor_token=revoked' },
    });

    const res = await handleInvestorRequest(req);

    expectPrivateNotFound(res);
    expect(res?.cookies.get('__investor_token')?.value).toBe('');
  });

  it('passes signed-in sessions to the server gate with private headers', async () => {
    mocks.getSessionCookie.mockReturnValue('session-token');

    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal/memo')
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('x-middleware-next')).toBe('1');
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('passes the dev test-auth bypass identity to the server gate', async () => {
    mocks.isTestAuthBypassEnabled.mockReturnValue(true);
    mocks.resolveTestBypassUserId.mockReturnValue('admin-user' as never);

    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal')
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('x-middleware-next')).toBe('1');
  });

  it('marks valid cookie visits noindex and private', async () => {
    mockSelectRows([LIVE_LINK]);
    mocks.shouldRecordInvestorView.mockResolvedValue(false);
    const req = new NextRequest('https://jov.ie/investor-portal', {
      headers: { Cookie: `__investor_token=${CLAIM_TOKEN}` },
    });

    const res = await handleInvestorRequest(req);

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
