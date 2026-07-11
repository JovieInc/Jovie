import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDevUnwaitlistSessionUser, mockGetCurrentUserEntitlements } =
  vi.hoisted(() => ({
    mockDevUnwaitlistSessionUser: vi.fn(),
    mockGetCurrentUserEntitlements: vi.fn(),
  }));

vi.mock('@/lib/dev/dev-unwaitlist.server', () => ({
  devUnwaitlistSessionUser: mockDevUnwaitlistSessionUser,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

describe('POST /api/dev/unwaitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');

    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: 'user-db-1',
      email: 'smoke@example.com',
      isAuthenticated: true,
    });
    mockDevUnwaitlistSessionUser.mockResolvedValue({
      ok: true,
      profileId: 'profile-1',
      message: 'Session user activated past waitlist for dev QA',
      waitlistStatus: 'invited',
    });
  });

  it('returns 403 outside explicit development environments', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Not available outside development',
    });
    expect(mockDevUnwaitlistSessionUser).not.toHaveBeenCalled();
  });

  it('hard-blocks production Vercel deploys even when NODE_ENV is development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'production');

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(403);
    expect(mockDevUnwaitlistSessionUser).not.toHaveBeenCalled();
  });

  it('returns 401 when the session is not authenticated', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      userId: null,
      email: null,
      isAuthenticated: false,
    });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Not authenticated',
    });
    expect(mockDevUnwaitlistSessionUser).not.toHaveBeenCalled();
  });

  it('activates the current session user in development', async () => {
    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Session user activated past waitlist for dev QA',
      profileId: 'profile-1',
      waitlistStatus: 'invited',
    });
    expect(mockDevUnwaitlistSessionUser).toHaveBeenCalledWith({
      userId: 'user-db-1',
      email: 'smoke@example.com',
      clerkId: null,
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('forwards activation failures from the server helper', async () => {
    mockDevUnwaitlistSessionUser.mockResolvedValue({
      ok: false,
      error: 'Waitlist entry exists but no app user is linked yet',
      status: 422,
    });

    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Waitlist entry exists but no app user is linked yet',
    });
  });

  it('sets no-store cache headers on success responses', async () => {
    const { POST } = await import('@/app/api/dev/unwaitlist/route');
    const response = await POST();

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
