'use client';

import { useCallback, useState } from 'react';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { useApproveWaitlistMutation } from '@/lib/queries/useWaitlistMutations';
import type { ApproveStatus } from './types';

interface UseApproveEntryProps {
  readonly onRowUpdate: (
    entryId: string,
    updates: Partial<WaitlistEntryRow>
  ) => void;
}

export function useApproveEntry({ onRowUpdate }: UseApproveEntryProps) {
  const [approveStatuses, setApproveStatuses] = useState<
    Record<string, ApproveStatus>
  >({});

  // TanStack Query mutation for cache invalidation
  const approveWaitlistMutation = useApproveWaitlistMutation();

  const approveEntry = useCallback(
    async (entryId: string) => {
      setApproveStatuses(prev => ({ ...prev, [entryId]: 'loading' }));

      try {
        await approveWaitlistMutation.mutateAsync({ entryId });

        onRowUpdate(entryId, {
          status: 'invited',
          updatedAt: new Date(),
        });

        setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
      } catch {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
      }
    },
    [onRowUpdate, approveWaitlistMutation]
  );

  return { approveStatuses, approveEntry };
}
