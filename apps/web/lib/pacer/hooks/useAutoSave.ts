'use client';

/**
 * Hook for debounced auto-save functionality.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useRef, useState } from 'react';
import { PACER_TIMING } from './timing';

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

/**
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
      asyncDebouncer.maybeExecute(data);
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
