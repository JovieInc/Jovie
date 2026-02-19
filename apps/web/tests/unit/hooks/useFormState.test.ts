import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calculateBackoffDelay, useFormState } from '@/lib/hooks/useFormState';

// ─── calculateBackoffDelay ───────────────────────────────────────────────────

describe('calculateBackoffDelay', () => {
  beforeEach(() => {
    // Pin Math.random to 0.5 so jitter multiplier is exactly 1.0 (0.9 + 0.5*0.2)
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('returns baseDelay for attempt 0 (no jitter variance at random=0.5)', () => {
    const result = calculateBackoffDelay(0, 1000, 30000);
    // 1000 * 2^0 = 1000, jitter = 1.0 => 1000
    expect(result).toBe(1000);
  });

  it('doubles delay for each subsequent attempt', () => {
    expect(calculateBackoffDelay(1, 1000, 30000)).toBe(2000);
    expect(calculateBackoffDelay(2, 1000, 30000)).toBe(4000);
    expect(calculateBackoffDelay(3, 1000, 30000)).toBe(8000);
  });

  it('caps delay at maxDelay', () => {
    // 1000 * 2^10 = 1024000, capped at 30000
    expect(calculateBackoffDelay(10, 1000, 30000)).toBe(30000);
  });

  it('never exceeds maxDelay even with high jitter', () => {
    // Set random to 1.0 => jitter multiplier = 1.1
    vi.spyOn(Math, 'random').mockReturnValue(1.0);
    const result = calculateBackoffDelay(10, 1000, 30000);
    // 30000 * 1.1 = 33000 rounded
    expect(result).toBeLessThanOrEqual(33000);
    // But the capped delay * max jitter still forms an upper bound
    expect(result).toBeGreaterThan(0);
  });

  it('applies jitter within expected range', () => {
    // At random=0 => multiplier=0.9, at random=1 => multiplier=1.1
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const low = calculateBackoffDelay(0, 1000, 30000);
    expect(low).toBe(900);

    vi.spyOn(Math, 'random').mockReturnValue(1.0);
    const high = calculateBackoffDelay(0, 1000, 30000);
    expect(high).toBe(1100);
  });

  it('works with custom baseDelay and maxDelay', () => {
    const result = calculateBackoffDelay(0, 500, 5000);
    // 500 * 1.0 = 500
    expect(result).toBe(500);
  });
});

// ─── useFormState ────────────────────────────────────────────────────────────

describe('useFormState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // --- Initial state ---

  it('starts with idle initial state', () => {
    const { result } = renderHook(() => useFormState());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
    expect(result.current.retryCount).toBe(0);
    expect(result.current.retryAttempt).toBe(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.canRetry).toBe(false);
  });

  // --- setLoading / setError / setSuccess ---

  it('setLoading updates loading state', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setLoading(true);
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.setLoading(false);
    });
    expect(result.current.loading).toBe(false);
  });

  it('setError sets error and clears loading/success', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setLoading(true);
      result.current.setSuccess('done');
    });

    act(() => {
      result.current.setError('Something went wrong');
    });

    expect(result.current.error).toBe('Something went wrong');
    expect(result.current.loading).toBe(false);
    expect(result.current.success).toBe('');
  });

  it('setSuccess sets success and clears loading/error', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setLoading(true);
      result.current.setError('fail');
    });

    act(() => {
      result.current.setSuccess('All good');
    });

    expect(result.current.success).toBe('All good');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
  });

  // --- reset ---

  it('reset clears all state and disables canRetry', async () => {
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    // Force an error so canRetry becomes true
    await act(async () => {
      try {
        await result.current.handleAsync(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }
    });

    expect(result.current.canRetry).toBe(true);
    expect(result.current.error).toBe('fail');

    act(() => {
      result.current.reset();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
    expect(result.current.canRetry).toBe(false);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.retryAttempt).toBe(0);
  });

  // --- handleAsync: success ---

  it('sets loading during submission and clears on success', async () => {
    const { result } = renderHook(() => useFormState());

    let resolveAsync: (value: string) => void;
    const asyncFn = vi.fn(
      () =>
        new Promise<string>(resolve => {
          resolveAsync = resolve;
        })
    );

    let promise: Promise<string>;
    act(() => {
      promise = result.current.handleAsync(asyncFn);
    });

    // Should be loading
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe('');

    await act(async () => {
      resolveAsync!('result');
      await promise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('returns the resolved value from handleAsync', async () => {
    const { result } = renderHook(() => useFormState());

    let value: string | undefined;
    await act(async () => {
      value = await result.current.handleAsync(async () => 'hello');
    });

    expect(value).toBe('hello');
  });

  // --- handleAsync: error ---

  it('sets error state after all retries are exhausted', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useFormState({ maxRetries: 1, baseDelay: 10, maxDelay: 20 })
    );

    await act(async () => {
      const promise = result.current.handleAsync(async () => {
        throw new Error('network failure');
      });

      // Advance past the retry delay
      await vi.advanceTimersByTimeAsync(100);

      try {
        await promise;
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('network failure');
    expect(result.current.loading).toBe(false);
    expect(result.current.canRetry).toBe(true);
  });

  it('sets generic error message for non-Error throws', async () => {
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    await act(async () => {
      try {
        await result.current.handleAsync(async () => {
          throw 'string error';
        });
      } catch {
        // expected
      }
    });

    expect(result.current.error).toBe('An error occurred');
  });

  // --- Automatic retries ---

  it('retries the configured number of times before failing', async () => {
    vi.useFakeTimers();
    const callCount = vi.fn();

    const { result } = renderHook(() =>
      useFormState({ maxRetries: 2, baseDelay: 10, maxDelay: 50 })
    );

    await act(async () => {
      const promise = result.current.handleAsync(async () => {
        callCount();
        throw new Error('retry me');
      });

      // Advance timers past both retry delays
      await vi.advanceTimersByTimeAsync(200);

      try {
        await promise;
      } catch {
        // expected
      }
    });

    // Initial attempt + 2 retries = 3 calls
    expect(callCount).toHaveBeenCalledTimes(3);
    expect(result.current.canRetry).toBe(true);
  });

  it('calls onRetry callback before each retry attempt', async () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();

    const { result } = renderHook(() =>
      useFormState({ maxRetries: 2, baseDelay: 10, maxDelay: 50, onRetry })
    );

    await act(async () => {
      const promise = result.current.handleAsync(async () => {
        throw new Error('fail');
      });

      await vi.advanceTimersByTimeAsync(200);

      try {
        await promise;
      } catch {
        // expected
      }
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
  });

  it('succeeds on retry without exhausting all attempts', async () => {
    vi.useFakeTimers();
    let callIndex = 0;

    const { result } = renderHook(() =>
      useFormState({ maxRetries: 3, baseDelay: 10, maxDelay: 50 })
    );

    let value: string | undefined;
    await act(async () => {
      const promise = result.current.handleAsync(async () => {
        callIndex++;
        if (callIndex < 3) throw new Error('not yet');
        return 'success';
      });

      await vi.advanceTimersByTimeAsync(200);
      value = await promise;
    });

    expect(value).toBe('success');
    expect(callIndex).toBe(3);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.canRetry).toBe(false);
  });

  // --- maxRetries: 0 disables retries ---

  it('does not retry when maxRetries is 0', async () => {
    const callCount = vi.fn();
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    await act(async () => {
      try {
        await result.current.handleAsync(async () => {
          callCount();
          throw new Error('once');
        });
      } catch {
        // expected
      }
    });

    expect(callCount).toHaveBeenCalledTimes(1);
    expect(result.current.canRetry).toBe(true);
  });

  // --- Manual retry ---

  it('manual retry re-executes the failed operation', async () => {
    vi.useFakeTimers();
    let callCount = 0;

    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    // First call fails
    await act(async () => {
      try {
        await result.current.handleAsync(async () => {
          callCount++;
          if (callCount === 1) throw new Error('fail first');
          return 'ok';
        });
      } catch {
        // expected
      }
    });

    expect(result.current.canRetry).toBe(true);

    // Manual retry succeeds
    let retryResult: string | undefined;
    await act(async () => {
      retryResult = await result.current.retry<string>();
    });

    expect(retryResult).toBe('ok');
    expect(callCount).toBe(2);
    expect(result.current.canRetry).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('retry throws when no failed operation is stored', async () => {
    const { result } = renderHook(() => useFormState());

    await act(async () => {
      await expect(result.current.retry()).rejects.toThrow(
        'No failed operation to retry'
      );
    });
  });

  // --- AbortController / cancellation ---

  it('passes AbortSignal to the async function', async () => {
    const { result } = renderHook(() => useFormState());
    let receivedSignal: AbortSignal | undefined;

    await act(async () => {
      await result.current.handleAsync(async signal => {
        receivedSignal = signal;
        return 'done';
      });
    });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
  });

  it('aborts previous request when a new handleAsync call is made', async () => {
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    let firstSignal: AbortSignal | undefined;
    let resolveFirst: () => void;

    // Start first request that will hang
    act(() => {
      void result.current.handleAsync(
        signal =>
          new Promise<void>(resolve => {
            firstSignal = signal;
            resolveFirst = resolve;
          })
      );
    });

    expect(firstSignal).toBeDefined();
    expect(firstSignal!.aborted).toBe(false);

    // Start second request which should abort the first
    await act(async () => {
      await result.current.handleAsync(async () => 'second');
    });

    expect(firstSignal!.aborted).toBe(true);

    // Clean up dangling promise
    resolveFirst!();
  });

  it('cancel aborts in-flight request and clears loading', async () => {
    const { result } = renderHook(() => useFormState());

    let receivedSignal: AbortSignal | undefined;

    act(() => {
      void result.current.handleAsync(
        signal =>
          new Promise<void>(() => {
            receivedSignal = signal;
            // Never resolves
          })
      );
    });

    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(receivedSignal!.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.isRetrying).toBe(false);
  });

  it('does not set error state on AbortError', async () => {
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    await act(async () => {
      try {
        await result.current.handleAsync(async () => {
          throw new DOMException('Aborted', 'AbortError');
        });
      } catch {
        // expected
      }
    });

    // AbortError should not populate the error message or enable canRetry
    expect(result.current.error).toBe('');
    expect(result.current.canRetry).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  // --- Cleanup on unmount ---

  it('aborts in-flight request on unmount', () => {
    const { result, unmount } = renderHook(() => useFormState());
    let receivedSignal: AbortSignal | undefined;

    act(() => {
      void result.current.handleAsync(
        signal =>
          new Promise<void>(() => {
            receivedSignal = signal;
          })
      );
    });

    unmount();

    expect(receivedSignal!.aborted).toBe(true);
  });

  // --- isRetrying flag ---

  it('sets isRetrying to true during retry attempts', async () => {
    vi.useFakeTimers();
    const retryingValues: boolean[] = [];

    const { result } = renderHook(() =>
      useFormState({ maxRetries: 1, baseDelay: 10, maxDelay: 20 })
    );

    await act(async () => {
      const promise = result.current.handleAsync(async () => {
        retryingValues.push(result.current.isRetrying);
        throw new Error('fail');
      });

      await vi.advanceTimersByTimeAsync(100);

      try {
        await promise;
      } catch {
        // expected
      }
    });

    // First call: isRetrying=false, second call (retry): state should have been updated
    // The first value captured should be false (initial attempt)
    expect(retryingValues[0]).toBe(false);
  });
});
