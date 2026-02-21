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
  errorMessage = 'Something went wrong. Please try again.',
}: UseOptimisticToggleOptions): UseOptimisticToggleReturn {
  const [checked, setChecked] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);

  // Sync local state when the source of truth changes (e.g. after a refetch)
  useEffect(() => {
    setChecked(initialValue);
  }, [initialValue]);

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
      setChecked(previousValue);
      onOptimisticUpdate?.(previousValue);
      toast.error(errorMessage);
    } finally {
      setIsPending(false);
    }
  };

  return { checked, handleToggle, isPending };
}
