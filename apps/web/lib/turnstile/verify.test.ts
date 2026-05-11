import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

// Set secret BEFORE module import so `verifyTurnstileToken` sees it.
const ORIGINAL_TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';

afterAll(() => {
  if (ORIGINAL_TURNSTILE_SECRET === undefined) {
    delete process.env.TURNSTILE_SECRET_KEY;
  } else {
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_TURNSTILE_SECRET;
  }
});

import { isTurnstileConfigured, verifyTurnstileToken } from './verify';

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fails closed when token is empty', async () => {
    const result = await verifyTurnstileToken('', '1.2.3.4');
    expect(result.success).toBe(false);
    expect(result.reason).toBe('missing_token');
  });

  it('fails closed when token is undefined', async () => {
    const result = await verifyTurnstileToken(undefined);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('missing_token');
  });

  it('reports success when siteverify returns success:true', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

    const result = await verifyTurnstileToken('valid-token', '1.2.3.4');
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0]!;
    const body = (init?.body as URLSearchParams) ?? null;
    expect(body?.get('secret')).toBe('test-secret-key');
    expect(body?.get('response')).toBe('valid-token');
    expect(body?.get('remoteip')).toBe('1.2.3.4');
  });

  it('reports failure with error codes when siteverify rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
        { status: 200 }
      )
    );

    const result = await verifyTurnstileToken('bad-token', null);
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(['invalid-input-response']);
    expect(result.reason).toBe('siteverify_failed');
  });

  it('reports timeout when fetch aborts', async () => {
    // Use mockImplementation (not Once) — verifyTurnstileToken retries once on
    // timeout, so both fetch attempts need the aborting mock or the second
    // attempt would hit the real network.
    vi.spyOn(globalThis, 'fetch').mockImplementation(((
      _url: unknown,
      init: { signal?: AbortSignal } | undefined
    ) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch);

    // The implementation aborts after 5s; in test we patch the timeout to fire
    // synchronously by waiting for it in real time would slow the suite.
    // Instead trigger abort by replacing AbortController so the abort fires
    // immediately, exercising the AbortError path.
    const originalAbortController = globalThis.AbortController;
    class ImmediateAbortController extends originalAbortController {
      constructor() {
        super();
        queueMicrotask(() => this.abort());
      }
    }
    globalThis.AbortController =
      ImmediateAbortController as unknown as typeof AbortController;

    try {
      const result = await verifyTurnstileToken('any-token');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('siteverify_timeout');
    } finally {
      globalThis.AbortController = originalAbortController;
    }
  });
});

describe('isTurnstileConfigured', () => {
  it('returns true when TURNSTILE_SECRET_KEY is set', () => {
    expect(isTurnstileConfigured()).toBe(true);
  });
});
