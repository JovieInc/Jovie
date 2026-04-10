import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateApiState = vi.hoisted(() => ({
  current: vi.fn<(input: string) => Promise<void>>(),
  cancel: vi.fn(),
}));

vi.mock('@/lib/pacer/hooks', () => ({
  PACER_TIMING: {
    ONBOARDING_HANDLE_DEBOUNCE_MS: 400,
    VALIDATION_TIMEOUT_MS: 2000,
    VALIDATION_DEBOUNCE_MS: 400,
  },
  useAsyncValidation: () => ({
    validate: validateApiState.current,
    cancel: validateApiState.cancel,
    isPending: false,
    isValidating: false,
  }),
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
  isAbortError: () => false,
}));

import { useHandleValidation } from '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation';

describe('useHandleValidation', () => {
  beforeEach(() => {
    validateApiState.current = vi.fn().mockResolvedValue(undefined);
    validateApiState.cancel = vi.fn();
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
});
