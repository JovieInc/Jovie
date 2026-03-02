'use client';

/**
 * Handle Validation Hook
 *
 * Provides debounced handle availability checking using the shared
 * useAsyncValidation hook from TanStack Pacer.
 *
 * @see https://tanstack.com/pacer
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PACER_TIMING, useAsyncValidation } from '@/lib/pacer/hooks';

export interface HandleValidationResult {
  handleError: string | null;
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
  /** Cancel pending validation */
  cancel: () => void;
}

interface HandleCheckResponse {
  available: boolean;
  error?: string;
}

/**
 * Maximum time (ms) to wait for an availability check before showing an error.
 * Covers debounce (450ms) + API timeout (5s) + buffer.
 */
const AVAILABILITY_CHECK_TIMEOUT_MS = 8_000;

/**
 * Hook for validating handle format and availability.
 *
 * Uses the shared useAsyncValidation hook to reduce code duplication
 * while maintaining the same API surface.
 */
export function useHandleValidation(handle: string): HandleValidationResult {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Client-side handle validation
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

  // Use the shared async validation hook
  const { validate, cancel, isValidating, isPending, result, error } =
    useAsyncValidation<string, HandleCheckResponse>({
      validatorFn: async (handleValue, signal) => {
        const value = handleValue.toLowerCase();
        const res = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(value)}`,
          { signal }
        );
        const json = await res
          .json()
          .catch(() => ({ available: false, error: 'Parse error' }));

        if (!res.ok) {
          throw new Error(json?.error || 'Error checking availability');
        }

        return json as HandleCheckResponse;
      },
      wait: PACER_TIMING.VALIDATION_DEBOUNCE_MS,
      enabled: !handleError && handle.length >= 3,
      onSuccess: res => {
        setAvailable(Boolean(res?.available));
        setAvailError(null);
      },
      onError: err => {
        setAvailable(null);
        setAvailError(err.message === 'AbortError' ? null : err.message);
      },
    });

  // Sync result state
  useEffect(() => {
    if (result) {
      setAvailable(Boolean(result.available));
      setAvailError(null);
    }
  }, [result]);

  // Sync error state
  useEffect(() => {
    if (error && error.name !== 'AbortError') {
      setAvailable(null);
      setAvailError(error.message || 'Network error');
    }
  }, [error]);

  // Determine if we're in a loading state
  const isLoading = isValidating || isPending;

  // Safety timeout: if loading state persists beyond a reasonable window,
  // force-clear it and show an error so the user isn't stuck forever.
  // This handles edge cases where the debouncer/fetch gets stuck on mobile.
  useEffect(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    if (isLoading && handle && !handleError) {
      safetyTimerRef.current = setTimeout(() => {
        // Still loading after timeout — force error state
        cancel();
        setAvailable(null);
        setAvailError("Couldn't check availability \u2014 try again");
      }, AVAILABILITY_CHECK_TIMEOUT_MS);
    }

    return () => {
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, [isLoading, handle, handleError, cancel]);

  // Trigger validation when handle changes
  useEffect(() => {
    setAvailError(null);

    if (!handle || handleError) {
      cancel();
      setAvailable(null);
      return;
    }

    void validate(handle);
  }, [handle, handleError, validate, cancel]);

  // Wrap cancel to also reset state
  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    handleError,
    checkingAvail: isLoading,
    available,
    availError,
    cancel: handleCancel,
  };
}
