import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getRedisMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisDelMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/redis', () => ({
  getRedis: hoisted.getRedisMock,
}));

const redisMock = {
  get: hoisted.redisGetMock,
  set: hoisted.redisSetMock,
  del: hoisted.redisDelMock,
};

const modulePromise = import('@/lib/auth/routing-state.server');

describe('auth routing state store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getRedisMock.mockReturnValue(redisMock);
    hoisted.redisSetMock.mockResolvedValue('OK');
    hoisted.redisDelMock.mockResolvedValue(1);
    hoisted.redisGetMock.mockResolvedValue(null);
  });

  it('fails closed when Redis is unavailable', async () => {
    hoisted.getRedisMock.mockReturnValue(null);
    const { createStoredAuthState } = await modulePromise;

    await expect(
      createStoredAuthState({
        client: 'web',
        intent: 'sign_in',
        returnTo: '/app',
        state: 'state_123',
        now: 1_000,
      })
    ).rejects.toThrow(/redis/i);
  });

  it('stores auth state with a bounded Redis TTL', async () => {
    const { createStoredAuthState } = await modulePromise;

    await expect(
      createStoredAuthState({
        client: 'ios',
        intent: 'sign_in',
        returnTo: '/app',
        state: 'state_123',
        codeChallenge: 'challenge',
        now: 1_000,
      })
    ).resolves.toMatchObject({
      client: 'ios',
      state: 'state_123',
      codeChallenge: 'challenge',
    });

    expect(hoisted.redisSetMock).toHaveBeenCalledWith(
      'auth:state:state_123',
      expect.stringContaining('"client":"ios"'),
      { ex: 600 }
    );
  });

  it('consumes auth state once', async () => {
    const { consumeStoredAuthState } = await modulePromise;
    hoisted.redisGetMock.mockResolvedValue(
      JSON.stringify({
        client: 'electron',
        intent: 'sign_in',
        returnTo: '/app/settings',
        state: 'state_123',
        codeChallenge: 'challenge',
        createdAt: 1_000,
        expiresAt: 601_000,
        consumedAt: null,
      })
    );

    await expect(
      consumeStoredAuthState({ state: 'state_123', now: 2_000 })
    ).resolves.toMatchObject({
      client: 'electron',
      returnTo: '/app/settings',
    });

    expect(hoisted.redisDelMock).toHaveBeenCalledWith('auth:state:state_123');
  });

  it('reads malformed auth state as expired without deleting it', async () => {
    const { consumeStoredAuthState, readStoredAuthState } = await modulePromise;
    hoisted.redisGetMock.mockResolvedValue('{not valid json');

    await expect(
      readStoredAuthState({ state: 'state_123', now: 2_000 })
    ).resolves.toBeNull();
    await expect(
      consumeStoredAuthState({ state: 'state_123', now: 2_000 })
    ).resolves.toBeNull();

    expect(hoisted.redisDelMock).not.toHaveBeenCalled();
  });

  it('stores native exchange codes without putting tickets in URLs', async () => {
    const { createStoredNativeExchangeCode } = await modulePromise;

    await expect(
      createStoredNativeExchangeCode({
        code: 'code_123',
        client: 'ios',
        state: 'state_123',
        userId: 'user_123',
        returnTo: '/app',
        codeChallenge: 'challenge',
        now: 1_000,
      })
    ).resolves.toMatchObject({
      code: 'code_123',
      client: 'ios',
      userId: 'user_123',
    });

    expect(hoisted.redisSetMock).toHaveBeenCalledWith(
      'auth:exchange:code_123',
      expect.not.stringContaining('ticket'),
      { ex: 60 }
    );
  });

  it('validates native exchange and deletes the code after success', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    hoisted.redisGetMock.mockResolvedValue(
      JSON.stringify({
        code: 'code_123',
        client: 'ios',
        state: 'state_123',
        userId: 'user_123',
        returnTo: '/app',
        codeChallenge: 'challenge',
        createdAt: 1_000,
        expiresAt: 61_000,
        consumedAt: null,
      })
    );

    await expect(
      consumeStoredNativeExchangeCode({
        client: 'ios',
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier',
        now: 2_000,
        createCodeChallenge: () => 'challenge',
      })
    ).resolves.toEqual({
      ok: true,
      userId: 'user_123',
      returnTo: '/app',
    });

    expect(hoisted.redisDelMock).toHaveBeenCalledWith('auth:exchange:code_123');
  });

  it('does not delete native exchange codes on verifier mismatch', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    hoisted.redisGetMock.mockResolvedValue(
      JSON.stringify({
        code: 'code_123',
        client: 'ios',
        state: 'state_123',
        userId: 'user_123',
        returnTo: '/app',
        codeChallenge: 'challenge',
        createdAt: 1_000,
        expiresAt: 61_000,
        consumedAt: null,
      })
    );

    await expect(
      consumeStoredNativeExchangeCode({
        client: 'ios',
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier',
        now: 2_000,
        createCodeChallenge: () => 'wrong_challenge',
      })
    ).resolves.toEqual({ ok: false, reason: 'wrong_verifier' });

    expect(hoisted.redisDelMock).not.toHaveBeenCalled();
  });
});
