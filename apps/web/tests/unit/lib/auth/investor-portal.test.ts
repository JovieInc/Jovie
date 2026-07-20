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

import { handleInvestorRequest } from '@/lib/auth/investor-portal';

function createInvestorRequest(path: string) {
  return new NextRequest(`https://jov.ie${path}`);
}

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
        '/investor-portal/respond?t=token-123&action=interested'
      )
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('lets token-only response links reach the page before DB validation', async () => {
    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal/respond?t=token-123')
    );

    expect(res?.status).toBe(200);
    expect(res?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res?.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('still validates regular portal token links and strips the token into a cookie', async () => {
    mockSelectRows([{ id: 'link-1', isActive: true, expiresAt: null }]);

    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal?t=token-123&utm=x')
    );

    expect(res?.status).toBe(307);
    expect(res?.headers.get('location')).toBe(
      'https://jov.ie/investor-portal?utm=x'
    );
    expect(res?.cookies.get('__investor_token')?.value).toBe('token-123');
    expect(res?.cookies.get('__investor_token')?.path).toBe('/investor-portal');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('calls the rate limiter keyed by client IP before validating the token', async () => {
    mockSelectRows([{ id: 'link-1', isActive: true, expiresAt: null }]);

    const req = new NextRequest('https://jov.ie/investor-portal?t=token-123', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
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
      createInvestorRequest('/investor-portal?t=token-123')
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
      createInvestorRequest('/investor-portal?t=token-123')
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
    mockSelectRows([{ id: 'link-1', isActive: true, expiresAt: null }]);

    const res = await handleInvestorRequest(
      createInvestorRequest('/investor-portal?t=token-123&utm=x')
    );

    expect(mocks.apiLimiterLimit).toHaveBeenCalledTimes(1);
    expect(res?.status).toBe(307);
    expect(res?.cookies.get('__investor_token')?.value).toBe('token-123');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('does not rate-limit cookie-based revisits (no ?t= param)', async () => {
    const req = new NextRequest('https://jov.ie/investor-portal', {
      headers: { Cookie: '__investor_token=token-123' },
    });

    mockSelectRows([{ id: 'link-1', stage: 'shared' }]);
    mocks.shouldRecordInvestorView.mockResolvedValue(false);

    await handleInvestorRequest(req);

    expect(mocks.apiLimiterLimit).not.toHaveBeenCalled();
  });
});
