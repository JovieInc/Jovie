'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { loadTracksForRelease } from '@/app/app/(shell)/dashboard/releases/actions';
import { APP_ROUTES } from '@/constants/routes';
import type { ReleaseViewModel, TrackViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';

export interface UseExpandedTracksResult {
  /** Set of release IDs that are currently expanded */
  expandedReleaseIds: Set<string>;
  /** Map of release ID to loaded tracks */
  tracksByReleaseId: Map<string, TrackViewModel[]>;
  /** Set of release IDs currently loading */
  loadingReleaseIds: Set<string>;
  /** Toggle expansion for a release (lazy loads tracks on first expand) */
  toggleExpansion: (release: ReleaseViewModel) => Promise<void>;
  /** Check if a release is expanded */
  isExpanded: (releaseId: string) => boolean;
  /** Check if a release is loading */
  isLoading: (releaseId: string) => boolean;
  /** Get tracks for a release (returns undefined if not loaded) */
  getTracksForRelease: (releaseId: string) => TrackViewModel[] | undefined;
  /** Collapse all expanded releases */
  collapseAll: () => void;
}

/**
 * Hook for managing expandable track rows in the releases table.
 *
 * Features:
 * - Lazy loading: tracks are fetched only when a release is first expanded
 * - Caching: tracks are cached after loading (no re-fetch on re-expand)
 * - Loading state: shows spinner while fetching
 * - Session-only state: expanded state is not persisted
 */
export function useExpandedTracks(): UseExpandedTracksResult {
  const [expandedReleaseIds, setExpandedReleaseIds] = useState<Set<string>>(
    new Set()
  );
  const [tracksByReleaseId, setTracksByReleaseId] = useState<
    Map<string, TrackViewModel[]>
  >(new Map());
  const [loadingReleaseIds, setLoadingReleaseIds] = useState<Set<string>>(
    new Set()
  );
  const [, startTransition] = useTransition();

  // Ref to track loading state for race condition prevention
  // This allows us to check if user collapsed during fetch
  const loadingReleaseIdsRef = useRef<Set<string>>(new Set());

  const isExpanded = useCallback(
    (releaseId: string) => expandedReleaseIds.has(releaseId),
    [expandedReleaseIds]
  );

  const isLoading = useCallback(
    (releaseId: string) => loadingReleaseIds.has(releaseId),
    [loadingReleaseIds]
  );

  const getTracksForRelease = useCallback(
    (releaseId: string) => tracksByReleaseId.get(releaseId),
    [tracksByReleaseId]
  );

  const toggleExpansion = useCallback(
    async (release: ReleaseViewModel) => {
      const releaseId = release.id;

      // If already expanded or loading, collapse and cancel pending expansion
      if (
        expandedReleaseIds.has(releaseId) ||
        loadingReleaseIdsRef.current.has(releaseId)
      ) {
        // Remove from loading ref (cancels pending expansion)
        loadingReleaseIdsRef.current.delete(releaseId);
        setLoadingReleaseIds(prev => {
          const next = new Set(prev);
          next.delete(releaseId);
          return next;
        });
        setExpandedReleaseIds(prev => {
          const next = new Set(prev);
          next.delete(releaseId);
          return next;
        });
        return;
      }

      // If tracks are already cached, just expand
      if (tracksByReleaseId.has(releaseId)) {
        setExpandedReleaseIds(prev => new Set(prev).add(releaseId));
        return;
      }

      // Mark as loading (both state and ref)
      loadingReleaseIdsRef.current.add(releaseId);
      setLoadingReleaseIds(prev => new Set(prev).add(releaseId));

      try {
        // Fetch tracks from server
        const tracks = await loadTracksForRelease({
          releaseId,
          releaseSlug: release.slug,
        });

        // Only expand if still in loading state (user didn't collapse during load)
        if (loadingReleaseIdsRef.current.has(releaseId)) {
          // Cache the tracks
          startTransition(() => {
            setTracksByReleaseId(prev => {
              const next = new Map(prev);
              next.set(releaseId, tracks);
              return next;
            });

            // Expand the release
            setExpandedReleaseIds(prev => new Set(prev).add(releaseId));
          });
        }
      } catch (error) {
        void captureError('Failed to load tracks for release', error, {
          releaseId,
          releaseSlug: release.slug,
          route: APP_ROUTES.RELEASES,
        });
        // Could show a toast here
      } finally {
        // Clear loading state (both state and ref)
        loadingReleaseIdsRef.current.delete(releaseId);
        setLoadingReleaseIds(prev => {
          const next = new Set(prev);
          next.delete(releaseId);
          return next;
        });
      }
    },
    [expandedReleaseIds, tracksByReleaseId]
  );

  const collapseAll = useCallback(() => {
    setExpandedReleaseIds(new Set());
  }, []);

  return {
    expandedReleaseIds,
    tracksByReleaseId,
    loadingReleaseIds,
    toggleExpansion,
    isExpanded,
    isLoading,
    getTracksForRelease,
    collapseAll,
  };
}
