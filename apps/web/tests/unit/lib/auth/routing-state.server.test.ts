import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createVerificationValue: vi.fn(),
  findVerificationValue: vi.fn(),
  consumeVerificationValue: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: {
        createVerificationValue: hoisted.createVerificationValue,
        findVerificationValue: hoisted.findVerificationValue,
        consumeVerificationValue: hoisted.consumeVerificationValue,
      },
    }),
  },
}));

const modulePromise = import('@/lib/auth/routing-state.server');

function verification(value: string) {
  return { value };
}

async function createSealedAuthState(): Promise<string> {
  const { createStoredAuthState } = await modulePromise;
  await createStoredAuthState({
    client: 'electron',
    intent: 'sign_in',
    returnTo: '/app/settings',
    state: 'state_123',
    codeChallenge: 'challenge',
    now: 1_000,
  });
  return hoisted.createVerificationValue.mock.calls.at(-1)?.[0].value;
}

async function createSealedNativeExchange(
  overrides: { code?: string; ott?: string | null } = {}
): Promise<string> {
  const { createStoredNativeExchangeCode } = await modulePromise;
  await createStoredNativeExchangeCode({
    code: overrides.code ?? 'code_123',
    client: 'ios',
    state: 'state_123',
    userId: 'user_123',
    returnTo: '/app',
    codeChallenge: 'challenge',
    ott: overrides.ott ?? null,
    now: 1_000,
  });
  return hoisted.createVerificationValue.mock.calls.at(-1)?.[0].value;
}

describe('auth routing state store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createVerificationValue.mockResolvedValue(undefined);
    hoisted.findVerificationValue.mockResolvedValue(null);
    hoisted.consumeVerificationValue.mockResolvedValue(null);
  });

  it('stores auth state in the database-backed verification store', async () => {
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

    expect(hoisted.createVerificationValue).toHaveBeenCalledWith({
      identifier: 'jovie-auth-state:state_123',
      value: expect.stringMatching(/^v1\./),
      expiresAt: new Date(601_000),
    });
    const storedValue =
      hoisted.createVerificationValue.mock.calls.at(-1)?.[0].value;
    expect(storedValue).not.toContain('state_123');
    expect(storedValue).not.toContain('challenge');
  });

  it('consumes auth state once through the atomic database adapter', async () => {
    const { consumeStoredAuthState } = await modulePromise;
    const storedRecord = await createSealedAuthState();
    hoisted.consumeVerificationValue.mockResolvedValue(
      verification(storedRecord)
    );

    await expect(
      consumeStoredAuthState({ state: 'state_123', now: 2_000 })
    ).resolves.toMatchObject({
      client: 'electron',
      returnTo: '/app/settings',
    });

    expect(hoisted.consumeVerificationValue).toHaveBeenCalledWith(
      'jovie-auth-state:state_123'
    );
  });

  it('reads malformed auth state as expired without consuming it', async () => {
    const { readStoredAuthState } = await modulePromise;
    hoisted.findVerificationValue.mockResolvedValue(
      verification('{not valid json')
    );

    await expect(
      readStoredAuthState({ state: 'state_123', now: 2_000 })
    ).resolves.toBeNull();
    expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
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

    expect(hoisted.createVerificationValue).toHaveBeenCalledWith({
      identifier: 'jovie-auth-exchange:code_123',
      value: expect.stringMatching(/^v1\./),
      expiresAt: new Date(301_000),
    });
    const storedValue =
      hoisted.createVerificationValue.mock.calls.at(-1)?.[0].value;
    expect(storedValue).not.toContain('user_123');
    expect(storedValue).not.toContain('challenge');
  });

  it('validates native exchange then atomically claims the database record', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    const storedRecord = await createSealedNativeExchange();
    hoisted.findVerificationValue.mockResolvedValue(verification(storedRecord));
    hoisted.consumeVerificationValue.mockResolvedValue(
      verification(storedRecord)
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
      ott: null,
    });

    expect(hoisted.findVerificationValue).toHaveBeenCalledWith(
      'jovie-auth-exchange:code_123'
    );
    expect(hoisted.consumeVerificationValue).toHaveBeenCalledWith(
      'jovie-auth-exchange:code_123'
    );
  });

  it('preserves native exchange codes on verifier mismatch', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    const storedRecord = await createSealedNativeExchange();
    hoisted.findVerificationValue.mockResolvedValue(verification(storedRecord));

    await expect(
      consumeStoredNativeExchangeCode({
        client: 'ios',
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier',
        now: 2_000,
        createCodeChallenge: () => 'wrong_challenge',
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'wrong_verifier',
      exchangePhase: 'preconsume',
    });

    expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
  });

  it.each(['wrong_state', 'wrong_client', 'expired', 'missing'] as const)(
    'marks %s only when rejected before atomic consumption',
    async reason => {
      const { consumeStoredNativeExchangeCode } = await modulePromise;
      const sealed = await createSealedNativeExchange();
      hoisted.findVerificationValue.mockResolvedValue(
        reason === 'missing' ? null : verification(sealed)
      );
      const result = await consumeStoredNativeExchangeCode({
        client: reason === 'wrong_client' ? 'electron' : 'ios',
        code: 'code_123',
        state: reason === 'wrong_state' ? 'different' : 'state_123',
        codeVerifier: 'verifier',
        now: reason === 'expired' ? 302_000 : 2_000,
        createCodeChallenge: () => 'challenge',
      });
      expect(result).toEqual({
        ok: false,
        reason,
        exchangePhase: 'preconsume',
      });
      expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
    }
  );

  it('keeps a valid code usable after preliminary rejection', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    const sealed = await createSealedNativeExchange();
    hoisted.findVerificationValue.mockResolvedValue(verification(sealed));
    hoisted.consumeVerificationValue.mockResolvedValue(verification(sealed));
    const input = {
      client: 'ios' as const,
      code: 'code_123',
      state: 'state_123',
      codeVerifier: 'verifier',
      now: 2_000,
      createCodeChallenge: () => 'challenge',
    };
    expect(
      await consumeStoredNativeExchangeCode({ ...input, state: 'wrong' })
    ).toEqual({
      ok: false,
      reason: 'wrong_state',
      exchangePhase: 'preconsume',
    });
    expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
    expect(await consumeStoredNativeExchangeCode(input)).toEqual({
      ok: true,
      userId: 'user_123',
      returnTo: '/app',
      ott: null,
    });
    expect(hoisted.consumeVerificationValue).toHaveBeenCalledTimes(1);
  });

  it('allows only one concurrent native exchange to succeed', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    const storedRecord = await createSealedNativeExchange();
    hoisted.findVerificationValue.mockResolvedValue(verification(storedRecord));
    hoisted.consumeVerificationValue
      .mockResolvedValueOnce(verification(storedRecord))
      .mockResolvedValueOnce(null);

    const exchangeInput = {
      client: 'ios' as const,
      code: 'code_123',
      state: 'state_123',
      codeVerifier: 'verifier',
      now: 2_000,
      createCodeChallenge: () => 'challenge',
    };

    const [firstResult, secondResult] = await Promise.all([
      consumeStoredNativeExchangeCode(exchangeInput),
      consumeStoredNativeExchangeCode(exchangeInput),
    ]);

    expect(firstResult).toEqual({
      ok: true,
      userId: 'user_123',
      returnTo: '/app',
      ott: null,
    });
    expect(secondResult).toEqual({ ok: false, reason: 'missing' });
    expect(hoisted.consumeVerificationValue).toHaveBeenCalledTimes(2);
  });

  it('encrypts one-time tokens and binds ciphertext to its database key', async () => {
    const { consumeStoredNativeExchangeCode } = await modulePromise;
    const sealedRecord = await createSealedNativeExchange({
      code: 'code_123',
      ott: 'ott-secret',
    });

    expect(sealedRecord).toMatch(/^v1\./);
    expect(sealedRecord).not.toContain('ott-secret');
    expect(sealedRecord).not.toContain('user_123');

    hoisted.findVerificationValue.mockResolvedValue(verification(sealedRecord));
    await expect(
      consumeStoredNativeExchangeCode({
        client: 'ios',
        code: 'code_456',
        state: 'state_123',
        codeVerifier: 'verifier',
        now: 2_000,
        createCodeChallenge: () => 'challenge',
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'missing',
      exchangePhase: 'preconsume',
    });
    expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
  });
  describe('desktop handback', () => {
    const flow = 'desktop_flow_nonce_12345';
    const verifier = 'v'.repeat(86);
    const challenge = (value: string) => `challenge:${value}`;

    async function sealHandback(expiresAt = 301_000): Promise<{
      identifier: string;
      value: string;
    }> {
      const { createStoredDesktopHandback } = await modulePromise;
      await expect(
        createStoredDesktopHandback({
          code: 'code_123',
          state: 'state_123',
          desktopFlow: flow,
          codeChallenge: challenge(verifier),
          expiresAt,
          returnCode: 'BCDFGHJK',
        })
      ).resolves.toBe('BCDFGHJK');
      return hoisted.createVerificationValue.mock.calls.at(-1)?.[0];
    }

    async function redeem(
      overrides: {
        returnCode?: string;
        codeVerifier?: string;
        now?: number;
      } = {}
    ) {
      const { redeemStoredDesktopHandback } = await modulePromise;
      return redeemStoredDesktopHandback({
        desktopFlow: flow,
        codeVerifier: overrides.codeVerifier ?? verifier,
        returnCode: overrides.returnCode ?? 'bcdf-ghjk',
        createCodeChallenge: challenge,
        now: overrides.now ?? 2_000,
      });
    }

    it('generates unbiased RFC 8628 style return codes', async () => {
      const {
        createDesktopReturnCode,
        DESKTOP_RETURN_CODE_ALPHABET,
        DESKTOP_RETURN_CODE_LENGTH,
      } = await modulePromise;
      const seen = new Set<string>();
      for (let i = 0; i < 200; i += 1) {
        const code = createDesktopReturnCode();
        expect(code).toHaveLength(DESKTOP_RETURN_CODE_LENGTH);
        for (const char of code) {
          expect(DESKTOP_RETURN_CODE_ALPHABET).toContain(char);
        }
        seen.add(code);
      }
      expect(seen.size).toBe(200);
    });

    it('normalizes typed codes and rejects look-alikes', async () => {
      const { normalizeDesktopReturnCode } = await modulePromise;
      expect(normalizeDesktopReturnCode(' bcdf-ghjk ')).toBe('BCDFGHJK');
      expect(normalizeDesktopReturnCode('BCDF GHJK')).toBe('BCDFGHJK');
      expect(normalizeDesktopReturnCode('BCDF-GHJ0')).toBeNull();
      expect(normalizeDesktopReturnCode('ABCDEFGH')).toBeNull();
      expect(normalizeDesktopReturnCode('BCDF')).toBeNull();
    });

    it('stores only a hash of the return code, sealed, keyed by flow hash', async () => {
      const stored = await sealHandback();
      expect(stored.identifier).toMatch(
        /^jovie-auth-desktop-handback:[A-Za-z0-9_-]{43}$/
      );
      expect(stored.identifier).not.toContain(flow);
      expect(stored.value).toMatch(/^v1\./);
      expect(stored.value).not.toContain('code_123');
      expect(stored.value).not.toContain('BCDFGHJK');
    });

    it('redeems with the right code and verifier exactly once', async () => {
      const stored = await sealHandback();
      hoisted.findVerificationValue.mockResolvedValue(
        verification(stored.value)
      );
      hoisted.consumeVerificationValue.mockResolvedValueOnce(
        verification(stored.value)
      );

      await expect(redeem()).resolves.toEqual({
        status: 'complete',
        code: 'code_123',
        state: 'state_123',
      });
      expect(hoisted.consumeVerificationValue).toHaveBeenCalledWith(
        stored.identifier
      );
      // Replay: the row is already consumed.
      await expect(redeem()).resolves.toEqual({ status: 'invalid' });
    });

    it('never consumes the handback on a typo or a foreign verifier', async () => {
      const stored = await sealHandback();
      hoisted.findVerificationValue.mockResolvedValue(
        verification(stored.value)
      );

      await expect(redeem({ returnCode: 'BCDFGHJL' })).resolves.toEqual({
        status: 'invalid',
      });
      // An attacker who crafted the sign-in link holds a different verifier.
      await expect(redeem({ codeVerifier: 'x'.repeat(86) })).resolves.toEqual({
        status: 'invalid',
      });
      expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
    });

    it('treats unknown, malformed and expired handbacks as invalid', async () => {
      await expect(redeem()).resolves.toEqual({ status: 'invalid' });
      await expect(redeem({ returnCode: '0000' })).resolves.toEqual({
        status: 'invalid',
      });

      const stored = await sealHandback(1_500);
      hoisted.findVerificationValue.mockResolvedValue(
        verification(stored.value)
      );
      await expect(redeem()).resolves.toEqual({ status: 'invalid' });
      expect(hoisted.consumeVerificationValue).not.toHaveBeenCalled();
    });
  });
});
