'use client';

/**
 * Application-specific TanStack Pacer hooks
 *
 * These hooks provide common patterns used throughout the Jovie application,
 * built on top of TanStack Pacer's primitives.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer, useThrottler } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_PRESETS, createValidationCache } from './cache';
import { isAbortError } from './errors';

/**
 * Centralized timing constants for TanStack Pacer hooks.
 * Use these to ensure consistent debounce/throttle behavior across the app.
 */
export const PACER_TIMING = {
  /** Default debounce for general use */
  DEBOUNCE_MS: 300,
  /** Debounce for search inputs */
  SEARCH_DEBOUNCE_MS: 300,
  /** Debounce for async validation (handle checks, etc.) */
  VALIDATION_DEBOUNCE_MS: 450,
  /** Debounce for auto-save operations */
  SAVE_DEBOUNCE_MS: 500,
  /** Default throttle for event handlers */
  THROTTLE_MS: 100,
  /** Throttle for scroll/animation (60fps) */
  SCROLL_THROTTLE_MS: 16,
  /** Default timeout for validation requests */
  VALIDATION_TIMEOUT_MS: 5000,
} as const;

/**
 * Hook for debounced async API validation (e.g., handle availability checks).
 *
 * Features:
 * - Automatic abort controller management
 * - Request deduplication via caching
 * - Loading and error state management
 * - Timeout handling
 *
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

/**
 * Hook for debounced async search with loading states.
 *
 * @example
 * ```tsx
 * const { search, results, isSearching, isPending, error, clear } = useAsyncSearch({
 *   searchFn: async (query, signal) => {
 *     const response = await fetch(`/api/search?q=${query}`, { signal });
 *     return response.json();
 *   },
 *   wait: 300,
 *   minQueryLength: 2,
 * });
 * ```
 */
export interface UseAsyncSearchOptions<TResult> {
  /** The async search function */
  searchFn: (query: string, signal: AbortSignal) => Promise<TResult[]>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Minimum query length to trigger search */
  minQueryLength?: number;
  /** Callback on search error */
  onError?: (error: Error) => void;
}

export interface UseAsyncSearchReturn<TResult> {
  /** Trigger search for a query */
  search: (query: string) => void;
  /** Search immediately (bypasses debounce) */
  searchImmediate: (query: string) => Promise<void>;
  /** Clear results and reset state */
  clear: () => void;
  /** Current search results */
  results: TResult[];
  /** Whether search is executing */
  isSearching: boolean;
  /** Whether debounce is pending */
  isPending: boolean;
  /** Current search query */
  query: string;
  /** Search error if any */
  error: Error | null;
  /** Search state */
  state: 'idle' | 'loading' | 'error' | 'empty' | 'success';
}

export function useAsyncSearch<TResult>({
  searchFn,
  wait = PACER_TIMING.SEARCH_DEBOUNCE_MS,
  minQueryLength = 2,
  onError,
}: UseAsyncSearchOptions<TResult>): UseAsyncSearchReturn<TResult> {
  const [results, setResults] = useState<TResult[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [searchState, setSearchState] = useState<
    'idle' | 'loading' | 'error' | 'empty' | 'success'
  >('idle');
  const abortControllerRef = useRef<AbortController | null>(null);

  const asyncDebouncer = useAsyncDebouncer(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();

      if (trimmed.length < minQueryLength) {
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      setSearchState('loading');
      setError(null);

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const searchResults = await searchFn(trimmed, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setResults(searchResults);
        setSearchState(searchResults.length === 0 ? 'empty' : 'success');
      } catch (err) {
        // Use standardized error check
        if (isAbortError(err)) {
          return;
        }

        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setResults([]);
        setSearchState('error');
        onError?.(searchError);
      }
    },
    {
      wait,
      onError: err => {
        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setSearchState('error');
        onError?.(searchError);
      },
    },
    (state: AsyncDebouncerState<(searchQuery: string) => Promise<void>>) => ({
      isExecuting: state.isExecuting,
      isPending: state.isPending,
    })
  );

  const search = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      const trimmed = searchQuery.trim();
      if (trimmed.length < minQueryLength) {
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      // Show loading state immediately for UX feedback
      setSearchState('loading');

      void asyncDebouncer.maybeExecute(searchQuery);
    },
    [asyncDebouncer, minQueryLength]
  );

  const searchImmediate = useCallback(
    async (searchQuery: string) => {
      setQuery(searchQuery);
      asyncDebouncer.cancel();

      const trimmed = searchQuery.trim();
      if (trimmed.length < minQueryLength) {
        setResults([]);
        setSearchState('idle');
        setError(null);
        return;
      }

      setSearchState('loading');

      // Cancel any previous request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const searchResults = await searchFn(trimmed, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setResults(searchResults);
        setSearchState(searchResults.length === 0 ? 'empty' : 'success');
      } catch (err) {
        // Use standardized error check
        if (isAbortError(err)) {
          return;
        }

        const searchError =
          err instanceof Error ? err : new Error('Search failed');
        setError(searchError);
        setResults([]);
        setSearchState('error');
        onError?.(searchError);
      }
    },
    [asyncDebouncer, minQueryLength, searchFn, onError]
  );

  const clear = useCallback(() => {
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setResults([]);
    setSearchState('idle');
    setError(null);
    setQuery('');
  }, [asyncDebouncer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    search,
    searchImmediate,
    clear,
    results,
    isSearching: asyncDebouncer.state.isExecuting || false,
    isPending: asyncDebouncer.state.isPending || false,
    query,
    error,
    state: searchState,
  };
}

/**
 * Hook for debounced auto-save functionality.
 *
 * @example
 * ```tsx
 * const { save, flush, cancel, isSaving, lastSaved } = useAutoSave({
 *   saveFn: async (data) => {
 *     await fetch('/api/save', { method: 'PUT', body: JSON.stringify(data) });
 *   },
 *   wait: 900,
 * });
 *
 * // Trigger save on data change
 * useEffect(() => {
 *   save(formData);
 * }, [formData, save]);
 *
 * // Flush on unmount
 * useEffect(() => {
 *   return () => flush();
 * }, [flush]);
 * ```
 */
export interface UseAutoSaveOptions<TData> {
  /** The async save function */
  saveFn: (data: TData) => Promise<void>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Callback on successful save */
  onSuccess?: () => void;
  /** Callback on save error */
  onError?: (error: Error) => void;
}

export interface UseAutoSaveReturn<TData> {
  /** Trigger debounced save */
  save: (data: TData) => void;
  /** Flush pending save immediately */
  flush: () => Promise<void>;
  /** Cancel pending save */
  cancel: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Whether a save is pending */
  isPending: boolean;
  /** Last successful save timestamp */
  lastSaved: Date | null;
  /** Last save error */
  error: Error | null;
}

export function useAutoSave<TData>({
  saveFn,
  wait = PACER_TIMING.SAVE_DEBOUNCE_MS,
  onSuccess,
  onError,
}: UseAutoSaveOptions<TData>): UseAutoSaveReturn<TData> {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const pendingDataRef = useRef<TData | null>(null);

  const asyncDebouncer = useAsyncDebouncer(
    async (data: TData) => {
      try {
        await saveFn(data);
        setLastSaved(new Date());
        setError(null);
        onSuccess?.();
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        onError?.(saveError);
        throw err;
      }
    },
    {
      wait,
      onError: err => {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        onError?.(saveError);
      },
    },
    (state: AsyncDebouncerState<(data: TData) => Promise<void>>) => ({
      isExecuting: state.isExecuting,
      isPending: state.isPending,
    })
  );

  const save = useCallback(
    (data: TData) => {
      pendingDataRef.current = data;
      setError(null);
      void asyncDebouncer.maybeExecute(data);
    },
    [asyncDebouncer]
  );

  const flush = useCallback(async () => {
    if (pendingDataRef.current !== null) {
      asyncDebouncer.cancel();
      try {
        await saveFn(pendingDataRef.current);
        setLastSaved(new Date());
        setError(null);
        onSuccess?.();
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        onError?.(saveError);
      } finally {
        pendingDataRef.current = null;
      }
    }
  }, [asyncDebouncer, saveFn, onSuccess, onError]);

  const cancel = useCallback(() => {
    asyncDebouncer.cancel();
    pendingDataRef.current = null;
  }, [asyncDebouncer]);

  return {
    save,
    flush,
    cancel,
    isSaving: asyncDebouncer.state.isExecuting || false,
    isPending: asyncDebouncer.state.isPending || false,
    lastSaved,
    error,
  };
}

/**
 * Hook for throttled scroll/resize event handlers.
 *
 * Uses requestAnimationFrame-based throttling for optimal performance.
 *
 * @example
 * ```tsx
 * const { value: scrollY, isThrottled } = useThrottledScroll();
 *
 * // Or with custom handler
 * const handleScroll = useThrottledEventHandler(() => {
 *   // Handle scroll
 * }, { wait: 100 });
 * ```
 */
export interface UseThrottledEventHandlerOptions {
  /** Throttle wait time in ms */
  wait?: number;
  /** Execute on leading edge */
  leading?: boolean;
  /** Execute on trailing edge */
  trailing?: boolean;
}

export function useThrottledEventHandler<
  T extends (...args: unknown[]) => void,
>(handler: T, options: UseThrottledEventHandlerOptions = {}): T {
  const {
    wait = PACER_TIMING.THROTTLE_MS,
    leading = true,
    trailing = true,
  } = options;

  const throttler = useThrottler(handler, {
    wait,
    leading,
    trailing,
  });

  return useCallback(
    (...args: Parameters<T>) => {
      throttler.maybeExecute(...args);
    },
    [throttler]
  ) as T;
}

/**
 * Hook for tracking scroll position with throttling.
 *
 * @example
 * ```tsx
 * const { scrollY, isScrolled } = useThrottledScroll({ threshold: 100 });
 * ```
 */
export interface UseThrottledScrollOptions {
  /** Throttle wait time in ms */
  wait?: number;
  /** Scroll threshold for isScrolled state */
  threshold?: number;
}

export interface UseThrottledScrollReturn {
  /** Current scroll Y position */
  scrollY: number;
  /** Whether scroll exceeds threshold */
  isScrolled: boolean;
}

export function useThrottledScroll(
  options: UseThrottledScrollOptions = {}
): UseThrottledScrollReturn {
  const { wait = PACER_TIMING.THROTTLE_MS, threshold = 0 } = options;

  const [scrollY, setScrollY] = useState(() =>
    typeof window !== 'undefined' ? window.scrollY : 0
  );

  const throttler = useThrottler(
    () => {
      setScrollY(window.scrollY);
    },
    { wait, leading: true, trailing: true }
  );

  useEffect(() => {
    const handleScroll = () => {
      throttler.maybeExecute();
    };

    // Initial value
    setScrollY(window.scrollY);

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      throttler.cancel();
    };
  }, [throttler]);

  return {
    scrollY,
    isScrolled: scrollY > threshold,
  };
}
