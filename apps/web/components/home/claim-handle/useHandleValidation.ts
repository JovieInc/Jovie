'use client';

/**
 * Handle Validation Hook
 *
 * Simple debounced fetch for handle availability checking.
 * No TanStack Pacer — just a plain setTimeout + AbortController.
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

/** Abort fetch if it takes longer than this */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Hook for validating handle format and availability.
 *
 * Uses a plain debounced fetch with AbortController — no complex
 * retry/cache machinery that can get stuck.
 */
export function useHandleValidation(handle: string): HandleValidationResult {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setChecking(false);
  }, []);

  // Trigger availability check when handle changes
  useEffect(() => {
    // Reset state
    setAvailError(null);

    // Clear any pending check
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();

    // Nothing to check
    if (!handle || handleError) {
      setAvailable(null);
      setChecking(false);
      return;
    }

    // Show checking state immediately (before debounce fires)
    setChecking(true);
    setAvailable(null);

    // Debounce the actual API call
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      // Timeout the fetch
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(handle.toLowerCase())}`,
          { signal: controller.signal }
        );

        clearTimeout(timeoutId);

        // Aborted while waiting
        if (controller.signal.aborted) return;

        const json = await res
          .json()
          .catch(() => ({ available: false, error: 'Parse error' }));

        if (!res.ok) {
          setAvailable(null);
          setAvailError(json?.error || 'Error checking availability');
          setChecking(false);
          return;
        }

        setAvailable(Boolean(json?.available));
        setAvailError(null);
        setChecking(false);
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        // Aborts happen from user typing (effect cleanup) or fetch timeout.
        // Either way, reset checking so the UI doesn't get stuck.
        if (err instanceof DOMException && err.name === 'AbortError') {
          setChecking(false);
          return;
        }

        setAvailable(null);
        setAvailError('Network error — try again');
        setChecking(false);
      }
    }, DEBOUNCE_MS);

    // Cleanup on unmount or handle change
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [handle, handleError]);

  return {
    handleError,
    checkingAvail: checking,
    available,
    availError,
    cancel,
  };
}
