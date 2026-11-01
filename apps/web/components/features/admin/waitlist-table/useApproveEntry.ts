'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/feedback';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import {
  useApproveWaitlistMutation,
  useDisapproveWaitlistMutation,
  useResendWaitlistInviteMutation,
} from '@/lib/queries';
import type { ApproveStatus } from './types';

interface UseApproveEntryProps {
  readonly onRowUpdate: (
    entryId: string,
    updates: Partial<WaitlistEntryRow>
  ) => void;
}

const isApprovedStatus = (status: WaitlistEntryRow['status']) =>
  status === 'invited' || status === 'approved';

export function useApproveEntry({ onRowUpdate }: UseApproveEntryProps) {
  const [approveStatuses, setApproveStatuses] = useState<
    Record<string, ApproveStatus>
  >({});

  const approveWaitlistMutation = useApproveWaitlistMutation();
  const disapproveWaitlistMutation = useDisapproveWaitlistMutation();
  const resendInviteMutation = useResendWaitlistInviteMutation();

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
            status: 'waitlisted',
            updatedAt: new Date(),
          });
        } else {
          await approveWaitlistMutation.mutateAsync({ entryId });
          onRowUpdate(entryId, {
            status: 'invited',
            updatedAt: new Date(),
          });
        }

        setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
        toast.success(
          currentlyApproved
            ? 'Access revoked'
            : 'Access approved, invite queued'
        );
      } catch (error) {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : 'Waitlist action failed'
        );
      }
    },
    [approveWaitlistMutation, disapproveWaitlistMutation, onRowUpdate]
  );

  const resendInvite = useCallback(
    async (entry: Pick<WaitlistEntryRow, 'id'>) => {
      const { id: entryId } = entry;

      setApproveStatuses(prev => ({
        ...prev,
        [entryId]: 'approving',
      }));

      try {
        await resendInviteMutation.mutateAsync({ entryId });
        onRowUpdate(entryId, { updatedAt: new Date() });
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
      } catch (error) {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : 'Failed to resend invite'
        );
      }
    },
    [onRowUpdate, resendInviteMutation]
  );

  return { approveStatuses, approveEntry, resendInvite };
}
