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

/**
 * Sort releases by release date descending with ID tiebreaker for stable order.
 */
function sortReleases(releases: ReleaseViewModel[]): ReleaseViewModel[] {
  return [...releases].sort((a, b) => {
    const dateA = a.releaseDate
      ? new Date(a.releaseDate).getTime()
      : Number.NEGATIVE_INFINITY;
    const dateB = b.releaseDate
      ? new Date(b.releaseDate).getTime()
      : Number.NEGATIVE_INFINITY;
    if (dateA !== dateB) return dateB - dateA;
    return a.id.localeCompare(b.id);
  });
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
  // Accumulate releases across polls so rows never disappear
  const seenReleasesRef = useRef(new Map<string, ReleaseViewModel>());

  onReleasesUpdateRef.current = onReleasesUpdate;
  onImportCompleteRef.current = onImportComplete;

  /**
   * Merge polled releases into the seen map, update count, and emit sorted list.
   */
  const mergeAndEmit = useCallback(
    (releases: ReleaseViewModel[], serverCount?: number) => {
      for (const release of releases) {
        seenReleasesRef.current.set(release.id, release);
      }
      const merged = sortReleases(Array.from(seenReleasesRef.current.values()));
      const mergedCount = seenReleasesRef.current.size;
      const nextCount = Math.max(mergedCount, serverCount ?? 0);
      setImportedCount(nextCount);
      onReleasesUpdateRef.current(merged);
    },
    []
  );

  const poll = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    try {
      const [statusResult, releasesResult] = await Promise.all([
        getSpotifyImportStatus(),
        pollReleasesCount(),
      ]);

      if (releasesResult.count > 0) {
        mergeAndEmit(releasesResult.releases, releasesResult.count);
      }

      if (
        statusResult.status === 'complete' ||
        statusResult.status === 'failed'
      ) {
        // One final fetch to ensure we have all releases
        if (statusResult.status === 'complete') {
          const final = await pollReleasesCount();
          mergeAndEmit(final.releases, final.count);
        }
        onImportCompleteRef.current();
      }
    } catch {
      // Polling errors are non-fatal; next tick will retry
    } finally {
      isPollingRef.current = false;
    }
  }, [mergeAndEmit]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Reset seen releases when a new import starts
    seenReleasesRef.current.clear();
    setImportedCount(0);

    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Immediately poll on mount
    void poll();

    return () => clearInterval(id);
  }, [enabled, poll]);

  return { importedCount };
}
