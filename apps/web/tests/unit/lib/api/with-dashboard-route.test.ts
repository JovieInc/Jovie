import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution (all vi.mock factories run at hoist time)
const {
  mockGetCachedAuth,
  mockGetSessionContext,
  mockCaptureError,
  mockNoStoreHeaders,
  mockJson,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockCaptureError: vi.fn(),
  mockNoStoreHeaders: new Headers({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }),
  mockJson: vi.fn((body: unknown, init?: ResponseInit) => ({
    body,
    init,
    status: init?.status ?? 200,
    headers: init?.headers,
  })),
}));

// Mock dependencies (hoisted)
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual('@/lib/auth/session');
  return {
    ...actual,
    getSessionContext: mockGetSessionContext,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: mockNoStoreHeaders,
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      json: mockJson,
    },
  };
});

import type { NextRequest } from 'next/server';
import { withDashboardRoute } from '@/lib/api/with-dashboard-route';
import { SESSION_ERRORS } from '@/lib/auth/session';

describe('with-dashboard-route (RLS/auth failure contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJson.mockImplementation((body, init) => ({
      body,
      init,
      status: init?.status ?? 200,
      headers: init?.headers ?? mockNoStoreHeaders,
    }));
  });

  const createMockRequest = (pathname = '/api/dashboard/test') =>
    ({
      nextUrl: { pathname },
    }) as unknown as NextRequest;

  const mockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    clerkId: 'user_abc',
    email: 'test@jov.ie',
    isAdmin: false,
    isPro: true,
    userStatus: 'active' as const,
  };

  const mockProfile = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: '11111111-1111-1111-1111-111111111111',
    username: 'testuser',
    usernameNormalized: 'testuser',
    displayName: 'Test',
    avatarUrl: null,
    isPublic: true,
    isClaimed: true,
    onboardingCompletedAt: null,
  };

  const mockCtx = {
    clerkUserId: 'user_abc',
    user: mockUser,
    profile: mockProfile,
  };

  it('calls handler with resolved context on success (RLS session established)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_abc' });
    mockGetSessionContext.mockResolvedValue(mockCtx);

    const handler = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const wrapped = withDashboardRoute(handler);

    const req = createMockRequest();
    const result = await wrapped(req);

    expect(mockGetCachedAuth).toHaveBeenCalled();
    expect(mockGetSessionContext).toHaveBeenCalledWith({
      clerkUserId: 'user_abc',
      requireUser: true,
      requireProfile: true,
    });
    expect(handler).toHaveBeenCalledWith(
      { user: mockUser, profile: mockProfile, clerkUserId: 'user_abc' },
      req
    );
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it('returns 401 Unauthorized when no clerk userId (auth bypass / missing session)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);

    const req = createMockRequest('/api/dashboard/secure');
    const result = await wrapped(req);

    expect(mockJson).toHaveBeenCalledWith(
      { error: 'Unauthorized' },
      { status: 401, headers: mockNoStoreHeaders }
    );
    expect(handler).not.toHaveBeenCalled();
    expect(result.status).toBe(401);
  });

  it('returns 404 User not found when getSessionContext throws USER_NOT_FOUND (tenant resolution failure)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_missing' });
    mockGetSessionContext.mockRejectedValue(
      new TypeError(SESSION_ERRORS.USER_NOT_FOUND)
    );

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler, {
      routeName: 'dashboard-test',
    });

    const req = createMockRequest();
    await wrapped(req);

    expect(mockJson).toHaveBeenCalledWith(
      { error: SESSION_ERRORS.USER_NOT_FOUND },
      { status: 404, headers: mockNoStoreHeaders }
    );
  });

  it('returns 404 Profile not found when getSessionContext throws PROFILE_NOT_FOUND', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_noprofile' });
    mockGetSessionContext.mockRejectedValue(
      new TypeError(SESSION_ERRORS.PROFILE_NOT_FOUND)
    );

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);

    const req = createMockRequest();
    await wrapped(req);

    expect(mockJson).toHaveBeenCalledWith(
      { error: SESSION_ERRORS.PROFILE_NOT_FOUND },
      { status: 404, headers: mockNoStoreHeaders }
    );
  });

  it('returns 401 for UnauthorizedSessionError / message from RLS session setup (withDbSession failure)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_unauth' });
    mockGetSessionContext.mockRejectedValue(
      new Error(SESSION_ERRORS.UNAUTHORIZED)
    );

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);

    const req = createMockRequest();
    await wrapped(req);

    expect(mockJson).toHaveBeenCalledWith(
      { error: 'Unauthorized' },
      { status: 401, headers: mockNoStoreHeaders }
    );
  });

  it('captures error and returns 500 for unexpected errors (outer catch for RLS/DB failures)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
    const dbError = new Error('RLS policy violation or connection failure');
    mockGetSessionContext.mockRejectedValue(dbError);

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler, { routeName: 'earnings' });

    const req = createMockRequest('/api/dashboard/earnings');
    await wrapped(req);

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Dashboard route error',
      dbError,
      { route: 'earnings' }
    );
    expect(mockJson).toHaveBeenCalledWith(
      { error: 'Internal server error' },
      { status: 500, headers: mockNoStoreHeaders }
    );
  });

  it('falls back to request pathname for routeName in error capture when not provided', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'user_err' });
    const err = new Error('generic failure');
    mockGetSessionContext.mockRejectedValue(err);

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler); // no routeName

    const req = createMockRequest('/api/dashboard/contacts');
    await wrapped(req);

    expect(mockCaptureError).toHaveBeenCalledWith(
      'Dashboard route error',
      err,
      {
        route: '/api/dashboard/contacts',
      }
    );
  });

  it('preserves NO_STORE_HEADERS on all error paths (security / no-cache for auth failures)', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const handler = vi.fn();
    const wrapped = withDashboardRoute(handler);

    await wrapped(createMockRequest());

    const call = mockJson.mock.calls[0];
    expect(call[1]).toMatchObject({ headers: mockNoStoreHeaders });
  });
});
