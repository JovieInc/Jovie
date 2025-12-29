import { useCallback, useState } from 'react';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import type { ApproveStatus } from './types';

interface UseApproveEntryProps {
  onRowUpdate: (entryId: string, updates: Partial<WaitlistEntryRow>) => void;
}

export function useApproveEntry({ onRowUpdate }: UseApproveEntryProps) {
  const [approveStatuses, setApproveStatuses] = useState<
    Record<string, ApproveStatus>
  >({});

  const approveEntry = useCallback(
    async (entryId: string) => {
      setApproveStatuses(prev => ({ ...prev, [entryId]: 'loading' }));

      try {
        const response = await fetch('/app/admin/waitlist/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ entryId }),
        });

        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          status?: string;
          error?: string;
        } | null;

        if (!response.ok || !payload?.success) {
          setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
          return;
        }

        onRowUpdate(entryId, {
          status: 'invited',
          updatedAt: new Date(),
        });

        setApproveStatuses(prev => ({ ...prev, [entryId]: 'success' }));
      } catch {
        setApproveStatuses(prev => ({ ...prev, [entryId]: 'error' }));
      }
    },
    [onRowUpdate]
  );

  return { approveStatuses, approveEntry };
}
