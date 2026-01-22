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

/** Delay before resetting status to idle after success/error */
const STATUS_RESET_DELAY_MS = 2200;

/** Helper to create status updater for a specific profile */
function createIdleStatusUpdater(profileId: string) {
  return (prev: Record<string, IngestRefreshStatus>) => ({
    ...prev,
    [profileId]: 'idle' as const,
  });
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

  // Extracted to reduce nesting depth (S2004)
  const scheduleStatusReset = useCallback((profileId: string) => {
    setTimeout(() => {
      setIngestRefreshStatuses(createIdleStatusUpdater(profileId));
    }, STATUS_RESET_DELAY_MS);
  }, []);

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

            scheduleStatusReset(profileId);
          },
          onError: error => {
            setIngestRefreshStatuses(prev => ({
              ...prev,
              [profileId]: 'error',
            }));
            notifications.handleError(error);

            scheduleStatusReset(profileId);
          },
        }
      );
    },
    [
      mutation,
      notifications,
      onRefreshComplete,
      router,
      scheduleStatusReset,
      selectedId,
    ]
  );

  return {
    ingestRefreshStatuses,
    refreshIngest,
    isPending: mutation.isPending,
  };
}
