'use client';

import { useCallback, useState } from 'react';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import {
  useApproveWaitlistMutation,
  useDisapproveWaitlistMutation,
} from '@/lib/queries/useWaitlistMutations';
import type { ApproveStatus } from './types';

interface UseApproveEntryProps {
  readonly onRowUpdate: (
    entryId: string,
    updates: Partial<WaitlistEntryRow>
  ) => void;
}

const isApprovedStatus = (status: WaitlistEntryRow['status']) =>
  status === 'invited' || status === 'claimed';

export function useApproveEntry({ onRowUpdate }: UseApproveEntryProps) {
  const [approveStatuses, setApproveStatuses] = useState<
    Record<string, ApproveStatus>
  >({});

  const approveWaitlistMutation = useApproveWaitlistMutation();
  const disapproveWaitlistMutation = useDisapproveWaitlistMutation();

  const approveEntry = useCallback(
    async (entry: Pick<WaitlistEntryRow, 'id' | 'status'>) => {
      const { id: entryId, status } = entry;
      const currentlyApproved = isApprovedStatus(status);

      setApproveStatuses(prev => ({
        ...prev,
        [entryId]: currentlyApproved ? 'disapproving' : 'approving',
      }));

      try {
        if (currentlyApproved) {
          await disapproveWaitlistMutation.mutateAsync({ entryId });
          onRowUpdate(entryId, {
            status: 'new',
            updatedAt: new Date(),
          });
        } else {
          await approveWaitlistMutation.mutateAsync({ entryId });
          onRowUpdate(entryId, {
            status: 'claimed',
            updatedAt: new Date(),
          });
        }

        setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
      } catch {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
      }
    },
    [approveWaitlistMutation, disapproveWaitlistMutation, onRowUpdate]
  );

  return { approveStatuses, approveEntry };
}
