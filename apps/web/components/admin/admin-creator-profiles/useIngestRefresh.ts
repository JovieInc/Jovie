'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useIngestRefreshMutation } from '@/lib/queries/useIngestRefreshMutation';
import type { IngestRefreshStatus } from './types';

interface UseIngestRefreshOptions {
  selectedId: string | null;
  onRefreshComplete?: (profileId: string) => void | Promise<void>;
}

interface UseIngestRefreshReturn {
  ingestRefreshStatuses: Record<string, IngestRefreshStatus>;
  refreshIngest: (profileId: string) => void;
  isPending: boolean;
}

/**
 * Hook to manage ingest refresh operations for creator profiles.
 * Uses TanStack Query mutation for proper state management and cache invalidation.
 */
export function useIngestRefresh({
  selectedId,
  onRefreshComplete,
}: UseIngestRefreshOptions): UseIngestRefreshReturn {
  const router = useRouter();
  const notifications = useNotifications();
  const [ingestRefreshStatuses, setIngestRefreshStatuses] = useState<
    Record<string, IngestRefreshStatus>
  >({});

  const mutation = useIngestRefreshMutation();

  const refreshIngest = useCallback(
    (profileId: string) => {
      setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'loading' }));

      mutation.mutate(
        { profileId },
        {
          onSuccess: () => {
            setIngestRefreshStatuses(prev => ({
              ...prev,
              [profileId]: 'success',
            }));
            notifications.success('Ingestion refresh queued');
            router.refresh();

            if (selectedId === profileId && onRefreshComplete) {
              onRefreshComplete(profileId);
            }

            // Reset to idle after success animation
            setTimeout(() => {
              setIngestRefreshStatuses(prev => ({
                ...prev,
                [profileId]: 'idle',
              }));
            }, 2200);
          },
          onError: error => {
            setIngestRefreshStatuses(prev => ({
              ...prev,
              [profileId]: 'error',
            }));
            notifications.handleError(error);

            // Reset to idle after error
            setTimeout(() => {
              setIngestRefreshStatuses(prev => ({
                ...prev,
                [profileId]: 'idle',
              }));
            }, 2200);
          },
        }
      );
    },
    [mutation, notifications, onRefreshComplete, router, selectedId]
  );

  return {
    ingestRefreshStatuses,
    refreshIngest,
    isPending: mutation.isPending,
  };
}
