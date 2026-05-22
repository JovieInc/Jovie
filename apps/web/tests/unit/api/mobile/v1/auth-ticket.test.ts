import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  captureErrorMock: vi.fn(),
  createRateLimitHeadersMock: vi.fn(),
  createSignInTokenMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.authMock,
  clerkClient: vi.fn(async () => ({
    signInTokens: {
      createSignInToken: hoisted.createSignInTokenMock,
    },
  })),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: hoisted.createRateLimitHeadersMock,
  generalLimiter: {
    limit: hoisted.rateLimitMock,
  },
}));

const routeModulePromise = import('@/app/api/mobile/v1/auth/ticket/route');

describe('POST /api/mobile/v1/auth/ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ userId: 'user_123' });
    hoisted.createSignInTokenMock.mockResolvedValue({
      token: 'ticket_123',
    });
    hoisted.createRateLimitHeadersMock.mockReturnValue({
      'X-RateLimit-Limit': '10',
    });
    hoisted.rateLimitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/auth/ticket', {
        method: 'POST',
        body: JSON.stringify({ route: '/app/settings' }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('creates a short-lived sign-in ticket and returns a native deep link', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/auth/ticket', {
        method: 'POST',
        body: JSON.stringify({ route: '/app/settings' }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(hoisted.createSignInTokenMock).toHaveBeenCalledWith({
      userId: 'user_123',
      expiresInSeconds: 60,
    });
    expect(hoisted.rateLimitMock).toHaveBeenCalledWith(
      'mobile-auth-ticket:user_123'
    );
    await expect(response.json()).resolves.toEqual({
      deepLink:
        'ie.jov.jovie://auth-return?ticket=ticket_123&route=%2Fapp%2Fsettings',
      expiresInSeconds: 60,
    });
  });

  it('rate limits ticket creation before calling Clerk', async () => {
    hoisted.rateLimitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
      reason: 'Too many sign-in attempts',
    });

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/auth/ticket', {
        method: 'POST',
        body: JSON.stringify({ route: '/app/settings' }),
      })
    );

    expect(response.status).toBe(429);
    expect(hoisted.createSignInTokenMock).not.toHaveBeenCalled();
    expect(hoisted.createRateLimitHeadersMock).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: 'Too many sign-in attempts',
    });
  });

  it('falls back to the dashboard for unsafe return routes', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/auth/ticket', {
        method: 'POST',
        body: JSON.stringify({ route: 'https://evil.com' }),
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      deepLink: 'ie.jov.jovie://auth-return?ticket=ticket_123&route=%2Fapp',
    });
  });

  it('returns 500 when Clerk ticket creation fails', async () => {
    hoisted.createSignInTokenMock.mockRejectedValue(new Error('Clerk failed'));

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request('https://jov.ie/api/mobile/v1/auth/ticket', {
        method: 'POST',
        body: JSON.stringify({ route: '/app' }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
    });
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Mobile auth ticket route failed',
      expect.any(Error),
      { route: '/api/mobile/v1/auth/ticket' }
    );
  });
});
