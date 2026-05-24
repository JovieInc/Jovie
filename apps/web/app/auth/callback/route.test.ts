import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  auth: vi.fn(),
  consumeStoredAuthState: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  createStoredNativeExchangeCode: vi.fn(),
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: hoisted.auth,
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
    hoisted.auth.mockResolvedValue({ userId: 'user_123' });
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

  it('creates the native exchange from the consumed state without re-reading state', async () => {
    const response = await GET(
      new Request('https://jov.ie/auth/callback?state=state_123')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'jovie://auth/complete?code=00000000000040008000000000000001&state=state_123'
    );
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
    });
    expect(
      hoisted.consumeStoredAuthState.mock.invocationCallOrder[0]
    ).toBeLessThan(
      hoisted.createStoredNativeExchangeCode.mock.invocationCallOrder[0]
    );
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
