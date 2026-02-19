'use client';

/**
 * Hook for debounced async API validation (e.g., handle availability checks).
 *
 * Features:
 * - Automatic abort controller management
 * - Request deduplication via caching
 * - Loading and error state management
 * - Timeout handling
 * - Retry with exponential backoff for transient errors
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { AsyncRetryer, useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_PRESETS, createValidationCache } from '../cache';
import { formatPacerError, isAbortError } from '../errors';
import { isRetryableError, RETRY_DEFAULTS } from '../retry';
import { PACER_TIMING } from './timing';

export interface UseAsyncValidationOptions<TValue, TResult> {
  /** The async validation function */
  validatorFn: (value: TValue, signal: AbortSignal) => Promise<TResult>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Whether validation is enabled */
  enabled?: boolean;
  /** Max retry attempts (default: 2) */
  maxRetries?: number;
  /** Callback on successful validation */
  onSuccess?: (result: TResult) => void;
  /** Callback on validation error */
  onError?: (error: Error) => void;
}

export interface UseAsyncValidationReturn<TValue, TResult> {
  /** Trigger validation for a value */
  validate: (value: TValue) => Promise<TResult | undefined>;
  /** Cancel pending validation */
  cancel: () => void;
  /** Whether validation is in progress */
  isValidating: boolean;
  /** Whether debounce is pending */
  isPending: boolean;
  /** Last validation result */
  result: TResult | undefined;
  /** Last validation error */
  error: Error | null;
  /** User-friendly error message */
  errorMessage: string | null;
}

/**
 * @example
 * ```tsx
 * const { validate, isValidating, result, error, errorMessage, cancel } = useAsyncValidation({
 *   validatorFn: async (value, signal) => {
 *     const response = await fetch(`/api/check?value=${value}`, { signal });
 *     return response.json();
 *   },
 *   wait: 450,
 *   timeout: 5000,
 * });
 *
 * useEffect(() => {
 *   if (isValid) validate(inputValue);
 * }, [inputValue, isValid, validate]);
 * ```
 */
export function useAsyncValidation<TValue, TResult>({
  validatorFn,
  wait = PACER_TIMING.VALIDATION_DEBOUNCE_MS,
  timeout = 5000,
  enabled = true,
  maxRetries = RETRY_DEFAULTS.FAST.maxAttempts,
  onSuccess,
  onError,
}: UseAsyncValidationOptions<TValue, TResult>): UseAsyncValidationReturn<
  TValue,
  TResult
> {
  const [result, setResult] = useState<TResult | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const validatorFnRef = useRef(validatorFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    validatorFnRef.current = validatorFn;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [validatorFn, onSuccess, onError]);

  // Use the shared cache utility with TTL and size limits
  const cacheRef = useRef(
    createValidationCache<string, TResult>(CACHE_PRESETS.validation)
  );

  const asyncDebouncer = useAsyncDebouncer(
    async (value: TValue) => {
      if (!enabled) return undefined;

      const cacheKey = JSON.stringify(value);

      // Check cache first (respects TTL)
      const cached = cacheRef.current.get(cacheKey);
      if (cached !== undefined) {
        setResult(cached);
        setError(null);
        setErrorMessage(null);
        onSuccessRef.current?.(cached);
        return cached;
      }

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        const retryer = new AsyncRetryer(
          async () => {
            return await validatorFnRef.current(value, controller.signal);
          },
          {
            maxAttempts: maxRetries,
            baseWait: RETRY_DEFAULTS.FAST.baseWait,
            backoff: RETRY_DEFAULTS.FAST.backoff,
            jitter: 0.1,
            onError: retryErr => {
              if (!isRetryableError(retryErr)) {
                retryer.abort();
              }
            },
          }
        );

        const validationResult = await retryer.execute();

        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          return undefined;
        }

        if (validationResult !== undefined) {
          // Cache the result (with TTL)
          cacheRef.current.set(cacheKey, validationResult);

          setResult(validationResult);
          setError(null);
          setErrorMessage(null);
          onSuccessRef.current?.(validationResult);
        }

        return validationResult;
      } catch (err) {
        clearTimeout(timeoutId);

        // Use standardized error check
        if (isAbortError(err)) {
          return undefined;
        }

        const validationError =
          err instanceof Error ? err : new Error('Validation failed');
        setError(validationError);
        setErrorMessage(formatPacerError(validationError));
        onErrorRef.current?.(validationError);

        return undefined;
      }
    },
    {
      wait,
      onError: err => {
        const validationError =
          err instanceof Error ? err : new Error('Validation failed');
        setError(validationError);
        setErrorMessage(formatPacerError(validationError));
        onErrorRef.current?.(validationError);
      },
    },
    (
      state: AsyncDebouncerState<
        (value: TValue) => Promise<TResult | undefined>
      >
    ) => ({
      isExecuting: state.isExecuting,
      isPending: state.isPending,
    })
  );

  const validate = useCallback(
    async (value: TValue) => {
      setError(null);
      setErrorMessage(null);
      return asyncDebouncer.maybeExecute(value);
    },
    [asyncDebouncer]
  );

  const cancel = useCallback(() => {
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
  }, [asyncDebouncer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    validate,
    cancel,
    isValidating: asyncDebouncer.state.isExecuting || false,
    isPending: asyncDebouncer.state.isPending || false,
    result,
    error,
    errorMessage,
  };
}
