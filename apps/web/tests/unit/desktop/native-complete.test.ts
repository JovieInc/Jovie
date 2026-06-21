import { describe, expect, it, vi } from 'vitest';
import { completeDesktopNativeAuth } from '@/lib/desktop/native-complete';

describe('completeDesktopNativeAuth', () => {
  it('exchanges a desktop callback, signs in with the ticket, sets the active session, and returns the route', async () => {
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
      json: async () => ({
        ticket: 'ticket_123',
        returnTo: '/app/releases',
      }),
    }));
    const signIn = {
      create: vi.fn(async () => ({
        status: 'complete',
        createdSessionId: 'sess_123',
        error: null,
      })),
    };
    const setActive = vi.fn(async () => undefined);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
      })
    ).resolves.toEqual({ returnTo: '/app/releases' });

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
    expect(signIn.create).toHaveBeenCalledWith({
      strategy: 'ticket',
      ticket: 'ticket_123',
    });
    expect(setActive).toHaveBeenCalledWith({
      session: 'sess_123',
      redirectUrl: '/app/releases',
    });
  });

  it('does not set an active session when the native exchange fails', async () => {
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
    const signIn = {
      create: vi.fn(async () => ({
        status: 'complete',
        createdSessionId: 'sess_123',
        error: null,
      })),
    };
    const setActive = vi.fn(async () => undefined);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
      })
    ).rejects.toThrow('native-auth-exchange-failed');

    expect(signIn.create).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it('rejects protocol-relative return routes from the native exchange', async () => {
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
      json: async () => ({
        ticket: 'ticket_123',
        returnTo: '//evil.example',
        userId: 'user_123',
      }),
    }));
    const signIn = {
      create: vi.fn(async () => ({
        status: 'complete',
        createdSessionId: 'sess_123',
        error: null,
      })),
    };
    const setActive = vi.fn(async () => undefined);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
      })
    ).rejects.toThrow('native-auth-exchange-missing-return');

    expect(signIn.create).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });

  it('accepts a hydrated matching Clerk session when the ticket response omits a session id', async () => {
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
      json: async () => ({
        ticket: 'ticket_123',
        returnTo: '/app/releases',
        userId: 'user_123',
      }),
    }));
    const signIn = {
      create: vi.fn(async () => ({
        error: null,
      })),
    };
    const setActive = vi.fn(async () => undefined);
    const reloadClerk = vi.fn(async () => undefined);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
        reloadClerk,
        getActiveSessionId: () => 'sess_123',
        getActiveUserId: () => 'user_123',
      })
    ).resolves.toEqual({ returnTo: '/app/releases' });

    expect(reloadClerk).toHaveBeenCalledTimes(1);
    expect(setActive).not.toHaveBeenCalled();
  });

  it('continues when Clerk setActive does not settle but the session hydrates', async () => {
    vi.useFakeTimers();
    try {
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
        json: async () => ({
          ticket: 'ticket_123',
          returnTo: '/app/releases',
          userId: 'user_123',
        }),
      }));
      const signIn = {
        create: vi.fn(async () => ({
          status: 'complete',
          createdSessionId: 'sess_123',
          error: null,
        })),
      };
      const setActive = vi.fn(() => new Promise<void>(() => {}));
      const verifyReturnRoute = vi.fn(async () => 'ready' as const);
      let sessionId: string | null = null;
      const reloadClerk = vi.fn(async () => {
        sessionId = 'sess_123';
      });

      const result = completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
        reloadClerk,
        getActiveSessionId: () => sessionId,
        getActiveUserId: () => 'user_123',
        setActiveTimeoutMs: 1,
        verifyReturnRoute,
      });

      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ returnTo: '/app/releases' });

      expect(setActive).toHaveBeenCalledWith({
        session: 'sess_123',
        redirectUrl: '/app/releases',
      });
      expect(reloadClerk).toHaveBeenCalledTimes(1);
      expect(verifyReturnRoute).toHaveBeenCalledWith('/app/releases');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a hydrated Clerk session when the return route still resolves as signed out', async () => {
    vi.useFakeTimers();
    try {
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
        json: async () => ({
          ticket: 'ticket_123',
          returnTo: '/app/releases',
          userId: 'user_123',
        }),
      }));
      const signIn = {
        create: vi.fn(async () => ({
          status: 'complete',
          createdSessionId: 'sess_123',
          error: null,
        })),
      };
      const setActive = vi.fn(async () => undefined);
      const verifyReturnRoute = vi.fn(async () => 'unauthenticated' as const);

      const result = completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
        reloadClerk: vi.fn(async () => undefined),
        getActiveSessionId: () => 'sess_123',
        getActiveUserId: () => 'user_123',
        returnRouteVerificationTimeoutMs: 1,
        verifyReturnRoute,
      });

      const expectation = expect(result).rejects.toThrow(
        'desktop-auth-server-session-not-active'
      );
      await vi.advanceTimersByTimeAsync(501);
      await expectation;
      expect(verifyReturnRoute).toHaveBeenCalledWith('/app/releases');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a hydrated Clerk session for a different user', async () => {
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
      json: async () => ({
        ticket: 'ticket_123',
        returnTo: '/app/releases',
        userId: 'user_123',
      }),
    }));
    const signIn = {
      create: vi.fn(async () => ({
        error: null,
      })),
    };
    const setActive = vi.fn(async () => undefined);

    await expect(
      completeDesktopNativeAuth({
        consumeCompletion,
        fetchNativeExchange,
        signIn,
        setActive,
        reloadClerk: vi.fn(async () => undefined),
        getActiveSessionId: () => 'sess_other',
        getActiveUserId: () => 'user_other',
      })
    ).rejects.toThrow('desktop-auth-missing-session');

    expect(setActive).not.toHaveBeenCalled();
  });
});
