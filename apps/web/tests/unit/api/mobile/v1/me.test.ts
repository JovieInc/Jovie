import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  captureErrorMock: vi.fn(),
  getAppUrlMock: vi.fn(),
  getProfileUrlMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  isProfileCompleteMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
}));

vi.mock('@/constants/domains', () => ({
  getAppUrl: hoisted.getAppUrlMock,
  getProfileUrl: hoisted.getProfileUrlMock,
}));

vi.mock('@/lib/auth/profile-completeness', () => ({
  isProfileComplete: hoisted.isProfileCompleteMock,
}));

vi.mock('@/lib/auth/session', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    getSessionContext: hoisted.getSessionContextMock,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

const routeModulePromise = import('@/app/api/mobile/v1/me/route');

describe('GET /api/mobile/v1/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.getAppUrlMock.mockReturnValue('https://jov.ie/app');
    hoisted.getProfileUrlMock.mockImplementation(
      (handle: string) => `https://jov.ie/${handle}`
    );
    hoisted.isProfileCompleteMock.mockReturnValue(true);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('returns 403 for banned users', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: {
        userStatus: 'banned',
      },
      profile: null,
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
    });
  });

  it('returns a ready payload for complete profiles', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: {
        userStatus: 'active',
      },
      profile: {
        username: 'djshadow',
        usernameNormalized: 'djshadow',
        displayName: 'DJ Shadow',
        avatarUrl: 'https://cdn.jov.ie/avatar.png',
        isPublic: true,
        onboardingCompletedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const { GET } = await routeModulePromise;
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(data).toEqual({
      state: 'ready',
      displayName: 'DJ Shadow',
      username: 'djshadow',
      publicProfileUrl: 'https://jov.ie/djshadow',
      qrPayload: 'https://jov.ie/djshadow',
      avatarUrl: 'https://cdn.jov.ie/avatar.png',
      continueOnWebUrl: 'https://jov.ie/app',
    });
    expect(hoisted.isProfileCompleteMock).toHaveBeenCalledWith({
      username: 'djshadow',
      usernameNormalized: 'djshadow',
      displayName: 'DJ Shadow',
      isPublic: true,
      onboardingCompletedAt: new Date('2026-04-01T00:00:00.000Z'),
    });
  });

  it('returns needs_onboarding when the DB user is missing', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(
      new TypeError('User not found')
    );

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      state: 'needs_onboarding',
      displayName: null,
      username: null,
      publicProfileUrl: null,
      qrPayload: null,
      avatarUrl: null,
      continueOnWebUrl: 'https://jov.ie/app',
    });
  });

  it('returns needs_onboarding when the profile is missing', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: {
        userStatus: 'active',
      },
      profile: null,
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      state: 'needs_onboarding',
      displayName: null,
      username: null,
      publicProfileUrl: null,
      qrPayload: null,
      avatarUrl: null,
      continueOnWebUrl: 'https://jov.ie/app',
    });
  });

  it('returns needs_onboarding when the profile is incomplete', async () => {
    hoisted.isProfileCompleteMock.mockReturnValue(false);
    hoisted.getSessionContextMock.mockResolvedValue({
      user: {
        userStatus: 'active',
      },
      profile: {
        username: 'djshadow',
        usernameNormalized: 'djshadow',
        displayName: 'DJ Shadow',
        avatarUrl: null,
        isPublic: true,
        onboardingCompletedAt: null,
      },
    });

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      state: 'needs_onboarding',
      displayName: null,
      username: null,
      publicProfileUrl: null,
      qrPayload: null,
      avatarUrl: null,
      continueOnWebUrl: 'https://jov.ie/app',
    });
  });

  it('returns 500 when an unexpected error occurs', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('DB blew up'));

    const { GET } = await routeModulePromise;
    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
    });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Mobile me route failed',
      expect.any(Error),
      { route: '/api/mobile/v1/me' }
    );
  });
});
