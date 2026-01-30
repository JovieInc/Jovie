'use client';

/**
 * Hook for rate-limited async validation.
 *
 * Combines debouncing with rate limiting to prevent API abuse while
 * maintaining responsive UX. Useful for expensive validation endpoints
 * like handle availability checks.
 *
 * Features:
 * - Debouncing: Prevents rapid-fire requests during typing
 * - Rate limiting: Prevents abuse (e.g., 10 requests per minute)
 * - User feedback: Optional callback when rate limited
 * - Caching: Integrates with validation cache
 */

import { useAsyncRateLimiter } from '@tanstack/react-pacer';
import { useCallback, useRef, useState } from 'react';
import { CACHE_PRESETS, createValidationCache } from '../cache';
import { isAbortError } from '../errors';
import { PACER_TIMING } from './timing';

export interface UseRateLimitedValidationOptions<TValue, TResult> {
  /** The async validation function */
  validatorFn: (value: TValue, signal: AbortSignal) => Promise<TResult>;
  /** Maximum requests allowed in the rate window */
  rateLimit?: number;
  /** Rate window duration in ms */
  rateWindow?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Whether validation is enabled */
  enabled?: boolean;
  /** Callback when rate limited */
  onRateLimited?: () => void;
  /** Callback on successful validation */
  onSuccess?: (result: TResult) => void;
  /** Callback on validation error */
  onError?: (error: Error) => void;
  /**
   * Optional custom cache key generator for complex value types.
   * By default, uses JSON.stringify which may be unstable for objects.
   * Provide this if TValue is an object that needs stable serialization.
   */
  getCacheKey?: (value: TValue) => string;
}

export interface UseRateLimitedValidationReturn<TValue, TResult> {
  /** Trigger validation for a value */
  validate: (value: TValue) => Promise<TResult | undefined>;
  /** Cancel pending validation */
  cancel: () => void;
  /** Whether validation is in progress */
  isValidating: boolean;
  /** Whether rate limited */
  isRateLimited: boolean;
  /** Number of requests remaining in current window */
  remainingRequests: number;
  /** Last validation result */
  result: TResult | undefined;
  /** Last validation error */
  error: Error | null;
}

/**
 * Rate-limited async validation hook.
 *
 * @example
 * ```tsx
 * const { validate, isValidating, isRateLimited, result } = useRateLimitedValidation({
 *   validatorFn: async (handle, signal) => {
 *     const response = await fetch(`/api/handle/check?handle=${handle}`, { signal });
 *     return response.json();
 *   },
 *   rateLimit: 10,
 *   rateWindow: 60_000, // 10 requests per minute
 *   onRateLimited: () => toast.warning('Too many requests, please slow down'),
 * });
 * ```
 */
export function useRateLimitedValidation<TValue, TResult>({
  validatorFn,
  rateLimit = PACER_TIMING.HANDLE_CHECK_RATE_LIMIT,
  rateWindow = PACER_TIMING.HANDLE_CHECK_RATE_WINDOW_MS,
  timeout = PACER_TIMING.VALIDATION_TIMEOUT_MS,
  enabled = true,
  onRateLimited,
  onSuccess,
  onError,
  getCacheKey,
}: UseRateLimitedValidationOptions<
  TValue,
  TResult
>): UseRateLimitedValidationReturn<TValue, TResult> {
  const [result, setResult] = useState<TResult | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use the shared cache utility with TTL and size limits
  const cacheRef = useRef(
    createValidationCache<string, TResult>(CACHE_PRESETS.validation)
  );

  // Rate-limited executor with state selector for reactivity
  const rateLimiter = useAsyncRateLimiter(
    async (value: TValue) => {
      if (!enabled) return undefined;

      // Use custom cache key generator if provided, otherwise fall back to JSON.stringify
      // Note: JSON.stringify may produce unstable keys for objects with varying property order
      const cacheKey = getCacheKey ? getCacheKey(value) : JSON.stringify(value);

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

        // Cache the result
        cacheRef.current.set(cacheKey, validationResult);

        setResult(validationResult);
        setError(null);
        setIsRateLimited(false);
        onSuccess?.(validationResult);

        return validationResult;
      } catch (err) {
        clearTimeout(timeoutId);

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
      limit: rateLimit,
      window: rateWindow,
      onReject: () => {
        setIsRateLimited(true);
        onRateLimited?.();
      },
    },
    // Selector to subscribe to state changes
    state => ({
      isExecuting: state.isExecuting,
      successCount: state.successCount,
    })
  );

  const validate = useCallback(
    async (value: TValue) => {
      setError(null);
      return rateLimiter.maybeExecute(value);
    },
    [rateLimiter]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Calculate remaining requests (approximate) using selected state
  const remainingRequests = Math.max(
    0,
    rateLimit - (rateLimiter.state?.successCount ?? 0)
  );

  return {
    validate,
    cancel,
    isValidating: rateLimiter.state?.isExecuting ?? false,
    isRateLimited,
    remainingRequests,
    result,
    error,
  };
}
