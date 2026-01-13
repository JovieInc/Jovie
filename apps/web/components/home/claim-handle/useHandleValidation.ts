/**
 * Handle Validation Hook
 *
 * Provides debounced handle availability checking using TanStack Pacer
 * for world-class debouncing with proper async handling.
 *
 * @see https://tanstack.com/pacer
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface HandleValidationResult {
  handleError: string | null;
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
  /** Cancel pending validation */
  cancel: () => void;
}

const VALIDATION_DEBOUNCE_MS = 450; // Within 350-500ms requirement

export function useHandleValidation(handle: string): HandleValidationResult {
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const lastQueriedRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Better handle validation with stricter regex for lowercase a-z, 0-9, hyphen
  const handleError = useMemo(() => {
    if (!handle) return null;
    if (handle.length < 3) return 'Handle must be at least 3 characters';
    if (handle.length > 30) return 'Handle must be less than 30 characters';
    if (!/^[a-z0-9-]+$/.test(handle))
      return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (handle.startsWith('-') || handle.endsWith('-'))
      return 'Handle cannot start or end with a hyphen';
    return null;
  }, [handle]);

  // TanStack Pacer async debouncer for handle validation
  const asyncDebouncer = useAsyncDebouncer(
    async (handleValue: string) => {
      const value = handleValue.toLowerCase();
      lastQueriedRef.current = value;

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        const json = await res
          .json()
          .catch(() => ({ available: false, error: 'Parse error' }));

        // Ignore out-of-order responses
        if (lastQueriedRef.current !== value) return;

        if (!res.ok) {
          setAvailable(null);
          setAvailError(json?.error || 'Error checking availability');
        } else {
          setAvailable(Boolean(json?.available));
          setAvailError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (lastQueriedRef.current !== value) return;
        setAvailable(null);
        setAvailError('Network error');
      } finally {
        if (lastQueriedRef.current === value) setCheckingAvail(false);
      }
    },
    {
      wait: VALIDATION_DEBOUNCE_MS,
      onError: err => {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setAvailable(null);
        setAvailError('Network error');
        setCheckingAvail(false);
      },
    },
    (state: AsyncDebouncerState<(handleValue: string) => Promise<void>>) => ({
      isPending: state.isPending,
      isExecuting: state.isExecuting,
    })
  );

  const cancel = useCallback(() => {
    asyncDebouncer.cancel();
    abortControllerRef.current?.abort();
  }, [asyncDebouncer]);

  // Debounced live availability check
  useEffect(() => {
    setAvailError(null);
    if (!handle || handleError) {
      cancel();
      setAvailable(null);
      setCheckingAvail(false);
      return;
    }

    setCheckingAvail(true);
    void asyncDebouncer.maybeExecute(handle);
  }, [handle, handleError, asyncDebouncer, cancel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    handleError,
    checkingAvail,
    available,
    availError,
    cancel,
  };
}
