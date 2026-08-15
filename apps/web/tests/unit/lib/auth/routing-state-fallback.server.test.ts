import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const modulePromise = import('@/lib/auth/routing-state-fallback.server');

function cookieRequest(value: string): Request {
  return new Request('https://jov.ie/auth/callback?state=state_123', {
    headers: {
      cookie: `jovie_auth_state_fallback=${encodeURIComponent(value)}`,
    },
  });
}

describe('auth routing stateless fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('round-trips a bounded web state and rejects tampering, mismatch, and expiry', async () => {
    const { readAuthStateFallback, sealAuthStateFallback } =
      await modulePromise;
    const record = {
      client: 'web' as const,
      intent: 'sign_in' as const,
      returnTo: '/app',
      state: 'state_123',
      codeChallenge: null,
      desktopFlow: null,
      createdAt: 1_000,
      expiresAt: 601_000,
      consumedAt: null,
    };
    const sealed = sealAuthStateFallback(record, { allowPrimaryMiss: false });

    expect(
      readAuthStateFallback({
        request: cookieRequest(sealed),
        state: 'state_123',
        now: 2_000,
      })
    ).toEqual({ record, allowPrimaryMiss: false });
    expect(
      readAuthStateFallback({
        request: cookieRequest(`${sealed.slice(0, -1)}x`),
        state: 'state_123',
        now: 2_000,
      })
    ).toBeNull();
    expect(
      readAuthStateFallback({
        request: cookieRequest(sealed),
        state: 'other_state',
        now: 2_000,
      })
    ).toBeNull();
    expect(
      readAuthStateFallback({
        request: cookieRequest(sealed),
        state: 'state_123',
        now: 601_001,
      })
    ).toBeNull();
  });

  it('revalidates redirect allowlisting after decrypting the state', async () => {
    const { readAuthStateFallback, sealAuthStateFallback } =
      await modulePromise;
    const sealed = sealAuthStateFallback(
      {
        client: 'web',
        intent: 'sign_in',
        returnTo: '//evil.example',
        state: 'state_123',
        codeChallenge: null,
        desktopFlow: null,
        createdAt: 1_000,
        expiresAt: 601_000,
        consumedAt: null,
      },
      { allowPrimaryMiss: true }
    );

    expect(
      readAuthStateFallback({
        request: cookieRequest(sealed),
        state: 'state_123',
        now: 2_000,
      })
    ).toBeNull();
  });

  it('keeps native exchange fallback bound to state, PKCE, TTL, and ciphertext integrity', async () => {
    const { consumeNativeExchangeFallback, sealNativeExchangeFallback } =
      await modulePromise;
    const verifier = 'native_verifier';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const code = sealNativeExchangeFallback({
      code: 'unused_nonce',
      client: 'ios',
      state: 'state_123',
      userId: 'user_123',
      returnTo: '/app',
      codeChallenge: challenge,
      ott: 'ott_123',
      createdAt: 1_000,
      expiresAt: 301_000,
      consumedAt: null,
    });
    const base = {
      client: 'ios' as const,
      code,
      state: 'state_123',
      now: 2_000,
      createCodeChallenge: (value: string) =>
        createHash('sha256').update(value).digest('base64url'),
    };

    expect(
      consumeNativeExchangeFallback({ ...base, codeVerifier: verifier })
    ).toEqual({
      ok: true,
      userId: 'user_123',
      returnTo: '/app',
      ott: 'ott_123',
    });
    expect(
      consumeNativeExchangeFallback({ ...base, codeVerifier: 'wrong' })
    ).toEqual({ ok: false, reason: 'wrong_verifier' });
    expect(
      consumeNativeExchangeFallback({
        ...base,
        state: 'wrong_state',
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, reason: 'wrong_state' });
    expect(
      consumeNativeExchangeFallback({
        ...base,
        now: 301_001,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, reason: 'expired' });
    expect(
      consumeNativeExchangeFallback({
        ...base,
        code: `${code.slice(0, -1)}x`,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, reason: 'missing' });
  });
});
