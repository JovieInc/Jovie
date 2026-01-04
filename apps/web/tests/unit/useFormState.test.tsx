import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateBackoffDelay, useFormState } from '@/lib/hooks/useFormState';

describe('useFormState', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes with a clean state', () => {
    const { result } = renderHook(() => useFormState());

    expect(result.current).toMatchObject({
      loading: false,
      error: '',
      success: '',
      retryAttempt: 0,
      retryCount: 0,
      isRetrying: false,
      canRetry: false,
    });
  });

  it('handles successful async work and clears loading', async () => {
    const mockAsync = vi.fn().mockResolvedValue('done');
    const { result } = renderHook(() => useFormState());

    let response: string | undefined;
    await act(async () => {
      response = await result.current.handleAsync(mockAsync);
    });

    expect(response).toBe('done');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.canRetry).toBe(false);
    expect(mockAsync).toHaveBeenCalledTimes(1);
  });

  it('retries failures before surfacing the final error', async () => {
    vi.useFakeTimers();
    const error = new Error('network');
    const failing = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();
    const { result } = renderHook(() =>
      useFormState({ maxRetries: 1, baseDelay: 1, maxDelay: 5, onRetry })
    );

    let promise: Promise<unknown>;
    await act(async () => {
      promise = result.current.handleAsync(failing);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await expect(promise!).rejects.toThrow('network');
    expect(failing).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, error);
    expect(result.current.error).toBe('network');
    expect(result.current.canRetry).toBe(true);
    expect(result.current.isRetrying).toBe(false);
  });

  it('normalizes non-Error rejections', async () => {
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    await act(async () => {
      await expect(
        result.current.handleAsync(() => Promise.reject('bad'))
      ).rejects.toBe('bad');
    });

    expect(result.current.error).toBe('An error occurred');
    expect(result.current.canRetry).toBe(true);
  });

  it('allows manual retry after a stored failure', async () => {
    const asyncFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce('second');
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    await act(async () => {
      await expect(result.current.handleAsync(asyncFn)).rejects.toThrow(
        'first'
      );
    });
    expect(result.current.canRetry).toBe(true);

    let retryResult: string | undefined;
    await act(async () => {
      retryResult = await result.current.retry<string>();
    });

    expect(retryResult).toBe('second');
    expect(asyncFn).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('');
    expect(result.current.canRetry).toBe(false);
  });

  it('aborts in-flight work when cancelled', async () => {
    const abortingAsync = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    const { result } = renderHook(() => useFormState());

    let promise: Promise<unknown>;
    await act(async () => {
      promise = result.current.handleAsync(abortingAsync);
    });

    await act(async () => {
      result.current.cancel();
    });

    await expect(promise!).rejects.toThrow('Aborted');
    expect(result.current.loading).toBe(false);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.canRetry).toBe(false);
  });
});

describe('calculateBackoffDelay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies exponential backoff with jitter within expected bounds', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = calculateBackoffDelay(2, 100, 300);

    expect(delay).toBe(270); // 300 (capped) * 0.9 jitter
    randomSpy.mockRestore();
  });

  it('never exceeds jittered max cap', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(1);
    const delay = calculateBackoffDelay(0, 50, 50);

    expect(delay).toBeLessThanOrEqual(55);
    randomSpy.mockRestore();
  });
});
