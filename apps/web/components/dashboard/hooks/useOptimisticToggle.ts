'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
}

export function useOptimisticToggle({
  initialValue,
  mutateAsync,
  onOptimisticUpdate,
  errorMessage = 'Failed to update setting. Please try again.',
}: UseOptimisticToggleOptions): UseOptimisticToggleReturn {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);

  // Sync with server value when initialValue changes (e.g., refetch or profile switch)
  useEffect(() => {
    if (!isPending) {
      setChecked(initialValue);
    }
  }, [initialValue, isPending]);

  const handleToggle = async (enabled: boolean) => {
    const previousValue = checked;

    // Optimistic update
    setChecked(enabled);
    onOptimisticUpdate?.(enabled);

    setIsPending(true);
    try {
      await mutateAsync(enabled);
    } catch {
      // Rollback on error
      toast.error(errorMessage);
      setChecked(previousValue);
      onOptimisticUpdate?.(previousValue);
    } finally {
      setIsPending(false);
    }
  };

  return { checked, handleToggle, isPending };
}
