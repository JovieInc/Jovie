'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSaveStatus } from '@/features/dashboard/hooks/useSaveStatus';

interface UseOptimisticToggleOptions {
  readonly initialValue: boolean;
  readonly mutateAsync: (value: boolean) => Promise<unknown>;
  readonly onOptimisticUpdate?: (value: boolean) => void;
  readonly errorMessage?: string;
}

interface UseOptimisticToggleReturn {
  readonly checked: boolean;
  readonly handleToggle: (enabled: boolean) => Promise<void>;
  readonly isPending: boolean;
  readonly saveStatus: ReturnType<typeof useSaveStatus>['status'];
}

export function useOptimisticToggle({
  initialValue,
  mutateAsync,
  onOptimisticUpdate,
  errorMessage = 'Failed to update setting. Please try again.',
}: UseOptimisticToggleOptions): UseOptimisticToggleReturn {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);
  const {
    status: saveStatus,
    markSaving,
    markSuccess,
    markError,
    resetStatus,
  } = useSaveStatus();

  // Sync with server value when initialValue changes (e.g., refetch or profile switch)
  useEffect(() => {
    if (!isPending) {
      setChecked(initialValue);
      resetStatus();
    }
  }, [initialValue, isPending, resetStatus]);

  const handleToggle = async (enabled: boolean) => {
    const previousValue = checked;

    // Optimistic update
    setChecked(enabled);
    onOptimisticUpdate?.(enabled);

    setIsPending(true);
    markSaving();
    try {
      await mutateAsync(enabled);
      markSuccess();
    } catch {
      // Rollback on error
      setChecked(previousValue);
      onOptimisticUpdate?.(previousValue);
      toast.error(errorMessage);
      markError(errorMessage);
    } finally {
      setIsPending(false);
    }
  };

  return { checked, handleToggle, isPending, saveStatus };
}
