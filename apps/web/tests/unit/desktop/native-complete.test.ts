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
      createdSessionId: 'sess_123',
      ticket: vi.fn(async () => ({ error: null })),
      finalize: vi.fn(async () => ({ error: null })),
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
    expect(signIn.ticket).toHaveBeenCalledWith({ ticket: 'ticket_123' });
    expect(signIn.finalize).toHaveBeenCalledTimes(1);
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
      createdSessionId: null,
      ticket: vi.fn(async () => ({ error: null })),
      finalize: vi.fn(async () => ({ error: null })),
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

    expect(signIn.ticket).not.toHaveBeenCalled();
    expect(signIn.finalize).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
  });
});
