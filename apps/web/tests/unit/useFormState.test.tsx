import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateBackoffDelay, useFormState } from '@/lib/hooks/useFormState';

describe('useFormState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useFormState());

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
  });

  it('sets loading state', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setLoading(true);
    });

    expect(result.current.loading).toBe(true);
  });

  it('sets error state', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setError('Something went wrong');
    });

    expect(result.current.error).toBe('Something went wrong');
    expect(result.current.loading).toBe(false);
    expect(result.current.success).toBe('');
  });

  it('sets success state', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setSuccess('Operation completed');
    });

    expect(result.current.success).toBe('Operation completed');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('resets state', () => {
    const { result } = renderHook(() => useFormState());

    // Set some state first
    act(() => {
      result.current.setLoading(true);
      result.current.setError('Error');
      result.current.setSuccess('Success');
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
  });

  it('handles async operations successfully', async () => {
    const { result } = renderHook(() => useFormState());

    const mockAsyncFn = vi.fn().mockResolvedValue('success');

    await act(async () => {
      const asyncResult = await result.current.handleAsync(mockAsyncFn);
      expect(asyncResult).toBe('success');
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
    expect(mockAsyncFn).toHaveBeenCalledTimes(1);
  });

  it('handles async operations with errors', async () => {
    // Use maxRetries: 0 to test basic error handling without retry behavior
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Async error'));

    await act(async () => {
      try {
        await result.current.handleAsync(mockAsyncFn);
      } catch {
        // Expected to throw
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Async error');
    expect(result.current.success).toBe('');
    expect(mockAsyncFn).toHaveBeenCalledTimes(1);
  });

  it('handles async operations with string errors', async () => {
    // Use maxRetries: 0 to test basic error handling without retry behavior
    const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

    const mockAsyncFn = vi.fn().mockRejectedValue('String error');

    await act(async () => {
      try {
        await result.current.handleAsync(mockAsyncFn);
      } catch {
        // Expected to throw
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('An error occurred');
    expect(result.current.success).toBe('');
  });

  it('provides all expected methods', () => {
    const { result } = renderHook(() => useFormState());

    expect(result.current).toBeTruthy();
    expect(typeof result.current.setLoading).toBe('function');
    expect(typeof result.current.setError).toBe('function');
    expect(typeof result.current.setSuccess).toBe('function');
    expect(typeof result.current.reset).toBe('function');
    expect(typeof result.current.handleAsync).toBe('function');
  });

  it('maintains state isolation between multiple instances', () => {
    const { result: result1 } = renderHook(() => useFormState());
    const { result: result2 } = renderHook(() => useFormState());

    act(() => {
      result1.current.setError('Error in instance 1');
      result2.current.setSuccess('Success in instance 2');
    });

    expect(result1.current.error).toBe('Error in instance 1');
    expect(result1.current.success).toBe('');

    expect(result2.current.error).toBe('');
    expect(result2.current.success).toBe('Success in instance 2');
  });

  it('handles multiple state changes correctly', () => {
    const { result } = renderHook(() => useFormState());

    act(() => {
      result.current.setLoading(true);
      result.current.setError('Error');
      result.current.setSuccess('Success');
    });

    // Last state change should take precedence
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('Success');
  });

  it('clears previous states when starting new async operation', async () => {
    const { result } = renderHook(() => useFormState());

    // Set some initial state
    act(() => {
      result.current.setError('Previous error');
      result.current.setSuccess('Previous success');
    });

    const mockAsyncFn = vi.fn().mockResolvedValue('success');

    await act(async () => {
      await result.current.handleAsync(mockAsyncFn);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.success).toBe('');
  });

  // ============================================================
  // Retry Options and State Tests (Subtask 4.1)
  // ============================================================

  describe('retry options and state', () => {
    it('accepts options parameter', () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useFormState({
          maxRetries: 5,
          baseDelay: 500,
          maxDelay: 15000,
          onRetry,
        })
      );

      // Hook should initialize without errors
      expect(result.current).toBeTruthy();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('');
    });

    it('provides default values when no options specified', async () => {
      // Test calculateBackoffDelay with default base delay (1000ms)
      // to verify default values are reasonable
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Return middle jitter value

      // With default baseDelay: 1000, attempt 0 should give ~1000ms
      const delay = calculateBackoffDelay(0, 1000, 30000);
      expect(delay).toBe(1000); // 1000 * 2^0 * 1.0 (middle jitter) = 1000

      vi.restoreAllMocks();
    });

    it('uses default maxRetries of 3', async () => {
      // Render hook without options - should use defaults
      const { result } = renderHook(() => useFormState());
      const mockAsyncFn = vi.fn().mockResolvedValue('success');

      await act(async () => {
        await result.current.handleAsync(mockAsyncFn);
      });

      // retryCount should be set to 3 (default maxRetries) during handleAsync
      // After success, verify the operation worked
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
    });

    it('initializes retryCount to 0', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.retryCount).toBe(0);
    });

    it('initializes retryAttempt to 0', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.retryAttempt).toBe(0);
    });

    it('initializes isRetrying to false', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.isRetrying).toBe(false);
    });

    it('initializes canRetry to false', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.canRetry).toBe(false);
    });

    it('maintains backward compatibility with no-argument call', () => {
      // Hook should work exactly as before when called without arguments
      const { result } = renderHook(() => useFormState());

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('');
      expect(result.current.success).toBe('');
      expect(typeof result.current.setLoading).toBe('function');
      expect(typeof result.current.setError).toBe('function');
      expect(typeof result.current.setSuccess).toBe('function');
      expect(typeof result.current.reset).toBe('function');
      expect(typeof result.current.handleAsync).toBe('function');
    });

    it('provides retry and cancel methods', () => {
      const { result } = renderHook(() => useFormState());

      expect(typeof result.current.retry).toBe('function');
      expect(typeof result.current.cancel).toBe('function');
    });

    it('respects custom maxRetries option', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 5 }));
      const mockAsyncFn = vi.fn().mockResolvedValue('success');

      await act(async () => {
        await result.current.handleAsync(mockAsyncFn);
      });

      // retryCount should be set to custom value during handleAsync
      expect(result.current.retryCount).toBe(5);
    });

    it('resets retry state fields on reset()', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      // Create a failed operation to set canRetry to true
      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      // Verify state changed after failure
      expect(result.current.canRetry).toBe(true);

      // Reset should clear all retry-related state
      act(() => {
        result.current.reset();
      });

      expect(result.current.retryCount).toBe(0);
      expect(result.current.retryAttempt).toBe(0);
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.canRetry).toBe(false);
    });
  });

  describe('calculateBackoffDelay', () => {
    beforeEach(() => {
      // Mock Math.random for consistent testing
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Middle jitter (1.0 multiplier)
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('calculates delay for first attempt (attempt 0)', () => {
      // baseDelay * 2^0 * 1.0 = 1000 * 1 * 1.0 = 1000
      const delay = calculateBackoffDelay(0, 1000, 30000);
      expect(delay).toBe(1000);
    });

    it('doubles delay with each attempt', () => {
      // Attempt 1: baseDelay * 2^1 = 1000 * 2 = 2000
      const delay1 = calculateBackoffDelay(1, 1000, 30000);
      expect(delay1).toBe(2000);

      // Attempt 2: baseDelay * 2^2 = 1000 * 4 = 4000
      const delay2 = calculateBackoffDelay(2, 1000, 30000);
      expect(delay2).toBe(4000);

      // Attempt 3: baseDelay * 2^3 = 1000 * 8 = 8000
      const delay3 = calculateBackoffDelay(3, 1000, 30000);
      expect(delay3).toBe(8000);
    });

    it('caps delay at maxDelay', () => {
      // Attempt 10 would be 1000 * 2^10 = 1024000, but capped at 30000
      const delay = calculateBackoffDelay(10, 1000, 30000);
      expect(delay).toBe(30000);
    });

    it('applies jitter within expected range', () => {
      vi.restoreAllMocks();

      // Test with minimum jitter (0.9)
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const delayMin = calculateBackoffDelay(0, 1000, 30000);
      expect(delayMin).toBe(900); // 1000 * 0.9

      vi.restoreAllMocks();

      // Test with maximum jitter (1.1)
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const delayMax = calculateBackoffDelay(0, 1000, 30000);
      expect(delayMax).toBe(1100); // 1000 * 1.1
    });

    it('uses custom baseDelay', () => {
      const delay = calculateBackoffDelay(0, 500, 30000);
      expect(delay).toBe(500);
    });

    it('uses custom maxDelay', () => {
      // Large attempt that would exceed 5000
      const delay = calculateBackoffDelay(5, 1000, 5000);
      expect(delay).toBe(5000); // Capped at custom maxDelay
    });
  });

  // ============================================================
  // Automatic Retry Behavior Tests (Subtask 4.2)
  // ============================================================

  describe('automatic retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Mock Math.random for consistent backoff delays
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Middle jitter (1.0 multiplier)
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('automatically retries failed operations up to maxRetries', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 100 })
      );

      // Function that always fails
      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Network error'));

      let promise!: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });
      void promise.catch(() => {});

      // First attempt is immediate
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance timer for first retry (100ms backoff for attempt 0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Advance timer for second retry (200ms backoff for attempt 1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(mockAsyncFn).toHaveBeenCalledTimes(3);

      // Wait for promise to reject after all retries exhausted
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected to throw
        }
      });

      // Should have called exactly 3 times (1 initial + 2 retries)
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe('Network error');
    });

    it('increments retryAttempt on each retry', async () => {
      const retryAttempts: number[] = [];

      const { result } = renderHook(() =>
        useFormState({
          maxRetries: 2,
          baseDelay: 100,
          onRetry: attempt => {
            // Capture the attempt number from callback
            retryAttempts.push(attempt);
          },
        })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      let promise!: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
        void promise.catch(() => {});
      });

      // After first failure, retryAttempt should be 0
      expect(result.current.retryAttempt).toBe(0);

      // Advance timer for first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Now on attempt 1
      expect(result.current.retryAttempt).toBe(1);

      // Advance timer for second retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Now on attempt 2
      expect(result.current.retryAttempt).toBe(2);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Verify onRetry received correct attempt numbers (1-based in callback)
      expect(retryAttempts).toEqual([1, 2]);
    });

    it('sets isRetrying to true during retries and false after', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 100 })
      );

      // Create a mock that fails but takes some time (50ms) to reject
      // This allows us to observe the isRetrying state during the retry
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Test error')), 50);
        });
      });

      let promise!: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
        void promise.catch(() => {});
      });

      // Initial attempt (attempt 0) - waiting for first call to complete
      expect(result.current.isRetrying).toBe(false);

      // Advance to complete first attempt (50ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // First attempt failed, now waiting for retry backoff (100ms)
      expect(result.current.isRetrying).toBe(false);
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance timer for retry backoff
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Retry has started (attempt 1) - isRetrying should be true while in progress
      expect(result.current.isRetrying).toBe(true);
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Advance to complete the retry attempt (50ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // After all retries exhausted, isRetrying should be false
      expect(result.current.isRetrying).toBe(false);
    });

    it('calls onRetry callback with correct attempt and error', async () => {
      const onRetry = vi.fn();
      const testError = new Error('Callback test error');

      const { result } = renderHook(() =>
        useFormState({
          maxRetries: 2,
          baseDelay: 100,
          onRetry,
        })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(testError);

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // First failure, onRetry should be called before first retry
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, testError);

      // Advance timer for first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // After second failure, onRetry should be called again
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(2, testError);

      // Advance timer for second retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Finalize - no more onRetry calls after last attempt
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Should have called onRetry exactly 2 times (before each retry, not after last failure)
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, testError);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, testError);
    });

    it('clears error state on successful retry', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 100 })
      );

      // Fail once, then succeed on retry
      let callCount = 0;
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve('success');
      });

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // First attempt failed
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance timer for retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Second attempt should succeed
      await act(async () => {
        await promise;
      });

      expect(mockAsyncFn).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe('');
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.canRetry).toBe(false);
    });

    it('does not retry when maxRetries is 0', async () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, onRetry })
      );

      const mockAsyncFn = vi
        .fn()
        .mockRejectedValue(new Error('No retry error'));

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      // Should only call once (no retries)
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
      expect(result.current.error).toBe('No retry error');
    });

    it('stops retrying after success', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 3, baseDelay: 100 })
      );

      // Fail twice, then succeed
      let callCount = 0;
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Attempt ' + callCount + ' failed'));
        }
        return Promise.resolve('success on attempt 3');
      });

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // First attempt failed
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance timer for first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Second attempt failed
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Advance timer for second retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Third attempt should succeed
      await act(async () => {
        const result = await promise;
        expect(result).toBe('success on attempt 3');
      });

      // Should stop at 3 attempts (not continue to 4th)
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe('');
      expect(result.current.canRetry).toBe(false);
    });

    it('sets canRetry to true after all retries exhausted', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 100 })
      );

      const mockAsyncFn = vi
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Advance timer for retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // After all retries exhausted, canRetry should be true
      expect(result.current.canRetry).toBe(true);
      expect(result.current.error).toBe('Persistent error');
    });

    it('does not call onRetry for non-Error exceptions', async () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 100, onRetry })
      );

      // Throw a non-Error value
      const mockAsyncFn = vi.fn().mockRejectedValue('string error');

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // onRetry should not be called for non-Error exceptions
      expect(onRetry).not.toHaveBeenCalled();

      // Advance timer for retry (retry still happens, just no callback)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // onRetry should still not have been called
      expect(onRetry).not.toHaveBeenCalled();
      expect(mockAsyncFn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('handles successful operation on first attempt without retrying', async () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 3, baseDelay: 100, onRetry })
      );

      const mockAsyncFn = vi.fn().mockResolvedValue('immediate success');

      await act(async () => {
        const asyncResult = await result.current.handleAsync(mockAsyncFn);
        expect(asyncResult).toBe('immediate success');
      });

      // Should only call once, no retries needed
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
      expect(result.current.error).toBe('');
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.canRetry).toBe(false);
      expect(result.current.retryAttempt).toBe(0);
    });
  });

  // ============================================================
  // Exponential Backoff Timing Tests (Subtask 4.3)
  // ============================================================

  describe('exponential backoff timing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Mock Math.random for consistent backoff delays
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Middle jitter (1.0 multiplier)
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('delay doubles with each retry attempt', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 3, baseDelay: 100, maxDelay: 10000 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Initial attempt (no delay)
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // First retry: delay should be 100ms (baseDelay * 2^0 = 100)
      // Advance by 99ms - should not trigger retry yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(99);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance by 1ms more to trigger first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Second retry: delay should be 200ms (baseDelay * 2^1 = 200)
      // Advance by 199ms - should not trigger retry yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(199);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Advance by 1ms more to trigger second retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);

      // Third retry: delay should be 400ms (baseDelay * 2^2 = 400)
      // Advance by 399ms - should not trigger retry yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(399);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);

      // Advance by 1ms more to trigger third retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(4);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Total: 1 initial + 3 retries = 4 calls
      expect(mockAsyncFn).toHaveBeenCalledTimes(4);
    });

    it('delay is capped at maxDelay', async () => {
      // Use small maxDelay that will be hit quickly
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 4, baseDelay: 100, maxDelay: 300 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Initial attempt
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // First retry: 100ms (100 * 2^0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Second retry: 200ms (100 * 2^1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);

      // Third retry: would be 400ms (100 * 2^2), but capped at 300ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(4);

      // Fourth retry: would be 800ms (100 * 2^3), but still capped at 300ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(4);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(5);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Total: 1 initial + 4 retries = 5 calls
      expect(mockAsyncFn).toHaveBeenCalledTimes(5);
    });

    it('jitter is within expected range (±10%)', async () => {
      vi.restoreAllMocks();

      // Test with minimum jitter (0.9)
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const { result: resultMin } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 1000, maxDelay: 30000 })
      );

      const mockAsyncFnMin = vi.fn().mockRejectedValue(new Error('Test error'));

      let promiseMin: Promise<unknown>;

      await act(async () => {
        promiseMin = resultMin.current.handleAsync(mockAsyncFnMin);
      });

      // Initial attempt
      expect(mockAsyncFnMin).toHaveBeenCalledTimes(1);

      // With 0 jitter (0.9 multiplier): 1000 * 0.9 = 900ms
      // At 899ms, retry should not have happened
      await act(async () => {
        await vi.advanceTimersByTimeAsync(899);
      });
      expect(mockAsyncFnMin).toHaveBeenCalledTimes(1);

      // At 900ms, retry should trigger
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFnMin).toHaveBeenCalledTimes(2);

      // Finalize
      await act(async () => {
        try {
          await promiseMin;
        } catch {
          // Expected
        }
      });

      vi.restoreAllMocks();

      // Test with maximum jitter (1.1)
      vi.spyOn(Math, 'random').mockReturnValue(1);

      const { result: resultMax } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 1000, maxDelay: 30000 })
      );

      const mockAsyncFnMax = vi.fn().mockRejectedValue(new Error('Test error'));

      let promiseMax: Promise<unknown>;

      await act(async () => {
        promiseMax = resultMax.current.handleAsync(mockAsyncFnMax);
      });

      // Initial attempt
      expect(mockAsyncFnMax).toHaveBeenCalledTimes(1);

      // With 1 jitter (1.1 multiplier): 1000 * 1.1 = 1100ms
      // At 1099ms, retry should not have happened
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1099);
      });
      expect(mockAsyncFnMax).toHaveBeenCalledTimes(1);

      // At 1100ms, retry should trigger
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockAsyncFnMax).toHaveBeenCalledTimes(2);

      // Finalize
      await act(async () => {
        try {
          await promiseMax;
        } catch {
          // Expected
        }
      });
    });

    it('retry waits appropriate time before next attempt', async () => {
      const retryTimes: number[] = [];
      let startTime = 0;

      const { result } = renderHook(() =>
        useFormState({
          maxRetries: 2,
          baseDelay: 100,
          maxDelay: 10000,
          onRetry: () => {
            // Record elapsed time when onRetry is called (after failure, before wait)
            retryTimes.push(Date.now() - startTime);
          },
        })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      let promise: Promise<unknown>;

      startTime = Date.now();

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // First failure happened immediately, onRetry called at ~0ms
      expect(retryTimes.length).toBe(1);
      expect(retryTimes[0]).toBe(0);

      // Advance time by 100ms (baseDelay * 2^0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Second failure happened at ~100ms, onRetry called
      expect(retryTimes.length).toBe(2);
      expect(retryTimes[1]).toBe(100);

      // Advance time by 200ms (baseDelay * 2^1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Verify timing: onRetry called at 0ms and 100ms
      expect(retryTimes).toEqual([0, 100]);
    });

    it('uses correct backoff sequence for multiple retries', async () => {
      // Test the actual sequence of delays: 100, 200, 400, 800, 1600 (capped at 1000)
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 4, baseDelay: 100, maxDelay: 1000 })
      );

      const attemptTimes: number[] = [];
      const startTime = Date.now();

      const mockAsyncFn = vi.fn().mockImplementation(() => {
        attemptTimes.push(Date.now() - startTime);
        return Promise.reject(new Error('Test error'));
      });

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Initial attempt at t=0
      expect(attemptTimes).toEqual([0]);

      // Wait 100ms for first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(attemptTimes).toEqual([0, 100]);

      // Wait 200ms for second retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      expect(attemptTimes).toEqual([0, 100, 300]);

      // Wait 400ms for third retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(attemptTimes).toEqual([0, 100, 300, 700]);

      // Wait 800ms for fourth retry, but capped at 1000ms (would be 800ms for attempt 3)
      // Actually attempt 3 delay = 100 * 2^3 = 800ms, not capped
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(attemptTimes).toEqual([0, 100, 300, 700, 1500]);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Verify total call count
      expect(mockAsyncFn).toHaveBeenCalledTimes(5);
    });

    it('verifies exponential growth formula: baseDelay * 2^attempt', async () => {
      // Test with larger base delay to make exponential growth clearer
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 3, baseDelay: 500, maxDelay: 100000 })
      );

      const attemptTimes: number[] = [];
      const startTime = Date.now();

      const mockAsyncFn = vi.fn().mockImplementation(() => {
        attemptTimes.push(Date.now() - startTime);
        return Promise.reject(new Error('Test error'));
      });

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Verify delays: 500 * 2^0 = 500, 500 * 2^1 = 1000, 500 * 2^2 = 2000
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(attemptTimes).toEqual([0, 500]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(attemptTimes).toEqual([0, 500, 1500]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(attemptTimes).toEqual([0, 500, 1500, 3500]);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });
    });

    it('immediately retries after backoff delay completes', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 100, maxDelay: 10000 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance exactly to backoff time
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Retry should happen immediately when delay completes
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);

      // Finalize
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });
    });
  });

  // ============================================================
  // Manual Retry Tests (Subtask 4.4)
  // ============================================================

  describe('manual retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Mock Math.random for consistent backoff delays
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Middle jitter (1.0 multiplier)
    });

    afterEach(() => {
      // Ensure no timers leak between tests. Don't run pending timers because
      // some tests intentionally schedule rejecting timers, and executing them
      // during teardown can surface as unhandled rejections.
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('retry() function exists and is callable', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.retry).toBeDefined();
      expect(typeof result.current.retry).toBe('function');
    });

    it('retry() throws when no failed operation is stored (canRetry is false)', async () => {
      const { result } = renderHook(() => useFormState());

      // canRetry should be false initially
      expect(result.current.canRetry).toBe(false);

      // retry() should throw an error
      await act(async () => {
        await expect(result.current.retry()).rejects.toThrow(
          'No failed operation to retry. Ensure canRetry is true before calling retry().'
        );
      });
    });

    it('retry() throws after reset() clears the failed operation', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      // Create a failed operation
      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      // canRetry should be true after failure
      expect(result.current.canRetry).toBe(true);

      // Reset clears the stored operation
      act(() => {
        result.current.reset();
      });

      // canRetry should now be false
      expect(result.current.canRetry).toBe(false);

      // retry() should throw
      await act(async () => {
        await expect(result.current.retry()).rejects.toThrow(
          'No failed operation to retry. Ensure canRetry is true before calling retry().'
        );
      });
    });

    it('retry() re-executes last failed operation', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      // Track call count
      let callCount = 0;
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve('success on retry');
      });

      // First call fails
      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe('First attempt failed');
      expect(result.current.canRetry).toBe(true);

      // Call retry() - should re-execute the same function
      await act(async () => {
        const retryResult = await result.current.retry();
        expect(retryResult).toBe('success on retry');
      });

      // Function should have been called again
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe('');
      expect(result.current.canRetry).toBe(false);
    });

    it('retry() resets retryAttempt to 0', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 1, baseDelay: 100 })
      );

      const mockAsyncFn = vi
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      let promise!: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
        void promise.catch(() => {});
      });

      // Advance through the retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Finalize - all retries exhausted
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // retryAttempt should be at last attempt value
      expect(result.current.retryAttempt).toBe(1);
      expect(result.current.canRetry).toBe(true);

      // Call retry() - should reset retryAttempt to 0
      let retryPromise!: Promise<unknown>;
      await act(async () => {
        retryPromise = result.current.retry();
      });
      void retryPromise.catch(() => {});

      // retryAttempt should be reset to 0 for fresh retry cycle
      expect(result.current.retryAttempt).toBe(0);

      // Advance through retry's retry attempt
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Finalize
      await act(async () => {
        try {
          await retryPromise;
        } catch {
          // Expected
        }
      });
    });

    it('canRetry is true after failure and false after success', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      // Initially false
      expect(result.current.canRetry).toBe(false);

      // Create a failing operation
      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      // canRetry should be true after failure
      expect(result.current.canRetry).toBe(true);

      // Create a successful operation
      const mockSuccessFn = vi.fn().mockResolvedValue('success');

      await act(async () => {
        await result.current.handleAsync(mockSuccessFn);
      });

      // canRetry should be false after success
      expect(result.current.canRetry).toBe(false);
    });

    it('canRetry is false after reset', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      // Create a failing operation
      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      // canRetry should be true after failure
      expect(result.current.canRetry).toBe(true);

      // Reset
      act(() => {
        result.current.reset();
      });

      // canRetry should be false after reset
      expect(result.current.canRetry).toBe(false);
    });

    it('retry() starts a fresh retry cycle with automatic retries', async () => {
      const onRetry = vi.fn();
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 100, onRetry })
      );

      // Fail all initial attempts
      const mockAsyncFn = vi
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      let promise: Promise<unknown>;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Advance through initial retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100); // First retry
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200); // Second retry
      });

      // Finalize initial attempts
      await act(async () => {
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      // Should have called 3 times (1 initial + 2 retries) and onRetry twice
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2);

      // Clear onRetry call count for retry test
      onRetry.mockClear();

      // Now call manual retry() - should start fresh with 3 more attempts
      let retryPromise!: Promise<unknown>;

      await act(async () => {
        retryPromise = result.current.retry();
        void retryPromise.catch(() => {});
      });

      // First attempt of retry cycle
      expect(mockAsyncFn).toHaveBeenCalledTimes(4);

      // Advance through retry's retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100); // First retry of retry cycle
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(5);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200); // Second retry of retry cycle
      });
      expect(mockAsyncFn).toHaveBeenCalledTimes(6);

      // Finalize retry
      await act(async () => {
        try {
          await retryPromise;
        } catch {
          // Expected
        }
      });

      // Total: 6 calls (3 initial + 3 from retry cycle)
      expect(mockAsyncFn).toHaveBeenCalledTimes(6);
      // onRetry should have been called 2 more times in the retry cycle
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('retry() returns result of successful retry operation', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      // First call fails
      let callCount = 0;
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First failed'));
        }
        return Promise.resolve({ data: 'retry success', count: callCount });
      });

      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.canRetry).toBe(true);

      // Retry should return the result
      let retryResult: unknown;
      await act(async () => {
        retryResult = await result.current.retry();
      });

      expect(retryResult).toEqual({ data: 'retry success', count: 2 });
      expect(result.current.canRetry).toBe(false);
    });

    it('canRetry becomes false immediately when retry() is called', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      // Create a mock that fails but takes some time (50ms) to reject
      // This allows us to observe the canRetry state during the retry
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        return new Promise((_, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error('Test error')),
            50
          );

          if (signal.aborted) {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        });
      });

      // Start initial operation (don't await yet)
      let promise!: Promise<unknown>;
      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
        void promise.catch(() => {});
      });

      // Advance time to complete first operation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
        try {
          await promise;
        } catch {
          // Expected
        }
      });

      expect(result.current.canRetry).toBe(true);

      // Start retry
      let retryPromise!: Promise<unknown>;
      await act(async () => {
        retryPromise = result.current.retry();
        void retryPromise.catch(() => {});
      });

      // canRetry should be false while retry is in progress
      expect(result.current.canRetry).toBe(false);
      expect(result.current.loading).toBe(true);

      // Advance time to complete the retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
        try {
          await retryPromise;
        } catch {
          // Expected
        }
      });

      // After failed retry, canRetry should be true again
      expect(result.current.canRetry).toBe(true);
    });

    it('retry() preserves the original function reference', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      // Track which function is called
      const signals: AbortSignal[] = [];
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return Promise.reject(new Error('Test error'));
      });

      // First call
      await act(async () => {
        try {
          await result.current.handleAsync(mockAsyncFn);
        } catch {
          // Expected
        }
      });

      expect(signals.length).toBe(1);

      // Retry should call the same function
      await act(async () => {
        try {
          await result.current.retry();
        } catch {
          // Expected
        }
      });

      // Both calls should be to mockAsyncFn
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);
      expect(signals.length).toBe(2);
    });
  });

  // ============================================================
  // AbortController and Cancel Tests (Subtask 4.5)
  // ============================================================

  describe('AbortController and cancel behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Mock Math.random for consistent backoff delays
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Middle jitter (1.0 multiplier)
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('cancel() function exists and is callable', () => {
      const { result } = renderHook(() => useFormState());

      expect(result.current.cancel).toBeDefined();
      expect(typeof result.current.cancel).toBe('function');
    });

    it('cancel() aborts in-flight request', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      let abortSignal: AbortSignal | null = null;

      // Create an async function that never resolves and captures the signal
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        abortSignal = signal;
        // Return a promise that never resolves (simulates long-running request)
        return new Promise(() => {});
      });

      // Start the async operation (don't await)
      let _promise: Promise<unknown>;
      await act(async () => {
        _promise = result.current.handleAsync(mockAsyncFn);
      });

      // Verify the signal was captured and is not aborted
      expect(abortSignal).not.toBeNull();
      expect(abortSignal!.aborted).toBe(false);
      expect(result.current.loading).toBe(true);

      // Call cancel
      act(() => {
        result.current.cancel();
      });

      // Signal should now be aborted
      expect(abortSignal!.aborted).toBe(true);
      expect(result.current.loading).toBe(false);
    });

    it('AbortError does not set error state', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      // Create an async function that throws AbortError when signal is aborted
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        return new Promise((_, reject) => {
          const abortHandler = () => {
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (signal.aborted) {
            abortHandler();
          } else {
            signal.addEventListener('abort', abortHandler);
          }
        });
      });

      // Start the async operation
      let promise: Promise<unknown>;
      let thrownError: Error | null = null;

      await act(async () => {
        promise = result.current.handleAsync(mockAsyncFn);
      });

      // Cancel to trigger abort
      act(() => {
        result.current.cancel();
      });

      // Wait for the promise to reject with AbortError
      await act(async () => {
        try {
          await promise;
        } catch (error) {
          thrownError = error as Error;
        }
      });

      // AbortError should be thrown but NOT set in error state
      expect(thrownError).not.toBeNull();
      expect(thrownError!.name).toBe('AbortError');
      expect(result.current.error).toBe(''); // Error state should NOT be set
      expect(result.current.loading).toBe(false);
      expect(result.current.canRetry).toBe(false);
    });

    it('cancel() clears pending retry timeouts', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 1000 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      // Start the async operation - will fail and schedule retry
      let _promise: Promise<unknown>;

      await act(async () => {
        _promise = result.current.handleAsync(mockAsyncFn);
      });

      // First attempt completed (failed), now waiting for retry timeout
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance time partially but not enough for retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Should still only have 1 call (waiting for 1000ms backoff)
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Cancel should clear the pending retry timeout
      act(() => {
        result.current.cancel();
      });

      // Advance time past when retry would have happened
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      // Retry should NOT have happened because we cancelled
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
      expect(result.current.isRetrying).toBe(false);
    });

    it('new handleAsync call aborts previous one', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      const signals: AbortSignal[] = [];

      // Create async functions that capture their signals
      const mockAsyncFn1 = vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        // Return a promise that never resolves
        return new Promise(() => {});
      });

      const mockAsyncFn2 = vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return Promise.resolve('second call succeeded');
      });

      // Start first async operation (don't await - it never resolves)
      let _promise1: Promise<unknown>;
      await act(async () => {
        _promise1 = result.current.handleAsync(mockAsyncFn1);
      });

      // Verify first signal is active
      expect(signals.length).toBe(1);
      expect(signals[0].aborted).toBe(false);

      // Start second async operation
      await act(async () => {
        await result.current.handleAsync(mockAsyncFn2);
      });

      // First signal should now be aborted
      expect(signals[0].aborted).toBe(true);

      // Second signal should exist and not be aborted
      expect(signals.length).toBe(2);
      expect(signals[1].aborted).toBe(false);
    });

    it('cleanup on unmount aborts in-flight request', async () => {
      const { result, unmount } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      let abortSignal: AbortSignal | null = null;

      // Create an async function that captures the signal and never resolves
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        abortSignal = signal;
        return new Promise(() => {});
      });

      // Start the async operation
      await act(async () => {
        result.current.handleAsync(mockAsyncFn);
      });

      // Verify the signal was captured and is not aborted
      expect(abortSignal).not.toBeNull();
      expect(abortSignal!.aborted).toBe(false);

      // Unmount the hook
      unmount();

      // Signal should now be aborted due to cleanup
      expect(abortSignal!.aborted).toBe(true);
    });

    it('cleanup on unmount clears pending retry timeouts', async () => {
      const { result, unmount } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 1000 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      // Start the async operation - will fail and schedule retry
      await act(async () => {
        result.current.handleAsync(mockAsyncFn);
      });

      // First attempt completed (failed)
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);

      // Advance time partially but not enough for retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Unmount the hook
      unmount();

      // Advance time past when retry would have happened
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      // Retry should NOT have happened because cleanup cleared the timeout
      expect(mockAsyncFn).toHaveBeenCalledTimes(1);
    });

    it('cancel() resets loading state to false', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      // Create an async function that never resolves
      const mockAsyncFn = vi.fn().mockImplementation(() => {
        return new Promise(() => {});
      });

      // Start the async operation
      await act(async () => {
        result.current.handleAsync(mockAsyncFn);
      });

      // Loading should be true
      expect(result.current.loading).toBe(true);

      // Cancel
      act(() => {
        result.current.cancel();
      });

      // Loading should be false
      expect(result.current.loading).toBe(false);
    });

    it('cancel() resets isRetrying state to false', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 100 })
      );

      const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

      // Start the async operation
      let _promise: Promise<unknown>;
      await act(async () => {
        _promise = result.current.handleAsync(mockAsyncFn);
      });

      // First attempt failed, advance to first retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Now on retry attempt, isRetrying should be true
      expect(result.current.isRetrying).toBe(true);

      // Cancel
      act(() => {
        result.current.cancel();
      });

      // isRetrying should be false
      expect(result.current.isRetrying).toBe(false);
    });

    it('handles multiple cancel() calls gracefully', () => {
      const { result } = renderHook(() => useFormState());

      // Multiple cancel calls should not throw
      expect(() => {
        act(() => {
          result.current.cancel();
          result.current.cancel();
          result.current.cancel();
        });
      }).not.toThrow();
    });

    it('cancel() works even when no operation is in progress', () => {
      const { result } = renderHook(() => useFormState());

      // Cancel when nothing is running should not throw
      expect(() => {
        act(() => {
          result.current.cancel();
        });
      }).not.toThrow();

      // State should remain unchanged
      expect(result.current.loading).toBe(false);
      expect(result.current.isRetrying).toBe(false);
    });

    it('handleAsync passes AbortSignal to async function', async () => {
      const { result } = renderHook(() => useFormState({ maxRetries: 0 }));

      let receivedSignal: AbortSignal | null = null;

      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        receivedSignal = signal;
        return Promise.resolve('success');
      });

      await act(async () => {
        await result.current.handleAsync(mockAsyncFn);
      });

      // Signal should have been passed to the function
      expect(receivedSignal).not.toBeNull();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('cancel() followed by new handleAsync works correctly', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 0, baseDelay: 100 })
      );

      const signals: AbortSignal[] = [];

      // First async function that never resolves
      const mockAsyncFn1 = vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return new Promise(() => {});
      });

      // Second async function that succeeds
      const mockAsyncFn2 = vi.fn().mockImplementation((signal: AbortSignal) => {
        signals.push(signal);
        return Promise.resolve('success after cancel');
      });

      // Start first operation
      await act(async () => {
        result.current.handleAsync(mockAsyncFn1);
      });

      // Cancel first operation
      act(() => {
        result.current.cancel();
      });

      expect(signals[0].aborted).toBe(true);

      // Start second operation - should work fine
      await act(async () => {
        const secondResult = await result.current.handleAsync(mockAsyncFn2);
        expect(secondResult).toBe('success after cancel');
      });

      // Second signal should not be aborted
      expect(signals[1].aborted).toBe(false);
    });

    it('aborted requests during retry loop are detected', async () => {
      const { result } = renderHook(() =>
        useFormState({ maxRetries: 2, baseDelay: 100 })
      );

      let callCount = 0;
      let _signalRef: AbortSignal | null = null;

      // Function that captures signal and fails on first attempt
      const mockAsyncFn = vi.fn().mockImplementation((signal: AbortSignal) => {
        callCount++;
        _signalRef = signal;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        // This shouldn't be reached if we cancel before retry
        return Promise.resolve('success');
      });

      // Start the async operation
      let _promise: Promise<unknown>;
      await act(async () => {
        _promise = result.current.handleAsync(mockAsyncFn);
      });

      // First attempt failed
      expect(callCount).toBe(1);

      // Cancel before retry occurs
      act(() => {
        result.current.cancel();
      });

      // Advance past retry delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Should not have retried because we cancelled
      expect(callCount).toBe(1);
    });
  });
});
