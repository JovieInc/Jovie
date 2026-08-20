'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { useSaveStatus } from '@/features/dashboard/hooks/useSaveStatus';

interface UseOptimisticToggleOptions {
  readonly initialValue: boolean;
  readonly syncKey?: string | number | null;
  readonly mutateAsync: (value: boolean) => Promise<unknown>;
  readonly onOptimisticUpdate?: (value: boolean) => void;
  readonly errorMessage?: string;
  readonly showErrorToast?: boolean;
}

interface UseOptimisticToggleReturn {
  readonly checked: boolean;
  readonly handleToggle: (enabled: boolean) => Promise<void>;
  readonly isPending: boolean;
  readonly saveStatus: ReturnType<typeof useSaveStatus>['status'];
}

export function useOptimisticToggle({
  initialValue,
  syncKey,
  mutateAsync,
  onOptimisticUpdate,
  errorMessage = 'Failed to update setting. Please try again.',
  showErrorToast = true,
}: UseOptimisticToggleOptions): UseOptimisticToggleReturn {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);
  const syncedInitialValue = useRef(initialValue);
  const activeSyncKey = useRef(syncKey);
  const operationVersion = useRef(0);
  const {
    status: saveStatus,
    markSaving,
    markSuccess,
    markError,
    resetStatus,
  } = useSaveStatus();

  // Sync only when the upstream value itself changes. A pending transition must
  // not restore the stale pre-mutation value after a successful optimistic save.
  useEffect(() => {
    if (!Object.is(activeSyncKey.current, syncKey)) {
      activeSyncKey.current = syncKey;
      syncedInitialValue.current = initialValue;
      operationVersion.current += 1;
      setChecked(initialValue);
      setIsPending(false);
      resetStatus();
      return;
    }

    if (!isPending && !Object.is(syncedInitialValue.current, initialValue)) {
      syncedInitialValue.current = initialValue;
      if (Object.is(checked, initialValue)) return;
      setChecked(initialValue);
      resetStatus();
    }
  }, [checked, initialValue, isPending, resetStatus, syncKey]);

  const handleToggle = async (enabled: boolean) => {
    const previousValue = checked;
    const operation = ++operationVersion.current;

    // Optimistic update
    setChecked(enabled);
    onOptimisticUpdate?.(enabled);

    setIsPending(true);
    markSaving();
    try {
      await mutateAsync(enabled);
      if (operation !== operationVersion.current) return;
      markSuccess();
    } catch {
      if (operation !== operationVersion.current) return;
      // Rollback on error
      setChecked(previousValue);
      onOptimisticUpdate?.(previousValue);
      if (showErrorToast) toast.error(errorMessage);
      markError(errorMessage);
    } finally {
      if (operation === operationVersion.current) setIsPending(false);
    }
  };

  return { checked, handleToggle, isPending, saveStatus };
}
