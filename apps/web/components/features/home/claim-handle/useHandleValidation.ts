'use client';

/**
 * Handle Validation Hook
 *
 * Validates handle format client-side and checks availability with a
 * debounced fetch to the handle API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FetchError, fetchWithTimeout } from '@/lib/queries/fetch';
import { hasOnlyLowercaseLettersNumbersAndHyphens } from '@/lib/validation/handle';

export interface HandleValidationResult {
  handleError: string | null;
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
  cancel: () => void;
}

const DEBOUNCE_MS = 400;
const HANDLE_CACHE_TTL_MS = 30 * 1000;

interface HandleAvailabilityResponse {
  available: boolean;
  error?: string;
}

interface CachedAvailabilityResult extends HandleAvailabilityResponse {
  cachedAt: number;
}

const handleAvailabilityCache = new Map<string, CachedAvailabilityResult>();

function getCachedAvailability(
  handle: string
): HandleAvailabilityResponse | null {
  const cachedResult = handleAvailabilityCache.get(handle);
  if (!cachedResult) return null;

  if (Date.now() - cachedResult.cachedAt > HANDLE_CACHE_TTL_MS) {
    handleAvailabilityCache.delete(handle);
    return null;
  }

  return cachedResult;
}

async function fetchHandleAvailability(
  handle: string,
  signal: AbortSignal
): Promise<HandleAvailabilityResponse> {
  const cachedResult = getCachedAvailability(handle);
  if (cachedResult) {
    return cachedResult;
  }

  try {
    const response = await fetchWithTimeout<HandleAvailabilityResponse>(
      `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`,
      {
        signal,
      }
    );
    handleAvailabilityCache.set(handle, {
      ...response,
      cachedAt: Date.now(),
    });
    return response;
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        available: false,
        error: error.message || 'Error checking availability',
      };
    }
    throw error;
  }
}

export function useHandleValidation(handle: string): HandleValidationResult {
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const latestRequestHandleRef = useRef<string | null>(null);
  const [availabilityState, setAvailabilityState] = useState<{
    checkingAvail: boolean;
    available: boolean | null;
    availError: string | null;
  }>({
    checkingAvail: false,
    available: null,
    availError: null,
  });

  const handleError = useMemo(() => {
    if (!handle) return null;
    if (handle.length < 3) return 'Handle must be at least 3 characters';
    if (handle.length > 30) return 'Handle must be less than 30 characters';
    if (!hasOnlyLowercaseLettersNumbersAndHyphens(handle))
      return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (handle.startsWith('-') || handle.endsWith('-'))
      return 'Handle cannot start or end with a hyphen';
    return null;
  }, [handle]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

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

  useEffect(() => {
    if (!isValidHandle || debouncedHandle.length < 3) {
      abortControllerRef.current?.abort();
      latestRequestHandleRef.current = null;
      setAvailabilityState({
        checkingAvail: false,
        available: null,
        availError: null,
      });
      return;
    }

    const normalizedHandle = debouncedHandle.toLowerCase();
    const cachedResult = getCachedAvailability(normalizedHandle);
    if (cachedResult) {
      setAvailabilityState({
        checkingAvail: false,
        available: cachedResult.available,
        availError: cachedResult.error ?? null,
      });
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    latestRequestHandleRef.current = normalizedHandle;

    setAvailabilityState({
      checkingAvail: true,
      available: null,
      availError: null,
    });

    void fetchHandleAvailability(normalizedHandle, controller.signal)
      .then(result => {
        if (
          controller.signal.aborted ||
          latestRequestHandleRef.current !== normalizedHandle
        ) {
          return;
        }

        setAvailabilityState({
          checkingAvail: false,
          available: result.available,
          availError: result.error ?? null,
        });
      })
      .catch(error => {
        if (
          controller.signal.aborted ||
          latestRequestHandleRef.current !== normalizedHandle
        ) {
          return;
        }

        setAvailabilityState({
          checkingAvail: false,
          available: false,
          availError:
            error instanceof Error
              ? error.message
              : 'Network error - try again',
        });
      });

    return () => {
      controller.abort();
    };
  }, [debouncedHandle, isValidHandle]);

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortControllerRef.current?.abort();
    latestRequestHandleRef.current = null;
    setDebouncedHandle('');
    setAvailabilityState({
      checkingAvail: false,
      available: null,
      availError: null,
    });
  }, []);

  const isDebouncing = isValidHandle && handle !== debouncedHandle;
  const checkingAvail = isDebouncing || availabilityState.checkingAvail;

  return {
    handleError,
    checkingAvail,
    available: availabilityState.available,
    availError: availabilityState.availError,
    cancel,
  };
}
