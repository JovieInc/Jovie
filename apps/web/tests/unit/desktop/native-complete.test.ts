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
        returnTo: '/app/chat',
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
    expect(signIn.create).toHaveBeenCalledWith({
      strategy: 'ticket',
      ticket: 'ticket_123',
    });
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_123' });
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
        returnTo: '/app/chat',
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
    ).resolves.toEqual({ returnTo: '/app/chat' });

    expect(reloadClerk).toHaveBeenCalledTimes(1);
    expect(setActive).not.toHaveBeenCalled();
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
        returnTo: '/app/chat',
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
