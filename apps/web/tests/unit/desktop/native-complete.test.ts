import { describe, expect, it, vi } from 'vitest';
import { completeDesktopNativeAuth } from '@/lib/desktop/native-complete';

describe('completeDesktopNativeAuth', () => {
  it('exchanges a desktop callback, verifies the OTT, and returns the route', async () => {
    const completion = {
      code: 'code_123',
      state: 'state_123',
      codeVerifier: 'verifier_123',
    };
    const consumeCompletion = vi.fn(async () => ({
      ok: true as const,
      completion,
    }));
    const fetchNativeExchange = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ticket: 'ott_123',
        returnTo: '/app/chat',
      }),
    }));
    const verifyOneTimeToken = vi.fn(async () => ({ ok: true, status: 200 }));
    const verifyReturnRoute = vi.fn(async () => 'ready' as const);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        verifyOneTimeToken,
        verifyReturnRoute,
      })
    ).resolves.toEqual({ returnTo: '/app/chat' });

    expect(consumeCompletion).toHaveBeenCalledTimes(1);
    expect(fetchNativeExchange).toHaveBeenCalledWith(
      '/api/auth/native/exchange',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: 'electron',
          code: completion.code,
          state: completion.state,
          codeVerifier: completion.codeVerifier,
        }),
      })
    );
    expect(verifyOneTimeToken).toHaveBeenCalledWith('ott_123');
    expect(verifyReturnRoute).toHaveBeenCalledWith('/app/chat');
  });

  it('does not verify OTT when the native exchange fails', async () => {
    const consumeCompletion = vi.fn(async () => ({
      ok: true as const,
      completion: {
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier_123',
      },
    }));
    const fetchNativeExchange = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid native auth exchange' }),
    }));
    const verifyOneTimeToken = vi.fn(async () => ({ ok: true, status: 200 }));

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        verifyOneTimeToken,
      })
    ).rejects.toThrow('native-auth-exchange-failed');

    expect(verifyOneTimeToken).not.toHaveBeenCalled();
  });

  it('throws credential_expired when OTT verify returns 401', async () => {
    const consumeCompletion = vi.fn(async () => ({
      ok: true as const,
      completion: {
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier_123',
      },
    }));
    const fetchNativeExchange = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ticket: 'ott_expired',
        returnTo: '/app/chat',
      }),
    }));
    const verifyOneTimeToken = vi.fn(async () => ({ ok: false, status: 401 }));

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        verifyOneTimeToken,
      })
    ).rejects.toThrow(/credential_expired|expired/i);
  });

  it('rejects when the return route stays unauthenticated', async () => {
    const consumeCompletion = vi.fn(async () => ({
      ok: true as const,
      completion: {
        code: 'code_123',
        state: 'state_123',
        codeVerifier: 'verifier_123',
      },
    }));
    const fetchNativeExchange = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ticket: 'ott_123',
        returnTo: '/app/chat',
      }),
    }));
    const verifyOneTimeToken = vi.fn(async () => ({ ok: true, status: 200 }));
    const verifyReturnRoute = vi.fn(async () => 'unauthenticated' as const);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        verifyOneTimeToken,
        verifyReturnRoute,
        returnRouteVerificationTimeoutMs: 10,
      })
    ).rejects.toThrow(/desktop-auth|unauthenticated|return/i);
  });
});
