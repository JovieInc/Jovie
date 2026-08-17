import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  signOut: vi.fn(),
  getCachedAuth: vi.fn(),
  createStoredAuthState: vi.fn(),
  readStoredAuthState: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  generalLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  localLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      signOut: hoisted.signOut,
    },
  },
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  createStoredAuthState: hoisted.createStoredAuthState,
  readStoredAuthState: hoisted.readStoredAuthState,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => hoisted.localLimiter),
  createRateLimitHeaders: vi.fn(() => ({})),
  generalLimiter: hoisted.generalLimiter,
  getClientIP: vi.fn(() => '127.0.0.1'),
  RATE_LIMITERS: {
    general: {
      name: 'General',
      limit: 60,
      window: '1 m',
      prefix: 'general',
    },
  },
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: hoisted.trackServerEvent,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { GET, POST } = await import('./route');

describe('GET /auth/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000123'
    );
    hoisted.getCachedAuth.mockResolvedValue({
      userId: 'user_123',
      sessionId: 'session_123',
      orgId: null,
    });
    hoisted.signOut.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: {
          'set-cookie': 'better-auth.session_token=; Path=/; Max-Age=0',
        },
      })
    );
    hoisted.generalLimiter.limit.mockResolvedValue({ success: true });
    hoisted.localLimiter.limit.mockResolvedValue({ success: true });
    hoisted.createStoredAuthState.mockResolvedValue({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/chat?runtime=electron',
      state: 'state_1234567890',
      codeChallenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });
    hoisted.readStoredAuthState.mockResolvedValue({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/chat?runtime=electron',
      state: 'state_1234567890',
      codeChallenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });
  });

  it('requires explicit account switching instead of reusing a signed-in native browser session', async () => {
    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Choose an account');
    expect(body).toContain('name="auth_state" value="state_1234567890"');
    expect(body).not.toContain('/auth/callback?state=state_1234567890');
    expect(hoisted.createStoredAuthState).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'electron',
        intent: 'sign_in',
        returnTo: '/app/chat?runtime=electron',
        state: '00000000000040008000000000000123',
      })
    );
  });

  it('clears the browser session only after explicit account-switch confirmation', async () => {
    const response = await POST(
      new Request('http://localhost:3112/auth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: 'better-auth.session_token=signed-session',
          origin: 'http://localhost:3112',
        },
        body: 'auth_state=state_1234567890&intent=sign_in',
      })
    );

    expect(hoisted.signOut).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      asResponse: true,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3112/signin?auth_state=state_1234567890'
    );
    expect(response.headers.getSetCookie()).toContain(
      'better-auth.session_token=; Path=/; Max-Age=0'
    );
  });

  it('rejects cross-origin account switching without signing out', async () => {
    const response = await POST(
      new Request('http://localhost:3112/auth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://attacker.example',
        },
        body: 'auth_state=state_1234567890&intent=sign_in',
      })
    );

    expect(response.status).toBe(403);
    expect(hoisted.signOut).not.toHaveBeenCalled();
    expect(hoisted.readStoredAuthState).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed state', 'auth_state=short&intent=sign_in'],
    ['wrong intent', 'auth_state=state_1234567890&intent=sign_up'],
  ])('rejects %s without signing out', async (_label, body) => {
    const response = await POST(
      new Request('http://localhost:3112/auth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3112',
        },
        body,
      })
    );

    expect(response.status).toBe(400);
    expect(hoisted.signOut).not.toHaveBeenCalled();
    expect(hoisted.readStoredAuthState).not.toHaveBeenCalled();
  });

  it('returns a recoverable error when browser sign-out fails', async () => {
    const error = new Error('sign-out unavailable');
    hoisted.signOut.mockRejectedValueOnce(error);

    const response = await POST(
      new Request('http://localhost:3112/auth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3112',
        },
        body: 'auth_state=state_1234567890&intent=sign_in',
      })
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(hoisted.captureError).toHaveBeenCalledWith(
      'Auth account switch failed',
      error,
      { route: '/auth/start' }
    );
  });

  it('preserves the browser session when account-switch state is expired', async () => {
    hoisted.readStoredAuthState.mockResolvedValueOnce(null);
    const response = await POST(
      new Request('http://localhost:3112/auth/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'http://localhost:3112',
        },
        body: 'auth_state=state_1234567890&intent=sign_in',
      })
    );

    expect(response.status).toBe(410);
    expect(hoisted.signOut).not.toHaveBeenCalled();
  });

  it('shows account selection for signed-in iOS auth starts', async () => {
    hoisted.createStoredAuthState.mockResolvedValueOnce({
      client: 'ios',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'state_ios_123456',
      codeChallenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=ios&intent=sign_in&return_to=%2Fapp&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Choose an account');
  });

  it('falls back to local memory rate limiting when Redis is unavailable outside production', async () => {
    hoisted.getCachedAuth.mockResolvedValueOnce({
      userId: null,
      sessionId: null,
      orgId: null,
    });
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      reason: 'General rate limiter is temporarily unavailable',
      unavailable: true,
    });
    hoisted.localLimiter.limit.mockResolvedValueOnce({
      success: true,
      limit: 60,
      remaining: 59,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(hoisted.localLimiter.limit).toHaveBeenCalledWith(
      'auth:start:electron:127.0.0.1'
    );
  });

  it('does not fall back based on a diagnostic reason string alone', async () => {
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      reason: 'General rate limiter is temporarily unavailable',
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(429);
    expect(hoisted.localLimiter.limit).not.toHaveBeenCalled();
  });

  it('fails open in production when the limiter backend is unavailable', async () => {
    hoisted.getCachedAuth.mockResolvedValueOnce({
      userId: null,
      sessionId: null,
      orgId: null,
    });
    vi.stubEnv('NODE_ENV', 'production');
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      reason: 'General rate limiter is temporarily unavailable',
      unavailable: true,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(hoisted.localLimiter.limit).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('fails open in production when the limit came from the degraded memory fallback', async () => {
    hoisted.getCachedAuth.mockResolvedValueOnce({
      userId: null,
      sessionId: null,
      orgId: null,
    });
    vi.stubEnv('NODE_ENV', 'production');
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      degraded: true,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(hoisted.localLimiter.limit).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('still enforces a healthy-backend 429 in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(429);
    vi.unstubAllEnvs();
  });

  it('renders a human-readable HTML page for browser-navigated 429s', async () => {
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=web&intent=sign_in&return_to=%2Fapp',
        { headers: { accept: 'text/html,application/xhtml+xml' } }
      )
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('retry-after')).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('Too many sign-in attempts');
    expect(body).toContain('Try again');
    expect(body).toContain('http-equiv="refresh"');
    expect(body).not.toContain('{"error"');
  });

  it('keeps JSON 429s for non-browser clients', async () => {
    hoisted.generalLimiter.limit.mockResolvedValueOnce({
      success: false,
      limit: 60,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=web&intent=sign_in&return_to=%2Fapp',
        { headers: { accept: 'application/json' } }
      )
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toEqual({ error: 'Too many auth attempts' });
  });
});
