import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authGetSession: vi.fn(),
  authGenerateOneTimeToken: vi.fn(),
  consumeStoredAuthState: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  createStoredNativeExchangeCode: vi.fn(),
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    api: {
      getSession: hoisted.authGetSession,
      generateOneTimeToken: hoisted.authGenerateOneTimeToken,
    },
  },
}));

vi.mock('@/lib/auth/routing-state.server', () => ({
  consumeStoredAuthState: hoisted.consumeStoredAuthState,
  createStoredNativeExchangeCode: hoisted.createStoredNativeExchangeCode,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: hoisted.trackServerEvent,
}));

const { GET } = await import('./route');

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
    hoisted.authGetSession.mockResolvedValue({ user: { id: 'user_123' } });
    hoisted.authGenerateOneTimeToken.mockResolvedValue({ token: 'ott_123' });
    hoisted.consumeStoredAuthState.mockResolvedValue({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/chat?runtime=electron',
      state: 'state_123',
      codeChallenge: 'challenge_123',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });
    hoisted.createStoredNativeExchangeCode.mockResolvedValue({
      code: '00000000000040008000000000000001',
      client: 'electron',
      state: 'state_123',
      userId: 'user_123',
      returnTo: '/app/chat?runtime=electron',
      codeChallenge: 'challenge_123',
      createdAt: 2_000,
      expiresAt: 62_000,
      consumedAt: null,
    });
  });

  it('bounces electron through the same-origin native-return page, never a raw jovie:// 302', async () => {
    // Regression guard (prod Mac login break): a raw 302 Location: jovie://… is
    // not reliably followed by the real system browser, so electron must land
    // on the web bounce page that fires the deep link with a user-gesture
    // fallback. See app/(auth)/auth/native-return/page.tsx.
    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.status).toBe(307);
    const location = response.headers.get('location');
    expect(location).toBe(
      'https://jov.ie/auth/native-return?code=00000000000040008000000000000001&state=state_123'
    );
    expect(location?.includes('/app')).toBe(false);
    // The browser must never receive a bare custom-scheme redirect here.
    expect(location?.startsWith('jovie://')).toBe(false);
    expect(hoisted.consumeStoredAuthState).toHaveBeenCalledTimes(1);
    expect(hoisted.consumeStoredAuthState).toHaveBeenCalledWith({
      state: 'state_123',
    });
    expect(hoisted.createStoredNativeExchangeCode).toHaveBeenCalledWith({
      code: '00000000000040008000000000000001',
      client: 'electron',
      state: 'state_123',
      userId: 'user_123',
      returnTo: '/app/chat?runtime=electron',
      codeChallenge: 'challenge_123',
      ott: 'ott_123',
    });
    expect(
      hoisted.consumeStoredAuthState.mock.invocationCallOrder[0]
    ).toBeLessThan(
      hoisted.createStoredNativeExchangeCode.mock.invocationCallOrder[0]
    );
  });

  it('preserves desktop_flow through the electron bounce', async () => {
    hoisted.consumeStoredAuthState.mockResolvedValueOnce({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/chat?runtime=electron',
      state: 'state_123',
      codeChallenge: 'challenge_123',
      desktopFlow: 'flow_nonce_abcdef123456',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });

    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.headers.get('location')).toBe(
      'https://jov.ie/auth/native-return?code=00000000000040008000000000000001&state=state_123&desktop_flow=flow_nonce_abcdef123456'
    );
  });

  it('bounces iOS through the same-origin ios-complete page, never a web app page', async () => {
    hoisted.consumeStoredAuthState.mockResolvedValueOnce({
      client: 'ios',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'state_123',
      codeChallenge: 'challenge_123',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });
    hoisted.createStoredNativeExchangeCode.mockResolvedValueOnce({
      code: '00000000000040008000000000000001',
      client: 'ios',
      state: 'state_123',
      userId: 'user_123',
      returnTo: '/app',
      codeChallenge: 'challenge_123',
      createdAt: 2_000,
      expiresAt: 62_000,
      consumedAt: null,
    });

    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.headers.get('location')).toBe(
      'https://jov.ie/auth/ios/complete?code=00000000000040008000000000000001&state=state_123'
    );
    expect(
      response.headers.get('location')?.startsWith('ie.jov.jovie://')
    ).toBe(false);
    expect(response.headers.get('location')?.includes('/app')).toBe(false);
  });

  it('preserves staging and local origins on the iOS bounce', async () => {
    hoisted.consumeStoredAuthState.mockResolvedValue({
      client: 'ios',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'state_123',
      codeChallenge: 'challenge_123',
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });

    const staging = await GET(
      new Request('https://staging.jov.ie/auth/callback?state=state_123')
    );
    expect(staging.headers.get('location')).toBe(
      'https://staging.jov.ie/auth/ios/complete?code=00000000000040008000000000000001&state=state_123'
    );

    const local = await GET(
      new Request('http://localhost:3112/auth/callback?state=state_123')
    );
    expect(local.headers.get('location')).toBe(
      'http://localhost:3112/auth/ios/complete?code=00000000000040008000000000000001&state=state_123'
    );
  });

  it('returns 400 when callback state is missing', async () => {
    const response = await GET(new Request('https://jov.ie/auth/callback'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing auth state',
    });
    expect(hoisted.createStoredNativeExchangeCode).not.toHaveBeenCalled();
  });

  it('returns web clients to the sanitized in-app route, never a native bounce', async () => {
    hoisted.consumeStoredAuthState.mockResolvedValueOnce({
      client: 'web',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'state_123',
      codeChallenge: null,
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    });

    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.headers.get('location')).toBe('https://jov.ie/app');
    expect(hoisted.createStoredNativeExchangeCode).not.toHaveBeenCalled();
  });

  it('does not create a native exchange when the auth state was already consumed', async () => {
    hoisted.consumeStoredAuthState.mockResolvedValueOnce(null);

    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Auth state expired',
    });
    expect(hoisted.createStoredNativeExchangeCode).not.toHaveBeenCalled();
  });
});
