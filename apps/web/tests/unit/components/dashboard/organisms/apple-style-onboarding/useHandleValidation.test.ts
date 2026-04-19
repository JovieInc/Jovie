import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateApiState = vi.hoisted(() => ({
  callbacks: {
    onError: undefined as ((error: Error) => void) | undefined,
    onSuccess: undefined as
      | ((payload: { input: string; result: { available: boolean } }) => void)
      | undefined,
  },
  current: vi.fn<(input: string) => Promise<void>>(),
  cancel: vi.fn(),
}));

vi.mock('@/lib/pacer/hooks', () => ({
  PACER_TIMING: {
    ONBOARDING_HANDLE_DEBOUNCE_MS: 400,
    VALIDATION_TIMEOUT_MS: 2000,
    VALIDATION_DEBOUNCE_MS: 400,
  },
  useAsyncValidation: (options: {
    onError?: (error: Error) => void;
    onSuccess?: (payload: {
      input: string;
      result: { available: boolean };
    }) => void;
  }) => {
    validateApiState.callbacks.onError = options.onError;
    validateApiState.callbacks.onSuccess = options.onSuccess;
    return {
      validate: validateApiState.current,
      cancel: validateApiState.cancel,
      isPending: false,
      isValidating: false,
    };
  },
}));

vi.mock('@/lib/validation/client-username', () => ({
  validateUsernameFormat: () => ({
    valid: true,
    error: null,
    suggestion: null,
  }),
  generateUsernameSuggestions: () => [],
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/pacer/errors', () => ({
  isAbortError: (error: Error) => error.name === 'AbortError',
  isNetworkError: (error: Error) => error.message === 'Failed to fetch',
}));

import { useHandleValidation } from '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation';

describe('useHandleValidation', () => {
  beforeEach(() => {
    vi.useRealTimers();
    validateApiState.callbacks.onError = undefined;
    validateApiState.callbacks.onSuccess = undefined;
    validateApiState.current = vi.fn().mockResolvedValue(undefined);
    validateApiState.cancel = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps validateHandle stable across rerenders while calling the latest validateApi ref', async () => {
    const { result, rerender } = renderHook(
      ({ normalizedInitialHandle, fullName }) =>
        useHandleValidation({ normalizedInitialHandle, fullName }),
      {
        initialProps: {
          normalizedInitialHandle: '',
          fullName: 'Taylor Swift',
        },
      }
    );

    const initialValidateHandle = result.current.validateHandle;

    const updatedValidateApi = vi.fn().mockResolvedValue(undefined);
    validateApiState.current = updatedValidateApi;

    rerender({
      normalizedInitialHandle: '',
      fullName: 'Taylor Swift',
    });

    expect(result.current.validateHandle).toBe(initialValidateHandle);

    await act(async () => {
      result.current.validateHandle('new-handle');
    });

    expect(updatedValidateApi).toHaveBeenCalledWith('new-handle');
  });

  it('validates a prefilled handle through the API when it is not already claimed', async () => {
    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: false,
        normalizedInitialHandle: 'prefilled-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('prefilled-handle');
    });

    expect(validateApiState.cancel).not.toHaveBeenCalled();
    expect(validateApiState.current).toHaveBeenCalledWith('prefilled-handle');
  });

  it('keeps the fast path for handles that already belong to an existing profile', async () => {
    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: true,
        normalizedInitialHandle: 'claimed-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('claimed-handle');
    });

    expect(validateApiState.cancel).toHaveBeenCalled();
    expect(validateApiState.current).not.toHaveBeenCalled();
    expect(result.current.handleValidation.available).toBe(true);
  });

  it('keeps a trusted seeded handle available after a transient network failure', async () => {
    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: true,
        normalizedInitialHandle: 'claimed-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('claimed-handle');
    });

    act(() => {
      validateApiState.callbacks.onError?.(new Error('Failed to fetch'));
    });

    expect(result.current.handleValidation.available).toBe(true);
    expect(result.current.handleValidation.error).toBeNull();
    expect(result.current.handleValidation.checking).toBe(false);
  });

  it('retries transient aborts for the current handle within the retry budget', async () => {
    vi.useFakeTimers();
    const retryValidate = vi.fn().mockResolvedValue(undefined);
    validateApiState.current = retryValidate;

    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: false,
        normalizedInitialHandle: 'prefilled-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('prefilled-handle');
    });

    expect(retryValidate).toHaveBeenCalledTimes(1);

    act(() => {
      validateApiState.callbacks.onError?.(
        Object.assign(new Error('aborted'), { name: 'AbortError' })
      );
      vi.advanceTimersByTime(250);
    });

    expect(retryValidate).toHaveBeenCalledTimes(2);
    expect(retryValidate).toHaveBeenLastCalledWith('prefilled-handle');

    act(() => {
      validateApiState.callbacks.onError?.(
        Object.assign(new Error('aborted again'), { name: 'AbortError' })
      );
      vi.advanceTimersByTime(250);
    });

    expect(retryValidate).toHaveBeenCalledTimes(3);
    expect(retryValidate).toHaveBeenLastCalledWith('prefilled-handle');
  });

  it('retries transient network failures for the current handle within the retry budget', async () => {
    vi.useFakeTimers();
    const retryValidate = vi.fn().mockResolvedValue(undefined);
    validateApiState.current = retryValidate;

    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: false,
        normalizedInitialHandle: 'prefilled-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('prefilled-handle');
    });

    expect(retryValidate).toHaveBeenCalledTimes(1);

    act(() => {
      validateApiState.callbacks.onError?.(new Error('Failed to fetch'));
      vi.advanceTimersByTime(250);
    });

    expect(retryValidate).toHaveBeenCalledTimes(2);
    expect(retryValidate).toHaveBeenLastCalledWith('prefilled-handle');
  });

  it('surfaces a user-facing error after transient network retries are exhausted', async () => {
    vi.useFakeTimers();
    const retryValidate = vi.fn().mockResolvedValue(undefined);
    validateApiState.current = retryValidate;

    const { result } = renderHook(() =>
      useHandleValidation({
        assumeInitialHandleAvailable: false,
        normalizedInitialHandle: 'prefilled-handle',
        fullName: 'Taylor Swift',
      })
    );

    await act(async () => {
      result.current.validateHandle('prefilled-handle');
    });

    act(() => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        validateApiState.callbacks.onError?.(new Error('Failed to fetch'));
        vi.advanceTimersByTime(250);
      }
      validateApiState.callbacks.onError?.(new Error('Failed to fetch'));
    });

    expect(retryValidate).toHaveBeenCalledTimes(4);
    expect(result.current.handleValidation.error).toBe(
      'Unable to check handle right now. Please try again.'
    );
    expect(result.current.handleValidation.checking).toBe(false);
  });
});
