import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  createStoredAuthState: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  generalLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  localLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  createStoredAuthState: hoisted.createStoredAuthState,
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

const { GET } = await import('./route');

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
    hoisted.generalLimiter.limit.mockResolvedValue({ success: true });
    hoisted.localLimiter.limit.mockResolvedValue({ success: true });
    hoisted.createStoredAuthState.mockResolvedValue({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/chat?runtime=electron',
      state: 'state_123',
      codeChallenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });
  });

  it('redirects signed-in native auth starts to the same-origin callback', async () => {
    const response = await GET(
      new Request(
        'http://localhost:3112/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fchat%3Fruntime%3Delectron&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256'
      )
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3112/auth/callback?state=state_123'
    );
    expect(hoisted.createStoredAuthState).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'electron',
        intent: 'sign_in',
        returnTo: '/app/chat?runtime=electron',
        state: '00000000000040008000000000000123',
      })
    );
  });

  it('falls back to local memory rate limiting when Redis is unavailable outside production', async () => {
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
