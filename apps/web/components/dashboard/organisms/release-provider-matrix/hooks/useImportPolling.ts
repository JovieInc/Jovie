'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpotifyImportStatus,
  pollReleasesCount,
} from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

const POLL_INTERVAL_MS = 2000;

interface UseImportPollingParams {
  enabled: boolean;
  onReleasesUpdate: (releases: ReleaseViewModel[]) => void;
  onImportComplete: () => void;
}

export function useImportPolling({
  enabled,
  onReleasesUpdate,
  onImportComplete,
}: UseImportPollingParams) {
  const [importedCount, setImportedCount] = useState(0);
  const isPollingRef = useRef(false);
  const onReleasesUpdateRef = useRef(onReleasesUpdate);
  const onImportCompleteRef = useRef(onImportComplete);

  onReleasesUpdateRef.current = onReleasesUpdate;
  onImportCompleteRef.current = onImportComplete;

  const poll = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const [statusResult, releasesResult] = await Promise.all([
        getSpotifyImportStatus(),
        pollReleasesCount(),
      ]);

      setImportedCount(releasesResult.count);

      if (releasesResult.count > 0) {
        onReleasesUpdateRef.current(releasesResult.releases);
      }

      if (
        statusResult.status === 'complete' ||
        statusResult.status === 'failed'
      ) {
        // One final fetch to ensure we have all releases
        if (statusResult.status === 'complete') {
          const final = await pollReleasesCount();
          onReleasesUpdateRef.current(final.releases);
          setImportedCount(final.count);
        }
        onImportCompleteRef.current();
      }
    } catch {
      // Polling errors are non-fatal; next tick will retry
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Immediately poll on mount
    void poll();

    return () => clearInterval(id);
  }, [enabled, poll]);

  return { importedCount };
}
