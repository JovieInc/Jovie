import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useOptimisticMutation } from '../useOptimisticMutation';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('useOptimisticMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should apply optimistic update immediately', async () => {
      const onOptimisticUpdate = vi.fn();
      const onRollback = vi.fn();
      const mutationFn = vi.fn().mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate,
          onRollback,
          showToasts: false,
        })
      );

      await act(async () => {
        await result.current.mutate({ value: 'test' });
      });

      // Optimistic update should be called immediately
      expect(onOptimisticUpdate).toHaveBeenCalledWith({ value: 'test' });
      expect(onOptimisticUpdate).toHaveBeenCalledTimes(1);

      // Rollback should not be called on success
      expect(onRollback).not.toHaveBeenCalled();

      // Mutation function should be called
      expect(mutationFn).toHaveBeenCalledWith(
        { value: 'test' },
        expect.any(AbortSignal)
      );
    });

    it('should set loading state during mutation', async () => {
      const mutationFn = vi.fn(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve({ success: true }), 100);
          })
      );

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: false,
        })
      );

      expect(result.current.isLoading).toBe(false);

      act(() => {
        result.current.mutate({ value: 'test' });
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should call onSuccess callback when mutation succeeds', async () => {
      const onSuccess = vi.fn();
      const mutationFn = vi.fn().mockResolvedValue({ id: 1, name: 'Test' });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          onSuccess,
          showToasts: false,
        })
      );

      await act(async () => {
        await result.current.mutate({ value: 'test' });
      });

      expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'Test' });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error handling and rollback', () => {
    it('should rollback on error after all retries exhausted', async () => {
      const onOptimisticUpdate = vi.fn();
      const onRollback = vi.fn();
      const mutationFn = vi.fn().mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate,
          onRollback,
          retryConfig: { maxRetries: 2, baseDelay: 10, maxDelay: 100 },
          showToasts: false,
        })
      );

      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected to throw
        }
      });

      // Optimistic update should be called once
      expect(onOptimisticUpdate).toHaveBeenCalledTimes(1);

      // Mutation should be attempted 3 times (initial + 2 retries)
      expect(mutationFn).toHaveBeenCalledTimes(3);

      // Rollback should be called after all retries fail
      expect(onRollback).toHaveBeenCalledTimes(1);

      // Error state should be set
      expect(result.current.error).toBe('Server error');
      expect(result.current.canRetry).toBe(true);
    });

    it('should call onError callback on failure', async () => {
      const onError = vi.fn();
      const error = new Error('Test error');
      const mutationFn = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          onError,
          retryConfig: { maxRetries: 1, baseDelay: 10 },
          showToasts: false,
        })
      );

      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected
        }
      });

      // onError should be called for each attempt (initial + retries)
      expect(onError).toHaveBeenCalledWith(error);
      expect(onError).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it('should show error toast on failure when showToasts is true', async () => {
      const mutationFn = vi.fn().mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: { maxRetries: 0 },
          showToasts: true,
          errorMessage: 'Custom error message',
        })
      );

      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected
        }
      });

      expect(toast.error).toHaveBeenCalledWith('Custom error message');
    });

    it('should show success toast when showToasts is true and successMessage is provided', async () => {
      const mutationFn = vi.fn().mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: true,
          successMessage: 'Saved successfully!',
        })
      );

      await act(async () => {
        await result.current.mutate({ value: 'test' });
      });

      expect(toast.success).toHaveBeenCalledWith('Saved successfully!');
    });

    it('should not show success toast when successMessage is not provided', async () => {
      const mutationFn = vi.fn().mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: true,
          // No successMessage
        })
      );

      await act(async () => {
        await result.current.mutate({ value: 'test' });
      });

      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('Retry functionality', () => {
    it('should automatically retry on failure', async () => {
      const mutationFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: { maxRetries: 3, baseDelay: 10, maxDelay: 100 },
          showToasts: false,
        })
      );

      await act(async () => {
        await result.current.mutate({ value: 'test' });
      });

      // Should succeed on third attempt
      expect(mutationFn).toHaveBeenCalledTimes(3);
      expect(result.current.error).toBe('');
      expect(result.current.isLoading).toBe(false);
    });

    it('should track retry attempts', async () => {
      let resolvePromise: (value: unknown) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      const mutationFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockReturnValueOnce(promise);

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: { maxRetries: 2, baseDelay: 10 },
          showToasts: false,
        })
      );

      act(() => {
        result.current.mutate({ value: 'test' });
      });

      // Wait for first failure and retry to start
      await waitFor(() => {
        expect(result.current.isRetrying).toBe(true);
        expect(result.current.retryAttempt).toBe(1);
      });

      // Resolve the retry
      await act(async () => {
        resolvePromise({ success: true });
        await promise;
      });

      expect(result.current.isRetrying).toBe(false);
    });

    it('should allow manual retry after all automatic retries fail', async () => {
      const mutationFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: { maxRetries: 0 },
          showToasts: false,
        })
      );

      // First attempt should fail
      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected
        }
      });

      expect(result.current.canRetry).toBe(true);
      expect(result.current.error).toBe('Fail');

      // Manual retry should succeed
      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.canRetry).toBe(false);
      expect(result.current.error).toBe('');
      expect(mutationFn).toHaveBeenCalledTimes(2);
    });

    it('should throw error when retry() is called without failed mutation', async () => {
      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn: vi.fn().mockResolvedValue({ success: true }),
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: false,
        })
      );

      await expect(async () => {
        await act(async () => {
          await result.current.retry();
        });
      }).rejects.toThrow('No failed mutation to retry');
    });

    it('should call onRetry callback before each retry', async () => {
      const onRetry = vi.fn();
      const mutationFn = vi.fn().mockRejectedValue(new Error('Fail'));

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: {
            maxRetries: 2,
            baseDelay: 10,
            maxDelay: 100,
            onRetry,
          },
          showToasts: false,
        })
      );

      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected
        }
      });

      // onRetry should be called for each retry (not initial attempt)
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        1,
        expect.any(Error)
      );
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        2,
        expect.any(Error)
      );
    });
  });

  describe('Cancellation', () => {
    it('should cancel in-flight request when cancel() is called', async () => {
      let abortSignal: AbortSignal | null = null;
      const mutationFn = vi.fn().mockImplementation((_, signal) => {
        abortSignal = signal;
        return new Promise(() => {
          // Never resolves
        });
      });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: false,
        })
      );

      act(() => {
        result.current.mutate({ value: 'test' });
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.cancel();
      });

      expect(result.current.isLoading).toBe(false);
      expect(abortSignal?.aborted).toBe(true);
    });

    it('should not call onRollback when mutation is aborted', async () => {
      const onRollback = vi.fn();
      const mutationFn = vi.fn().mockImplementation((_, signal) => {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback,
          showToasts: false,
        })
      );

      act(() => {
        result.current.mutate({ value: 'test' });
      });

      await act(async () => {
        result.current.cancel();
      });

      // Rollback should not be called on cancellation
      expect(onRollback).not.toHaveBeenCalled();
    });

    it('should abort previous request when new mutation is triggered', async () => {
      let firstAbortSignal: AbortSignal | null = null;
      const mutationFn = vi.fn().mockImplementation((vars, signal) => {
        if (vars.value === 'first') {
          firstAbortSignal = signal;
          return new Promise(() => {
            // Never resolves
          });
        }
        return Promise.resolve({ success: true });
      });

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          showToasts: false,
        })
      );

      // Start first mutation
      act(() => {
        result.current.mutate({ value: 'first' });
      });

      // Start second mutation (should abort first)
      await act(async () => {
        await result.current.mutate({ value: 'second' });
      });

      expect(firstAbortSignal?.aborted).toBe(true);
    });
  });

  describe('Reset functionality', () => {
    it('should reset all state when reset() is called', async () => {
      const mutationFn = vi.fn().mockRejectedValue(new Error('Fail'));

      const { result } = renderHook(() =>
        useOptimisticMutation({
          mutationFn,
          onOptimisticUpdate: vi.fn(),
          onRollback: vi.fn(),
          retryConfig: { maxRetries: 0 },
          showToasts: false,
        })
      );

      // Trigger failed mutation
      await act(async () => {
        try {
          await result.current.mutate({ value: 'test' });
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe('Fail');
      expect(result.current.canRetry).toBe(true);

      // Reset state
      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBe('');
      expect(result.current.canRetry).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.retryAttempt).toBe(0);
    });
  });

  describe('Type safety', () => {
    it('should correctly type variables and return data', async () => {
      interface UpdateData {
        displayName: string;
        bio: string;
      }

      interface UpdateResult {
        id: number;
        displayName: string;
        bio: string;
        updatedAt: string;
      }

      const mutationFn = vi.fn().mockResolvedValue({
        id: 1,
        displayName: 'Test User',
        bio: 'Test bio',
        updatedAt: '2024-01-01',
      } satisfies UpdateResult);

      const { result } = renderHook(() =>
        useOptimisticMutation<UpdateResult, UpdateData>({
          mutationFn,
          onOptimisticUpdate: (vars: UpdateData) => {
            // TypeScript should allow accessing UpdateData properties
            expect(vars.displayName).toBe('Test User');
            expect(vars.bio).toBe('Test bio');
          },
          onRollback: vi.fn(),
          onSuccess: (data: UpdateResult) => {
            // TypeScript should allow accessing UpdateResult properties
            expect(data.id).toBe(1);
            expect(data.updatedAt).toBe('2024-01-01');
          },
          showToasts: false,
        })
      );

      const updateData: UpdateData = {
        displayName: 'Test User',
        bio: 'Test bio',
      };

      await act(async () => {
        const returnedData = await result.current.mutate(updateData);
        // TypeScript should infer correct return type
        expect(returnedData.id).toBe(1);
      });
    });
  });
});
