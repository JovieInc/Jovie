'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureWarning } from '@/lib/error-tracking';
import { isAbortError } from '@/lib/pacer/errors';
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
  validateHandle: (input: string) => void;
}

interface ApiValidationResult {
  available: boolean;
  error?: string;
}

/** Maximum time (ms) to stay in "checking" state before resetting */
const CHECKING_SAFETY_TIMEOUT_MS = 8000;

/**
 * Hook to manage handle validation state and API checks.
 *
 * Uses TanStack Pacer for:
 * - Automatic debouncing (400ms)
 * - Request deduplication via caching (30s TTL)
 * - AbortController management
 * - Race condition prevention
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

  // TanStack Pacer hook for API validation with debouncing and caching
  const {
    validate: validateApi,
    isPending,
    isValidating,
  } = useAsyncValidation<string, ApiValidationResult>({
    validatorFn: async (normalizedInput: string, signal: AbortSignal) => {
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

      return (await response.json()) as ApiValidationResult;
    },
    wait: 400, // Match existing debounce timing
    timeout: PACER_TIMING.VALIDATION_TIMEOUT_MS,
    onSuccess: (result: ApiValidationResult) => {
      if (result.available) {
        setHandleValidation({
          available: true,
          checking: false,
          error: null,
          clientValid: true,
          suggestions: [],
        });
      } else {
        // Generate suggestions for taken handles
        const suggestions = generateUsernameSuggestions(handle, fullName).slice(
          0,
          3
        );
        setHandleValidation({
          available: false,
          checking: false,
          error: result.error || 'Handle already taken',
          clientValid: true,
          suggestions,
        });
      }
    },
    onError: (error: Error) => {
      if (isAbortError(error)) {
        // Reset local checking flag. If Pacer still has a pending request,
        // isChecking (isPending || isValidating) keeps the combined state true.
        // If nothing is pending (e.g. timeout abort), this unblocks the UI.
        setHandleValidation(prev => ({
          ...prev,
          checking: false,
        }));
        return;
      }

      // Capture warning to Sentry for monitoring API failures
      void captureWarning('Handle validation API failed', error, {
        handle,
        route: '/onboarding',
        component: 'useHandleValidation',
      });

      setHandleValidation({
        available: false,
        checking: false,
        error: 'Unable to check handle right now.',
        clientValid: true,
        suggestions: [],
      });
    },
  });

  // Update checking state when Pacer is pending or validating
  const isChecking = isPending || isValidating;

  // Safety valve: reset checking after max duration to prevent infinite "Checking..."
  // This catches edge cases where Pacer state or callbacks don't resolve.
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combinedChecking = handleValidation.checking || isChecking;

  useEffect(() => {
    if (combinedChecking) {
      safetyTimerRef.current = setTimeout(() => {
        setHandleValidation(prev => {
          if (prev.checking) {
            return {
              ...prev,
              checking: false,
              error: 'Unable to check handle right now. Please try again.',
            };
          }
          return prev;
        });
      }, CHECKING_SAFETY_TIMEOUT_MS);
    } else if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, [combinedChecking]);

  const validateHandle = useCallback(
    (input: string) => {
      const normalizedInput = input.trim().toLowerCase();

      // Fast path: if input matches initial handle, mark as valid immediately
      if (
        normalizedInitialHandle &&
        normalizedInput === normalizedInitialHandle
      ) {
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

      // Client-side validation first (synchronous)
      const clientResult = validateUsernameFormat(normalizedInput);
      if (!clientResult.valid) {
        setHandleValidation({
          available: false,
          checking: false,
          error: clientResult.error,
          clientValid: false,
          suggestions: clientResult.suggestion ? [clientResult.suggestion] : [],
        });
        return;
      }

      // Show checking state and update handle
      setHandle(normalizedInput);
      setHandleValidation({
        available: false,
        checking: true,
        error: null,
        clientValid: true,
        suggestions: [],
      });

      // Trigger API validation via Pacer (debounced, cached)
      void validateApi(normalizedInput);
    },
    [normalizedInitialHandle, validateApi]
  );

  return {
    handleValidation: {
      ...handleValidation,
      // Ensure checking reflects Pacer's state
      checking: handleValidation.checking || isChecking,
    },
    setHandleValidation,
    handle,
    setHandle,
    validateHandle,
  };
}
