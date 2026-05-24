/**
 * Contract tests for withDashboardRoute wrapper (RLS access control surface).
 * Covers auth failures (401), user/profile not found (404), unauthorized (401),
 * outer-catch 500 + captureError, fail-closed NO_STORE_HEADERS, success delegation.
 * Matches patterns from webhook-sig (#9405), dev-test-auth-bypass (#9399), session.critical,
 * onboarding claim/intake contract tests: hoisted mocks, dynamic import, exact error shapes,
 * side-effect verification (captureError), durable fail-closed behavior.
 */
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetCachedAuth, mockGetSessionContext, mockCaptureError } =
  vi.hoisted(() => ({
    mockGetCachedAuth: vi.fn(),
    mockGetSessionContext: vi.fn(),
    mockCaptureError: vi.fn(),
  }));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mockGetSessionContext,
  SESSION_ERRORS: {
    USER_NOT_FOUND: 'User not found',
    PROFILE_NOT_FOUND: 'Profile not found',
    UNAUTHORIZED: 'Unauthorized',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('withDashboardRoute (RLS auth/profile guard + outer catch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 Unauthorized when not authenticated (auth contract)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);
    const req = new NextRequest('https://example.com/api/dashboard/test');

    const res = await wrapped(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 404 User not found when getSessionContext throws USER_NOT_FOUND (TypeError path)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetSessionContext.mockRejectedValue(new TypeError('User not found'));

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler, { routeName: 'test-route' });
    const req = new NextRequest('https://example.com/api/dashboard/test');

    const res = await wrapped(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'User not found' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(handler).not.toHaveBeenCalled();
    // capture not called for known auth errors
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('returns 404 Profile not found when getSessionContext throws PROFILE_NOT_FOUND', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetSessionContext.mockRejectedValue(new TypeError('Profile not found'));

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);
    const req = new NextRequest('https://example.com/api/dashboard/test');

    const res = await wrapped(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Profile not found' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 401 Unauthorized for UNAUTHORIZED session error (message match)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockGetSessionContext.mockRejectedValue(new Error('Unauthorized'));

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);
    const req = new NextRequest('https://example.com/api/dashboard/test');

    const res = await wrapped(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 500 and calls captureError for unknown errors (fail-closed outer catch + capture)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    const dbError = new Error('db connection lost during RLS setup');
    mockGetSessionContext.mockRejectedValue(dbError);

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler, { routeName: 'earnings' });
    const req = new NextRequest('https://example.com/api/dashboard/earnings');

    const res = await wrapped(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(handler).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Dashboard route error',
      dbError,
      expect.objectContaining({ route: 'earnings' })
    );
  });

  it('delegates to handler with resolved ctx on success path (happy contract)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_user_abc' });
    const mockUser = {
      id: 'user-uuid-123',
      clerkId: 'clerk_user_abc',
      email: 'test@jov.ie',
      isAdmin: false,
      isPro: true,
      userStatus: 'active' as const,
    };
    const mockProfile = {
      id: 'prof-uuid-456',
      userId: 'user-uuid-123',
      username: 'testuser',
      usernameNormalized: 'testuser',
      displayName: 'Test User',
      avatarUrl: null,
      isPublic: true,
      isClaimed: true,
      onboardingCompletedAt: null,
    };
    mockGetSessionContext.mockResolvedValue({
      clerkUserId: 'clerk_user_abc',
      user: mockUser,
      profile: mockProfile,
    });

    const { withDashboardRoute } = await import(
      '@/lib/api/with-dashboard-route'
    );
    const successResponse = NextResponse.json(
      { data: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    const handler = vi.fn().mockResolvedValue(successResponse);
    const wrapped = withDashboardRoute(handler);
    const req = new NextRequest('https://example.com/api/dashboard/profile');

    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      {
        user: mockUser,
        profile: mockProfile,
        clerkUserId: 'clerk_user_abc',
      },
      req
    );
    expect(res).toBe(successResponse);
  });
});
