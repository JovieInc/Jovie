'use client';

/**
 * Hook for debounced auto-save functionality.
 *
 * Pacer owns debounce coalescing. This hook owns revision ordering, resource
 * binding, and truthful flush/acknowledgments. Retry stays on the existing
 * Pacer AsyncRetryer — do not add a second retry stack here.
 */

import type { AsyncDebouncerState } from '@tanstack/react-pacer';
import { AsyncRetryer, useAsyncDebouncer } from '@tanstack/react-pacer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPacerError } from '../errors';
import { isRetryableError, RETRY_DEFAULTS } from '../retry';
import { PACER_TIMING } from './timing';

const DEFAULT_RESOURCE_KEY = 'default';

export interface AutoSaveAttemptMeta {
  revision: number;
  resourceKey: string;
  isLatest: boolean;
}

export interface UseAutoSaveOptions<TData> {
  /** The async save function */
  saveFn: (data: TData, meta: AutoSaveAttemptMeta) => Promise<void>;
  /** Debounce wait time in ms */
  wait?: number;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Callback on successful durable save of the latest revision */
  onSuccess?: (meta: AutoSaveAttemptMeta) => void;
  /** Callback on save error for the latest revision of the current resource */
  onError?: (error: Error, meta: AutoSaveAttemptMeta) => void;
  /**
   * Immutable resource identity for this hook instance. Changing it drops
   * unsent edits for the previous resource and ignores that resource's later
   * acknowledgments.
   */
  resourceKey?: string;
  /** Derive resource identity from each edit. Defaults to `resourceKey`. */
  getResourceKey?: (data: TData) => string;
  /** Compare payloads for no-op / acknowledged replay. Default: Object.is */
  isEqual?: (left: TData, right: TData) => boolean;
}

export interface UseAutoSaveReturn<TData> {
  /** Trigger debounced save */
  save: (data: TData) => void;
  /** Flush pending/in-flight revisions for the current resource */
  flush: () => Promise<void>;
  /** Cancel pending save */
  cancel: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Whether a save is pending */
  isPending: boolean;
  /** Whether the current resource has an unacknowledged revision */
  isDirty: boolean;
  /** Last successful save timestamp */
  lastSaved: Date | null;
  /** Last save error */
  error: Error | null;
  /** User-friendly error message */
  errorMessage: string | null;
}

type AutoSaveFn<TData> = (
  data: TData,
  meta: AutoSaveAttemptMeta
) => Promise<void>;

interface Attempt<TData> {
  data: TData;
  revision: number;
  resourceKey: string;
  saveFn: AutoSaveFn<TData>;
}

function defaultIsEqual<TData>(left: TData, right: TData): boolean {
  return Object.is(left, right);
}

/**
 * @example
 * ```tsx
 * const { save, flush, cancel, isSaving, lastSaved, errorMessage } = useAutoSave({
 *   saveFn: async (data) => {
 *     await fetch('/api/save', { method: 'PUT', body: JSON.stringify(data) });
 *   },
 *   wait: 900,
 *   resourceKey: profileId,
 * });
 *
 * useEffect(() => {
 *   save(formData);
 * }, [formData, save]);
 *
 * useEffect(() => {
 *   return () => {
 *     void flush().catch(() => {
 *       // React cleanup cannot guarantee durable delivery.
 *     });
 *   };
 * }, [flush]);
 * ```
 */
export function useAutoSave<TData>({
  saveFn,
  wait = PACER_TIMING.SAVE_DEBOUNCE_MS,
  maxRetries = RETRY_DEFAULTS.SAVE.maxAttempts,
  onSuccess,
  onError,
  resourceKey,
  getResourceKey,
  isEqual = defaultIsEqual,
}: UseAutoSaveOptions<TData>): UseAutoSaveReturn<TData> {
  const boundKey = resourceKey ?? DEFAULT_RESOURCE_KEY;
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [laneSaving, setLaneSaving] = useState(false);

  const pendingRef = useRef<Attempt<TData> | null>(null);
  const inFlightRef = useRef<Attempt<TData> | null>(null);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const drainPromiseRef = useRef<Promise<void> | null>(null);
  const ackRevisionRef = useRef(0);
  const ackDataRef = useRef<TData | undefined>(undefined);
  const nextRevisionRef = useRef(0);
  const currentResourceKeyRef = useRef(boundKey);
  const previousBoundKeyRef = useRef(boundKey);

  const saveFnRef = useRef(saveFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const getResourceKeyRef = useRef(getResourceKey);
  const isEqualRef = useRef(isEqual);
  const maxRetriesRef = useRef(maxRetries);

  useEffect(() => {
    saveFnRef.current = saveFn;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
    getResourceKeyRef.current = getResourceKey;
    isEqualRef.current = isEqual;
    maxRetriesRef.current = maxRetries;
  }, [saveFn, onSuccess, onError, getResourceKey, isEqual, maxRetries]);

  if (previousBoundKeyRef.current !== boundKey) {
    const previousKey = previousBoundKeyRef.current;
    previousBoundKeyRef.current = boundKey;
    currentResourceKeyRef.current = boundKey;
    if (pendingRef.current?.resourceKey === previousKey) {
      pendingRef.current = null;
    }
    ackRevisionRef.current = 0;
    ackDataRef.current = undefined;
    nextRevisionRef.current = 0;
  }

  const isLatestAttempt = useCallback((attempt: Attempt<TData>): boolean => {
    if (currentResourceKeyRef.current !== attempt.resourceKey) {
      return false;
    }
    const pending = pendingRef.current;
    return (
      pending === null ||
      pending.resourceKey !== attempt.resourceKey ||
      pending.revision <= attempt.revision
    );
  }, []);

  const buildMeta = useCallback(
    (attempt: Attempt<TData>): AutoSaveAttemptMeta => ({
      revision: attempt.revision,
      resourceKey: attempt.resourceKey,
      isLatest: isLatestAttempt(attempt),
    }),
    [isLatestAttempt]
  );

  const syncDirty = useCallback(() => {
    const currentKey = currentResourceKeyRef.current;
    const pending = pendingRef.current;
    setIsDirty(pending !== null && pending.resourceKey === currentKey);
  }, []);

  const executeAttempt = useCallback(
    async (attempt: Attempt<TData>) => {
      const retryer = new AsyncRetryer(
        async () => {
          await attempt.saveFn(attempt.data, {
            revision: attempt.revision,
            resourceKey: attempt.resourceKey,
            isLatest: isLatestAttempt(attempt),
          });
        },
        {
          maxAttempts: maxRetriesRef.current,
          baseWait: RETRY_DEFAULTS.SAVE.baseWait,
          backoff: RETRY_DEFAULTS.SAVE.backoff,
          jitter: 0.1,
          throwOnError: 'last',
          onError: retryErr => {
            if (!isRetryableError(retryErr)) {
              retryer.abort();
            }
          },
        }
      );

      await retryer.execute();
    },
    [isLatestAttempt]
  );

  const drainRef = useRef<() => Promise<void>>(async () => {});

  const ensureDrain = useCallback(() => {
    if (!drainPromiseRef.current) {
      drainPromiseRef.current = drainRef.current().finally(() => {
        drainPromiseRef.current = null;
      });
    }
    return drainPromiseRef.current;
  }, []);

  const cancelDebounceRef = useRef(() => {});

  const asyncDebouncer = useAsyncDebouncer(
    async () => {
      try {
        await ensureDrain();
      } catch {
        // Debounce keeps UI error state; flush callers await a rejected promise.
      }
    },
    {
      wait,
      onError: err => {
        const saveError = err instanceof Error ? err : new Error('Save failed');
        setError(saveError);
        setErrorMessage(formatPacerError(saveError));
        const pending = pendingRef.current ?? inFlightRef.current;
        if (pending) {
          onErrorRef.current?.(saveError, buildMeta(pending));
        } else {
          onErrorRef.current?.(saveError, {
            revision: ackRevisionRef.current,
            resourceKey: currentResourceKeyRef.current,
            isLatest: true,
          });
        }
      },
    },
    (state: AsyncDebouncerState<() => Promise<void>>) => ({
      isExecuting: state.isExecuting,
      isPending: state.isPending,
    })
  );

  cancelDebounceRef.current = () => {
    asyncDebouncer.cancel();
  };

  useEffect(() => {
    currentResourceKeyRef.current = boundKey;
    cancelDebounceRef.current();
    setIsDirty(false);
    setError(null);
    setErrorMessage(null);
    setLastSaved(null);
    setLaneSaving(inFlightRef.current?.resourceKey === boundKey);
  }, [boundKey]);

  drainRef.current = async () => {
    while (true) {
      const currentKey = currentResourceKeyRef.current;
      const pending = pendingRef.current;
      if (!pending || pending.resourceKey !== currentKey) {
        return;
      }

      if (
        ackDataRef.current !== undefined &&
        isEqualRef.current(pending.data, ackDataRef.current)
      ) {
        ackRevisionRef.current = Math.max(
          ackRevisionRef.current,
          pending.revision
        );
        pendingRef.current = null;
        setError(null);
        setErrorMessage(null);
        syncDirty();
        return;
      }

      if (inFlightPromiseRef.current) {
        await inFlightPromiseRef.current;
        continue;
      }

      const attempt = pending;
      inFlightRef.current = attempt;
      setLaneSaving(true);

      const run = executeAttempt(attempt).then(
        () => {
          const stillCurrent =
            currentResourceKeyRef.current === attempt.resourceKey;
          const latest = isLatestAttempt(attempt);
          if (!stillCurrent) {
            return;
          }

          ackRevisionRef.current = Math.max(
            ackRevisionRef.current,
            attempt.revision
          );
          ackDataRef.current = attempt.data;
          if (
            pendingRef.current?.resourceKey === attempt.resourceKey &&
            pendingRef.current.revision === attempt.revision
          ) {
            pendingRef.current = null;
          }
          syncDirty();

          if (latest) {
            setLastSaved(new Date());
            setError(null);
            setErrorMessage(null);
            onSuccessRef.current?.(buildMeta(attempt));
          }
        },
        (err: unknown) => {
          const saveError =
            err instanceof Error ? err : new Error('Save failed');
          const stillCurrent =
            currentResourceKeyRef.current === attempt.resourceKey;
          const latest = isLatestAttempt(attempt);
          if (stillCurrent && latest) {
            setError(saveError);
            setErrorMessage(formatPacerError(saveError));
            onErrorRef.current?.(saveError, buildMeta(attempt));
          }
          throw saveError;
        }
      );

      const settled = run.finally(() => {
        if (inFlightRef.current === attempt) {
          inFlightRef.current = null;
        }
        if (inFlightPromiseRef.current === settled) {
          inFlightPromiseRef.current = null;
        }
        setLaneSaving(false);
      });
      inFlightPromiseRef.current = settled;

      try {
        await settled;
      } catch (err) {
        const newerPending =
          pendingRef.current &&
          pendingRef.current.resourceKey === currentResourceKeyRef.current &&
          pendingRef.current.revision > attempt.revision;
        if (newerPending) {
          continue;
        }
        throw err;
      }
    }
  };

  const save = useCallback(
    (data: TData) => {
      const key =
        getResourceKeyRef.current?.(data) ?? currentResourceKeyRef.current;
      nextRevisionRef.current += 1;
      pendingRef.current = {
        data,
        revision: nextRevisionRef.current,
        resourceKey: key,
        saveFn: saveFnRef.current,
      };
      setError(null);
      setErrorMessage(null);
      setIsDirty(key === currentResourceKeyRef.current);
      asyncDebouncer.maybeExecute();
    },
    [asyncDebouncer]
  );

  const flush = useCallback(async () => {
    asyncDebouncer.cancel();
    const currentKey = currentResourceKeyRef.current;
    const hasWork =
      pendingRef.current?.resourceKey === currentKey ||
      inFlightRef.current?.resourceKey === currentKey;
    if (!hasWork) {
      return;
    }

    await ensureDrain();
  }, [asyncDebouncer, ensureDrain]);

  const cancel = useCallback(() => {
    asyncDebouncer.cancel();
    if (pendingRef.current?.resourceKey === currentResourceKeyRef.current) {
      pendingRef.current = null;
    }
    setIsDirty(false);
  }, [asyncDebouncer]);

  return {
    save,
    flush,
    cancel,
    isSaving: laneSaving || asyncDebouncer.state.isExecuting || false,
    isPending: asyncDebouncer.state.isPending || false,
    isDirty,
    lastSaved,
    error,
    errorMessage,
  };
}
