'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { captureWarning } from '@/lib/error-tracking';
import { isAbortError, isNetworkError } from '@/lib/pacer/errors';
import { PACER_TIMING, useAsyncValidation } from '@/lib/pacer/hooks';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface UseHandleValidationOptions {
  assumeInitialHandleAvailable?: boolean;
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

interface HandleValidationResponse {
  input: string;
  result: ApiValidationResult;
}

/** Maximum time (ms) to stay in "checking" state before resetting */
const CHECKING_SAFETY_TIMEOUT_MS =
  PACER_TIMING.VALIDATION_TIMEOUT_MS + PACER_TIMING.VALIDATION_DEBOUNCE_MS;
/**
 * Cold dev-server compiles can abort the first couple of availability checks.
 * Allow a small bounded retry budget before surfacing an error to the user.
 */
const MAX_TRANSIENT_RETRIES = 3;

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
  assumeInitialHandleAvailable = false,
  normalizedInitialHandle,
  fullName,
}: UseHandleValidationOptions): UseHandleValidationReturn {
  const isTrustedSeededHandle = useCallback(
    (value: string) =>
      assumeInitialHandleAvailable &&
      Boolean(normalizedInitialHandle) &&
      value === normalizedInitialHandle,
    [assumeInitialHandleAvailable, normalizedInitialHandle]
  );

  const [handle, setHandle] = useState(normalizedInitialHandle);
  const handleRef = useRef(normalizedInitialHandle);
  const [handleValidation, setHandleValidation] =
    useState<HandleValidationState>({
      available: isTrustedSeededHandle(normalizedInitialHandle),
      checking: false,
      error: null,
      clientValid: Boolean(normalizedInitialHandle),
      suggestions: [],
    });

  // TanStack Pacer hook for API validation with debouncing and caching
  const latestRequestedHandleRef = useRef(normalizedInitialHandle);
  const abortRetryCountRef = useRef(new Map<string, number>());
  const abortRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  const {
    validate: validateApi,
    cancel: cancelValidation,
    isPending,
    isValidating,
  } = useAsyncValidation<string, HandleValidationResponse>({
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

      return {
        input: normalizedInput,
        result: (await response.json()) as ApiValidationResult,
      };
    },
    wait: PACER_TIMING.ONBOARDING_HANDLE_DEBOUNCE_MS,
    timeout: PACER_TIMING.VALIDATION_TIMEOUT_MS,
    onSuccess: ({ input, result }: HandleValidationResponse) => {
      if (input !== latestRequestedHandleRef.current) {
        return;
      }

      abortRetryCountRef.current.delete(input);

      if (isTrustedSeededHandle(input)) {
        setHandleValidation({
          available: true,
          checking: false,
          error: null,
          clientValid: true,
          suggestions: [],
        });
        return;
      }

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
        const suggestions = generateUsernameSuggestions(input, fullName).slice(
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
      if (latestRequestedHandleRef.current !== handleRef.current) {
        return;
      }

      if (isAbortError(error) || isNetworkError(error)) {
        const currentHandle = latestRequestedHandleRef.current;

        if (isTrustedSeededHandle(currentHandle)) {
          abortRetryCountRef.current.delete(currentHandle);
          setHandleValidation({
            available: true,
            checking: false,
            clientValid: true,
            error: null,
            suggestions: [],
          });
          return;
        }

        const currentRetryCount =
          abortRetryCountRef.current.get(currentHandle) ?? 0;

        if (currentHandle && currentRetryCount < MAX_TRANSIENT_RETRIES) {
          abortRetryCountRef.current.set(currentHandle, currentRetryCount + 1);
          if (abortRetryTimerRef.current) {
            clearTimeout(abortRetryTimerRef.current);
          }
          abortRetryTimerRef.current = setTimeout(() => {
            setHandleValidation(prev => ({
              ...prev,
              checking: true,
            }));
            validateApiRef.current(currentHandle);
          }, 250);
          return;
        }

        // Reset local checking flag. If Pacer still has a pending request,
        // isChecking (isPending || isValidating) keeps the combined state true.
        // If nothing is pending (e.g. timeout abort), this unblocks the UI.
        setHandleValidation({
          available: false,
          checking: false,
          clientValid: true,
          error: 'Unable to check handle right now. Please try again.',
          suggestions: [],
        });
        return;
      }

      // Capture warning to Sentry for monitoring API failures
      captureWarning('Handle validation API failed', error, {
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
  const validateApiRef = useRef(validateApi);

  useEffect(() => {
    validateApiRef.current = validateApi;
  }, [validateApi]);

  useEffect(() => {
    return () => {
      if (abortRetryTimerRef.current) {
        clearTimeout(abortRetryTimerRef.current);
      }
    };
  }, []);

  // Safety valve: reset checking after max duration to prevent infinite "Checking..."
  // This catches edge cases where Pacer state or callbacks don't resolve.
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const combinedChecking = handleValidation.checking || isChecking;

  useEffect(() => {
    if (combinedChecking) {
      safetyTimerRef.current = setTimeout(() => {
        setHandleValidation(prev => {
          if (isTrustedSeededHandle(handleRef.current)) {
            return {
              ...prev,
              available: true,
              checking: false,
              error: null,
              clientValid: true,
              suggestions: [],
            };
          }

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
  }, [combinedChecking, isTrustedSeededHandle]);

  const validateHandle = useCallback(
    (input: string) => {
      const normalizedInput = input.trim().toLowerCase();

      latestRequestedHandleRef.current = normalizedInput;
      abortRetryCountRef.current.delete(normalizedInput);

      // Fast path: if input matches initial handle, mark as valid immediately
      if (isTrustedSeededHandle(normalizedInput)) {
        cancelValidation();
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
        cancelValidation();
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
      validateApiRef.current(normalizedInput);
    },
    [cancelValidation, isTrustedSeededHandle]
  );

  const isSeededInitialHandleReady =
    isTrustedSeededHandle(handle) &&
    handleValidation.available &&
    handleValidation.clientValid &&
    !handleValidation.error;

  return {
    handleValidation: {
      ...handleValidation,
      // Ensure checking reflects Pacer's state
      checking: isSeededInitialHandleReady
        ? false
        : handleValidation.checking || isChecking,
    },
    setHandleValidation,
    handle,
    setHandle,
    validateHandle,
  };
}
