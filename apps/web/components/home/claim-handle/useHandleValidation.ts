'use client';

/**
 * Handle Validation Hook
 *
 * Validates handle format client-side and checks availability via
 * useHandleAvailabilityQuery (TanStack Query) with debounced input.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHandleAvailabilityQuery } from '@/lib/queries/useHandleAvailabilityQuery';

export interface HandleValidationResult {
  handleError: string | null;
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
  /** Cancel pending validation */
  cancel: () => void;
}

/** Debounce before hitting the API */
const DEBOUNCE_MS = 400;

/**
 * Hook for validating handle format and availability.
 *
 * Uses TanStack Query (useHandleAvailabilityQuery) for the API call,
 * with a debounced input value to avoid excessive requests while typing.
 */
export function useHandleValidation(handle: string): HandleValidationResult {
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounce the handle value before sending to the query
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Reset debounced handle if input is invalid or empty
    if (!handle || handleError) {
      setDebouncedHandle('');
      return;
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedHandle(handle);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [handle, handleError]);

  const isValidHandle = Boolean(handle) && !handleError;

  const { data, isFetching, isError } = useHandleAvailabilityQuery({
    handle: debouncedHandle || null,
    enabled: isValidHandle && debouncedHandle.length >= 3,
  });

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setDebouncedHandle('');
  }, []);

  // Determine checking state: either debounce is pending or query is fetching
  const isDebouncing = isValidHandle && handle !== debouncedHandle;
  const checkingAvail = isDebouncing || isFetching;

  // Determine availability and error from query result
  const available = data?.available ?? null;
  const availError = isError
    ? 'Network error \u2014 try again'
    : (data?.error ?? null);

  return {
    handleError,
    checkingAvail,
    available,
    availError,
    cancel,
  };
}
