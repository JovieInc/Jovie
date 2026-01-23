'use client';

/**
 * Hook for debounced async API validation (e.g., handle availability checks).
 *
 * Features:
 * - Automatic abort controller management
 * - Request deduplication via caching
 * - Loading and error state management
 * - Timeout handling
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_PRESETS, createValidationCache } from '../cache';
import { isAbortError } from '../errors';
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
}

/**
 * @example
 * ```tsx
 * const { validate, isValidating, result, error, cancel } = useAsyncValidation({
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
  onSuccess,
  onError,
}: UseAsyncValidationOptions<TValue, TResult>): UseAsyncValidationReturn<
  TValue,
  TResult
> {
  const [result, setResult] = useState<TResult | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
        onSuccess?.(cached);
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
        const validationResult = await validatorFn(value, controller.signal);

        clearTimeout(timeoutId);

        if (controller.signal.aborted) {
          return undefined;
        }

        // Cache the result (with TTL)
        cacheRef.current.set(cacheKey, validationResult);

        setResult(validationResult);
        setError(null);
        onSuccess?.(validationResult);

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
        onError?.(validationError);

        return undefined;
      }
    },
    {
      wait,
      onError: err => {
        const validationError =
          err instanceof Error ? err : new Error('Validation failed');
        setError(validationError);
        onError?.(validationError);
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
  };
}
