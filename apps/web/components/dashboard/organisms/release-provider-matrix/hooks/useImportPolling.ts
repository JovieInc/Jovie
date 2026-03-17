'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpotifyImportStatus,
  pollReleasesCount,
} from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

const POLL_INTERVAL_MS = 2000;
/** Stop polling after 5 minutes to avoid infinite polling when background import silently fails. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function getSortTimestamp(releaseDate: string | null | undefined): number {
  if (!releaseDate) return Number.NEGATIVE_INFINITY;

  const timestamp = new Date(releaseDate).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

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
    const dateA = getSortTimestamp(a.releaseDate);
    const dateB = getSortTimestamp(b.releaseDate);
    if (dateA !== dateB) return dateB - dateA;
    return a.id.localeCompare(b.id);
  });
}

/** Combined result from both server actions. */
interface ImportPollResult {
  status: 'idle' | 'importing' | 'complete' | 'failed';
  releaseCount: number;
  releases: ReleaseViewModel[];
  serverCount: number;
}

async function fetchImportPoll(): Promise<ImportPollResult> {
  const [statusResult, releasesResult] = await Promise.all([
    getSpotifyImportStatus(),
    pollReleasesCount(),
  ]);

  return {
    status: statusResult.status,
    releaseCount: statusResult.releaseCount,
    releases: releasesResult.releases,
    serverCount: releasesResult.count,
  };
}

export function useImportPolling({
  enabled,
  onReleasesUpdate,
  onImportComplete,
}: UseImportPollingParams) {
  const [importedCount, setImportedCount] = useState(0);
  const onReleasesUpdateRef = useRef(onReleasesUpdate);
  const onImportCompleteRef = useRef(onImportComplete);
  // Accumulate releases across polls so rows never disappear
  const seenReleasesRef = useRef(new Map<string, ReleaseViewModel>());
  // Track whether import completed so we stop polling
  const [isComplete, setIsComplete] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    onReleasesUpdateRef.current = onReleasesUpdate;
    onImportCompleteRef.current = onImportComplete;
  });

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

  // Track when polling started for timeout detection
  const pollStartRef = useRef<number>(0);

  // Reset when a new import starts
  useEffect(() => {
    if (enabled) {
      seenReleasesRef.current.clear();
      setImportedCount(0);
      setIsComplete(false);
      pollStartRef.current = Date.now();
      // Remove stale poll data from previous imports
      queryClient.removeQueries({ queryKey: ['import-polling'] });
    }
  }, [enabled, queryClient]);

  const isPolling = enabled && !isComplete;

  const { data } = useQuery({
    queryKey: ['import-polling'],
    queryFn: fetchImportPoll,
    enabled: isPolling,
    refetchInterval: isPolling ? POLL_INTERVAL_MS : false,
    // Don't cache stale import data across navigations
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Process poll results whenever query data changes
  useEffect(() => {
    if (!data || !isPolling) return;

    if (data.releases.length > 0) {
      mergeAndEmit(data.releases, data.serverCount);
    }

    // Treat stuck imports as failed after POLL_TIMEOUT_MS
    const timedOut =
      pollStartRef.current > 0 &&
      Date.now() - pollStartRef.current > POLL_TIMEOUT_MS;

    if (data.status === 'complete' || data.status === 'failed' || timedOut) {
      if (data.status === 'complete') {
        // Final merge with latest data
        mergeAndEmit(data.releases, data.serverCount);
      }
      setIsComplete(true);
      onImportCompleteRef.current();
    }
  }, [data, isPolling, mergeAndEmit]);

  return { importedCount };
}
