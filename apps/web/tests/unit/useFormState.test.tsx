import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFormState } from '@/lib/hooks/useFormState';

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
    const { result } = renderHook(() => useFormState());

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
    const { result } = renderHook(() => useFormState());

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
});
