/**
 * Handle API Validation Hook
 *
 * Provides debounced handle availability checking using the shared
 * useAsyncValidation hook from TanStack Pacer.
 *
 * @see https://tanstack.com/pacer
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PACER_TIMING, useAsyncValidation } from '@/lib/pacer/hooks';
import type { ClientValidationResult } from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleApiValidationProps {
  value: string;
  clientValidation: ClientValidationResult;
  usernameSuggestions: string[];
  showAvailability: boolean;
}

interface HandleCheckResponse {
  available: boolean;
  error?: string;
}

/**
 * Hook for API-based handle validation with caching.
 *
 * Uses the shared useAsyncValidation hook to reduce code duplication
 * while maintaining the same API surface.
 */
export function useHandleApiValidation({
  value,
  clientValidation,
  usernameSuggestions,
  showAvailability,
}: UseHandleApiValidationProps) {
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: false,
      checking: false,
      error: null,
      clientValid: false,
      suggestions: [],
    });

  // Cache for previously validated handles
  const lastValidatedRef = useRef<{
    handle: string;
    available: boolean;
  } | null>(null);

  // Use the shared async validation hook
  const { validate, cancel, isValidating, isPending } = useAsyncValidation<
    string,
    HandleCheckResponse
  >({
    validatorFn: async (handleValue, signal) => {
      // Check cache first
      if (lastValidatedRef.current?.handle === handleValue) {
        return { available: lastValidatedRef.current.available };
      }

      const response = await fetch(
        `/api/handle/check?handle=${encodeURIComponent(handleValue.toLowerCase())}`,
        {
          signal,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const available = !!result.available;

      // Cache the result
      lastValidatedRef.current = { handle: handleValue, available };

      return { available, error: result.error };
    },
    wait: PACER_TIMING.VALIDATION_DEBOUNCE_MS,
    timeout: PACER_TIMING.VALIDATION_TIMEOUT_MS,
    enabled: clientValidation.valid && value.length >= 3 && showAvailability,
    onSuccess: res => {
      setHandleValidation(prev => ({
        ...prev,
        available: res.available,
        checking: false,
        error: res.available ? null : res.error || 'Handle already taken',
      }));
    },
    onError: err => {
      let errorMessage = 'Network error';

      if (err.message === 'AbortError' || err.name === 'AbortError') {
        // Check if it was a timeout
        errorMessage = 'Check timed out - please try again';
      } else if (err.message.includes('fetch')) {
        errorMessage = 'Connection failed - check your internet';
      } else if (err.message.includes('HTTP')) {
        errorMessage = 'Server error - please try again';
      }

      setHandleValidation(prev => ({
        ...prev,
        available: false,
        checking: false,
        error: errorMessage,
      }));

      // Cache failed results to prevent re-validation
      lastValidatedRef.current = { handle: value, available: false };
    },
  });

  // Cancel function
  const cancelValidation = useCallback(() => {
    cancel();
  }, [cancel]);

  // Update validation state when handle or client validation changes
  useEffect(() => {
    setHandleValidation(prevValidation => ({
      ...prevValidation,
      clientValid: clientValidation.valid,
      error: clientValidation.error,
      suggestions: usernameSuggestions,
      available: clientValidation.valid ? prevValidation.available : false,
      checking: clientValidation.valid ? prevValidation.checking : false,
    }));

    if (!clientValidation.valid || value.length < 3 || !showAvailability) {
      cancelValidation();
      setHandleValidation(prev => ({
        ...prev,
        checking: false,
        available: false,
      }));
      return;
    }

    // Check cache before triggering validation
    if (lastValidatedRef.current?.handle === value) {
      const { available } = lastValidatedRef.current;
      setHandleValidation(prev => ({
        ...prev,
        available,
        checking: false,
        error: available ? null : 'Handle already taken',
      }));
      return;
    }

    setHandleValidation(prev => ({
      ...prev,
      checking: true,
      error: null,
    }));

    void validate(value);
  }, [
    value,
    clientValidation,
    usernameSuggestions,
    showAvailability,
    validate,
    cancelValidation,
  ]);

  // Override checking state with hook state
  const finalValidation: HandleValidationState = {
    ...handleValidation,
    checking: handleValidation.checking || isValidating || isPending,
  };

  return finalValidation;
}
