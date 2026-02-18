'use client';

/**
 * Hook for debounced auto-save functionality.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { AsyncRetryer, useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPacerError } from '../errors';
import { isRetryableError, RETRY_DEFAULTS } from '../retry';
import { PACER_TIMING } from './timing';

export interface UseAutoSaveOptions<TData> {
  /** The async save function */
  saveFn: (data: TData) => Promise<void>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
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
  /** User-friendly error message */
  errorMessage: string | null;
}

/**
 * @example
 * ```tsx
 * const { save, flush, cancel, isSaving, lastSaved, errorMessage } = useAutoSave({
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
export function useAutoSave<TData>({
  saveFn,
  wait = PACER_TIMING.SAVE_DEBOUNCE_MS,
  maxRetries = RETRY_DEFAULTS.SAVE.maxAttempts,
  onSuccess,
  onError,
}: UseAutoSaveOptions<TData>): UseAutoSaveReturn<TData> {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingDataRef = useRef<TData | null>(null);
  const saveFnRef = useRef(saveFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    saveFnRef.current = saveFn;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [saveFn, onSuccess, onError]);

  const executeSaveWithRetry = useCallback(
    async (data: TData) => {
      const retryer = new AsyncRetryer(
        async () => {
          await saveFnRef.current(data);
        },
        {
          maxAttempts: maxRetries,
          baseWait: RETRY_DEFAULTS.SAVE.baseWait,
          backoff: RETRY_DEFAULTS.SAVE.backoff,
          jitter: 0.1,
          onError: retryErr => {
            if (!isRetryableError(retryErr)) {
              retryer.abort();
            }
          },
        }
      );

      await retryer.execute();
    },
    [maxRetries]
  );

  const asyncDebouncer = useAsyncDebouncer(
    async (data: TData) => {
      try {
        await executeSaveWithRetry(data);
        setLastSaved(new Date());
        setError(null);
        setErrorMessage(null);
        onSuccessRef.current?.();
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        setErrorMessage(formatPacerError(saveError));
        onErrorRef.current?.(saveError);
        throw err;
      }
    },
    {
      wait,
      onError: err => {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        setErrorMessage(formatPacerError(saveError));
        onErrorRef.current?.(saveError);
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
      setErrorMessage(null);
      asyncDebouncer.maybeExecute(data);
    },
    [asyncDebouncer]
  );

  const flush = useCallback(async () => {
    if (pendingDataRef.current !== null) {
      asyncDebouncer.cancel();
      try {
        await executeSaveWithRetry(pendingDataRef.current);
        setLastSaved(new Date());
        setError(null);
        setErrorMessage(null);
        onSuccessRef.current?.();
      } catch (err) {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        setErrorMessage(formatPacerError(saveError));
        onErrorRef.current?.(saveError);
      } finally {
        pendingDataRef.current = null;
      }
    }
  }, [asyncDebouncer, executeSaveWithRetry]);

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
    errorMessage,
  };
}
