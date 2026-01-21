'use client';

import { useCallback, useRef, useState } from 'react';
import { captureWarning } from '@/lib/error-tracking';
import { PACER_TIMING, useAsyncValidation } from '@/lib/pacer/hooks';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleValidationOptions {
  normalizedInitialHandle: string;
  fullName: string;
}

interface UseHandleValidationReturn {
  handleValidation: HandleValidationState;
  setHandleValidation: React.Dispatch<
    React.SetStateAction<HandleValidationState>
  >;
  handle: string;
  setHandle: React.Dispatch<React.SetStateAction<string>>;
  validateHandle: (input: string) => Promise<void>;
}

interface HandleCheckResult {
  available: boolean;
  error?: string;
}

/**
 * Hook to manage handle validation state and API checks.
 *
 * Uses TanStack Pacer for debounced validation with:
 * - 450ms debounce delay (VALIDATION_DEBOUNCE_MS)
 * - Automatic request caching
 * - Abort controller management
 */
export function useHandleValidation({
  normalizedInitialHandle,
  fullName,
}: UseHandleValidationOptions): UseHandleValidationReturn {
  const [handle, setHandle] = useState(normalizedInitialHandle);
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: Boolean(normalizedInitialHandle),
      suggestions: [],
    });

  // Use ref to avoid stale closure in callbacks
  const handleRef = useRef(handle);
  handleRef.current = handle;

  // Use Pacer's useAsyncValidation for debounced API calls with caching
  const {
    validate: validateWithPacer,
    isValidating,
    isPending,
    cancel,
  } = useAsyncValidation<string, HandleCheckResult>({
    validatorFn: async (normalizedInput, signal) => {
      const response = await fetch(
        `/api/handle/check?handle=${encodeURIComponent(normalizedInput)}`,
        { signal }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || 'Unable to check handle.');
      }

      return response.json() as Promise<HandleCheckResult>;
    },
    wait: PACER_TIMING.VALIDATION_DEBOUNCE_MS,
    onSuccess: result => {
      if (result.available) {
        setHandleValidation(prev => ({
          ...prev,
          available: true,
          checking: false,
          error: null,
          suggestions: [],
        }));
      } else {
        // Generate suggestions when handle is taken (use ref to get current value)
        const currentHandle = handleRef.current.trim().toLowerCase();
        const suggestions = generateUsernameSuggestions(
          currentHandle,
          fullName
        ).slice(0, 3);
        setHandleValidation(prev => ({
          ...prev,
          available: false,
          checking: false,
          error: result.error || 'Handle already taken',
          suggestions,
        }));
      }
    },
    onError: error => {
      void captureWarning('Handle validation API failed', error, {
        handle: handleRef.current.trim().toLowerCase(),
        route: '/onboarding',
        component: 'useHandleValidation',
      });
      setHandleValidation(prev => ({
        ...prev,
        available: false,
        checking: false,
        error: 'Unable to check handle right now.',
        suggestions: [],
      }));
    },
  });

  const validateHandle = useCallback(
    async (input: string) => {
      const normalizedInput = input.trim().toLowerCase();

      // Fast path: if input matches initial handle, it's already valid
      if (
        normalizedInitialHandle &&
        normalizedInput === normalizedInitialHandle
      ) {
        cancel();
        setHandle(normalizedInput);
        setHandleValidation({
          available: true,
          checking: false,
          error: null,
          clientValid: true,
          suggestions: [],
        });
        return;
      }

      // Client-side validation (synchronous, no debounce needed)
      const clientResult = validateUsernameFormat(normalizedInput);
      if (!clientResult.valid) {
        cancel();
        setHandleValidation({
          available: false,
          checking: false,
          error: clientResult.error,
          clientValid: false,
          suggestions: clientResult.suggestion ? [clientResult.suggestion] : [],
        });
        return;
      }

      // Set checking state and trigger debounced API validation
      setHandleValidation(prev => ({
        ...prev,
        available: false,
        checking: true,
        error: null,
        clientValid: true,
        suggestions: [],
      }));

      // Update handle state for suggestion generation
      setHandle(normalizedInput);

      // Trigger debounced API call via Pacer
      await validateWithPacer(normalizedInput);
    },
    [normalizedInitialHandle, validateWithPacer, cancel]
  );

  // Sync checking state with Pacer's validation state
  const effectiveChecking = isValidating || isPending;
  const currentValidation: HandleValidationState = {
    ...handleValidation,
    checking: effectiveChecking || handleValidation.checking,
  };

  return {
    handleValidation: currentValidation,
    setHandleValidation,
    handle,
    setHandle,
    validateHandle,
  };
}
