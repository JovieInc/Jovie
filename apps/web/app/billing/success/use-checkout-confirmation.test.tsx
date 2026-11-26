import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_CONFIRMATION_ATTEMPTS,
  CHECKOUT_CONFIRMATION_INTERVAL_MS,
  useCheckoutConfirmation,
} from './use-checkout-confirmation';

describe('useCheckoutConfirmation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads a pending checkout at most six times, then stops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'pending',
        plan: 'pro',
        paymentStatus: 'paid',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, unmount } = renderHook(() =>
      useCheckoutConfirmation('cs_pending')
    );

    for (let read = 1; read <= CHECKOUT_CONFIRMATION_ATTEMPTS; read += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(fetchMock).toHaveBeenCalledTimes(read);
      if (read < CHECKOUT_CONFIRMATION_ATTEMPTS) {
        expect(result.current.pending).toBe(true);
        expect(result.current.receipt.plan).toBeNull();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(CHECKOUT_CONFIRMATION_INTERVAL_MS);
        });
      }
    }

    expect(result.current.pending).toBe(false);
    expect(result.current.receipt.status).toBe('pending');
    expect(result.current.receipt.plan).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECKOUT_CONFIRMATION_INTERVAL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(CHECKOUT_CONFIRMATION_ATTEMPTS);
    unmount();
  });

  it('aborts the active read on navigation without combining abort signals', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { signal: AbortSignal }) => {
        signal = init.signal;
        return new Promise(() => undefined);
      })
    );
    const { unmount } = renderHook(() => useCheckoutConfirmation('cs_nav'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
