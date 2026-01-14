'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { IngestRefreshStatus } from './types';

interface UseIngestRefreshOptions {
  selectedId: string | null;
  onRefreshComplete?: (profileId: string) => void;
}

interface UseIngestRefreshReturn {
  ingestRefreshStatuses: Record<string, IngestRefreshStatus>;
  refreshIngest: (profileId: string) => Promise<void>;
}

/**
 * Hook to manage ingest refresh operations for creator profiles.
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

  const refreshIngest = useCallback(
    async (profileId: string): Promise<void> => {
      setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'loading' }));
      try {
        const response = await fetch('/app/admin/creators/bulk-refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ profileIds: [profileId] }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          queuedCount?: number;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          throw new Error(payload.error ?? 'Failed to queue ingestion');
        }

        setIngestRefreshStatuses(prev => ({
          ...prev,
          [profileId]: 'success',
        }));
        notifications.success('Ingestion refresh queued');
        router.refresh();

        if (selectedId === profileId && onRefreshComplete) {
          void onRefreshComplete(profileId);
        }
      } catch (error) {
        setIngestRefreshStatuses(prev => ({ ...prev, [profileId]: 'error' }));
        notifications.handleError(error);
      } finally {
        window.setTimeout(() => {
          setIngestRefreshStatuses(prev => ({
            ...prev,
            [profileId]: 'idle',
          }));
        }, 2200);
      }
    },
    [notifications, onRefreshComplete, router, selectedId]
  );

  return {
    ingestRefreshStatuses,
    refreshIngest,
  };
}
