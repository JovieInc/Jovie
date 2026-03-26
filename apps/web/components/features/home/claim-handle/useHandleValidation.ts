'use client';

/**
 * Handle Validation Hook
 *
 * Validates handle format client-side and checks availability with a
 * debounced fetch to the handle API.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
const CACHE_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

interface HandleAvailabilityResponse {
  readonly available: boolean;
  readonly error: string | null;
}

interface HandleAvailabilityState {
  readonly data: HandleAvailabilityResponse | null;
  readonly isError: boolean;
  readonly isFetching: boolean;
}

const availabilityCache = new Map<
  string,
  {
    readonly expiresAt: number;
    readonly value: HandleAvailabilityResponse;
  }
>();

async function fetchHandleAvailability(
  handle: string,
  signal: AbortSignal
): Promise<HandleAvailabilityResponse> {
  const response = await fetch(
    `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`,
    {
      headers: {
        Accept: 'application/json',
      },
      signal,
    }
  );

  const payload = (await response.json().catch(() => null)) as {
    available?: boolean;
    error?: string;
  } | null;

  if (!response.ok) {
    return {
      available: false,
      error: payload?.error ?? 'Network error - try again',
    };
  }

  return {
    available: payload?.available === true,
    error: typeof payload?.error === 'string' ? payload.error : null,
  };
}

/**
 * Hook for validating handle format and availability.
 *
 * Uses a debounced fetch with a short in-memory cache to avoid excessive
 * requests while typing.
 */
export function useHandleValidation(handle: string): HandleValidationResult {
  const [debouncedHandle, setDebouncedHandle] = useState('');
  const [availabilityState, setAvailabilityState] =
    useState<HandleAvailabilityState>({
      data: null,
      isError: false,
      isFetching: false,
    });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

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

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (!isValidHandle || debouncedHandle.length < 3) {
      setAvailabilityState({
        data: null,
        isError: false,
        isFetching: false,
      });
      return;
    }

    const normalizedHandle = debouncedHandle.toLowerCase();
    const cached = availabilityCache.get(normalizedHandle);

    if (cached && cached.expiresAt > Date.now()) {
      setAvailabilityState({
        data: cached.value,
        isError: false,
        isFetching: false,
      });
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    requestIdRef.current = requestId;
    abortRef.current = controller;
    setAvailabilityState(current => ({
      data: current.data,
      isError: false,
      isFetching: true,
    }));

    void fetchHandleAvailability(normalizedHandle, controller.signal)
      .then(result => {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        availabilityCache.set(normalizedHandle, {
          expiresAt: Date.now() + CACHE_TTL_MS,
          value: result,
        });
        setAvailabilityState({
          data: result,
          isError: false,
          isFetching: false,
        });
      })
      .catch(() => {
        if (controller.signal.aborted || requestIdRef.current !== requestId) {
          return;
        }

        setAvailabilityState({
          data: null,
          isError: true,
          isFetching: false,
        });
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [debouncedHandle, isValidHandle]);

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setDebouncedHandle('');
    setAvailabilityState({
      data: null,
      isError: false,
      isFetching: false,
    });
  }, []);

  // Determine checking state: either debounce is pending or query is fetching
  const isDebouncing = isValidHandle && handle !== debouncedHandle;
  const checkingAvail = isDebouncing || availabilityState.isFetching;

  // Determine availability and error from query result
  const available = availabilityState.data?.available ?? null;
  const availError = availabilityState.isError
    ? 'Network error - try again'
    : (availabilityState.data?.error ?? null);

  return {
    handleError,
    checkingAvail,
    available,
    availError,
    cancel,
  };
}
