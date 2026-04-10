'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyImportPollSnapshot } from '@/app/app/(shell)/dashboard/releases/actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

const POLL_INTERVAL_MS = 2000;
const BACKOFF_POLL_INTERVAL_MS = 5000;
const IDLE_POLLS_BEFORE_BACKOFF = 3;
/** Stop polling after 5 minutes to avoid infinite polling when background import silently fails. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
/** Hold the banner at 100% for 1 second before hiding, so the user sees "done". */
const COMPLETION_HOLD_MS = 1000;

function getSortTimestamp(releaseDate: string | null | undefined): number {
  if (!releaseDate) return Number.NEGATIVE_INFINITY;

  const timestamp = new Date(releaseDate).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

interface UseImportPollingParams {
  enabled: boolean;
  initialTotalCount?: number;
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
  totalCount: number;
  releases: ReleaseViewModel[];
  serverCount: number;
}

async function fetchImportPoll(): Promise<ImportPollResult> {
  const result = await getSpotifyImportPollSnapshot();

  return {
    status: result.status,
    releaseCount: result.releaseCount,
    totalCount: result.totalCount,
    releases: result.releases,
    serverCount: result.serverCount,
  };
}

export function useImportPolling({
  enabled,
  initialTotalCount = 0,
  onReleasesUpdate,
  onImportComplete,
}: UseImportPollingParams) {
  const [importedCount, setImportedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [pollIntervalMs, setPollIntervalMs] = useState(POLL_INTERVAL_MS);
  const onReleasesUpdateRef = useRef(onReleasesUpdate);
  const onImportCompleteRef = useRef(onImportComplete);
  // Accumulate releases across polls so rows never disappear
  const seenReleasesRef = useRef(new Map<string, ReleaseViewModel>());
  const stagnantPollCountRef = useRef(0);
  const lastProgressSignatureRef = useRef<string | null>(null);
  // Track whether import completed so we stop polling
  const [isComplete, setIsComplete] = useState(false);
  const queryClient = useQueryClient();
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setTotalCount(initialTotalCount);
      setPollIntervalMs(POLL_INTERVAL_MS);
      setIsComplete(false);
      stagnantPollCountRef.current = 0;
      lastProgressSignatureRef.current = null;
      pollStartRef.current = Date.now();
      // Remove stale poll data from previous imports
      queryClient.removeQueries({ queryKey: ['import-polling'] });
    }
    return () => {
      if (completionTimerRef.current) {
        clearTimeout(completionTimerRef.current);
        completionTimerRef.current = null;
      }
    };
  }, [enabled, initialTotalCount, queryClient]);

  const isPolling = enabled && !isComplete;

  const { data } = useQuery({
    queryKey: ['import-polling'],
    queryFn: fetchImportPoll,
    enabled: isPolling,
    refetchInterval: isPolling ? pollIntervalMs : false,
    // Don't cache stale import data across navigations
    gcTime: 0,
    staleTime: 0,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // Process poll results whenever query data changes
  useEffect(() => {
    if (!data || !isPolling) return;

    // Update totalCount from server if available and larger
    if (data.totalCount > 0 && data.totalCount > totalCount) {
      setTotalCount(data.totalCount);
    }

    if (data.releases.length > 0) {
      mergeAndEmit(data.releases, data.serverCount);
    }

    const nextImportedCount = Math.max(
      seenReleasesRef.current.size,
      data.serverCount,
      data.releaseCount
    );
    const progressSignature = [
      data.status,
      nextImportedCount,
      data.totalCount,
    ].join(':');

    if (progressSignature === lastProgressSignatureRef.current) {
      stagnantPollCountRef.current += 1;
    } else {
      lastProgressSignatureRef.current = progressSignature;
      stagnantPollCountRef.current = 0;
      if (pollIntervalMs !== POLL_INTERVAL_MS) {
        setPollIntervalMs(POLL_INTERVAL_MS);
      }
    }

    if (
      data.status === 'importing' &&
      stagnantPollCountRef.current >= IDLE_POLLS_BEFORE_BACKOFF &&
      pollIntervalMs !== BACKOFF_POLL_INTERVAL_MS
    ) {
      setPollIntervalMs(BACKOFF_POLL_INTERVAL_MS);
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
      // Hold the banner at 100% for 1 second so the user sees completion
      completionTimerRef.current = setTimeout(() => {
        onImportCompleteRef.current();
        completionTimerRef.current = null;
      }, COMPLETION_HOLD_MS);
    }
  }, [data, isPolling, mergeAndEmit, pollIntervalMs, totalCount]);

  return { importedCount, totalCount };
}
