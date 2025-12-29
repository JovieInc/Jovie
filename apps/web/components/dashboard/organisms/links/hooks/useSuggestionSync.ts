/**
 * useSuggestionSync Hook
 *
 * Custom hook for syncing link suggestions from the server.
 * Handles polling, version tracking, and accept/dismiss API calls.
 *
 * Uses server actions per Section 10.1 of agents.md - Data Fetching Strategy.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { fetchSocialLinks, updateLinkState } from '@/lib/actions/social-links';
import { usePollingCoordinator } from '@/lib/hooks/usePollingCoordinator';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import type { LinkItem, SuggestedLink } from '../types';
import {
  areSuggestionListsEqual,
  convertDbLinksToLinkItems,
  convertDbLinksToSuggestions,
} from '../utils/link-transformers';

/**
 * Options for the useSuggestionSync hook
 */
export interface UseSuggestionSyncOptions {
  /** Profile ID to sync suggestions for */
  profileId: string | undefined;
  /** Whether suggestions feature is enabled */
  suggestionsEnabled: boolean;
  /** Auto-refresh deadline (ms timestamp) */
  autoRefreshUntilMs: number | null;
  /** Set auto-refresh deadline */
  setAutoRefreshUntilMs: React.Dispatch<React.SetStateAction<number | null>>;
  /** Current links version for optimistic locking */
  linksVersion: number;
  /** Set links version */
  setLinksVersion: React.Dispatch<React.SetStateAction<number>>;
  /** Set main links array */
  setLinks: React.Dispatch<React.SetStateAction<LinkItem[]>>;
  /** Set suggested links array */
  setSuggestedLinks: React.Dispatch<React.SetStateAction<SuggestedLink[]>>;
}

/**
 * Return type for the useSuggestionSync hook
 */
export interface UseSuggestionSyncReturn {
  /** Sync suggestions from server */
  syncSuggestionsFromServer: () => Promise<void>;
  /** Handle accepting a suggestion */
  handleAcceptSuggestion: (
    suggestion: DetectedLink & { suggestionId?: string }
  ) => Promise<LinkItem | null>;
  /** Handle dismissing a suggestion */
  handleDismissSuggestion: (
    suggestion: DetectedLink & { suggestionId?: string }
  ) => Promise<void>;
  /** Whether an action is in progress */
  isUpdating: boolean;
}

/**
 * Custom hook for syncing suggestions with the server
 *
 * Features:
 * - Polling with configurable interval
 * - Auto-refresh after ingestable URLs
 * - Accept/dismiss using server actions
 * - Version tracking for optimistic locking
 *
 * @example
 * ```tsx
 * const {
 *   syncSuggestionsFromServer,
 *   handleAcceptSuggestion,
 *   handleDismissSuggestion,
 * } = useSuggestionSync({
 *   profileId,
 *   suggestionsEnabled: true,
 *   autoRefreshUntilMs,
 *   setAutoRefreshUntilMs,
 *   linksVersion,
 *   setLinksVersion,
 *   setLinks,
 *   setSuggestedLinks,
 * });
 * ```
 */
export function useSuggestionSync({
  profileId,
  suggestionsEnabled,
  autoRefreshUntilMs,
  setAutoRefreshUntilMs,
  linksVersion,
  setLinksVersion,
  setLinks,
  setSuggestedLinks,
}: UseSuggestionSyncOptions): UseSuggestionSyncReturn {
  // Track updating state - currently not actively used but kept for interface compatibility
  const isUpdating = false;

  // Abort controller for canceling in-flight requests
  const suggestionSyncAbortRef = useRef<AbortController | null>(null);

  // Polling interval depends on whether we're in auto-refresh mode
  const pollIntervalMs = useMemo(
    () => (autoRefreshUntilMs ? 2000 : 4500),
    [autoRefreshUntilMs]
  );

  // Sync suggestions from server using server action
  const syncSuggestionsFromServer = useCallback(async () => {
    if (!profileId || !suggestionsEnabled) return;

    // Cancel any in-flight sync
    suggestionSyncAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionSyncAbortRef.current = controller;

    try {
      // Use server action instead of fetch
      const result = await fetchSocialLinks(profileId);

      // Check if aborted
      if (controller.signal.aborted) return;

      if (!result.success) return;

      const links = result.links;

      // Update version from server response
      const serverVersions = links
        .map(l => l.version ?? 1)
        .filter(v => typeof v === 'number');
      if (serverVersions.length > 0) {
        const serverVersion = Math.max(...serverVersions);
        setLinksVersion(prev => Math.max(prev, serverVersion));
      }

      const nextSuggestions = convertDbLinksToSuggestions(
        links.filter(link => link.state === 'suggested')
      );
      setSuggestedLinks(prev =>
        areSuggestionListsEqual(prev, nextSuggestions) ? prev : nextSuggestions
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to refresh suggestions', error);
    } finally {
      suggestionSyncAbortRef.current = null;
    }
  }, [profileId, suggestionsEnabled, setLinksVersion, setSuggestedLinks]);

  // Set up polling using the coordinator
  const { registerTask, unregisterTask, updateTask } = usePollingCoordinator();

  useEffect(() => {
    if (!profileId || !suggestionsEnabled) {
      unregisterTask('sync-suggestions');
      return;
    }

    const cleanup = registerTask({
      id: 'sync-suggestions',
      callback: async () => {
        await syncSuggestionsFromServer();
        if (autoRefreshUntilMs && Date.now() >= autoRefreshUntilMs) {
          setAutoRefreshUntilMs(null);
        }
      },
      intervalMs: pollIntervalMs,
      priority: 1,
      enabled: true,
    });

    return cleanup;
  }, [
    profileId,
    suggestionsEnabled,
    pollIntervalMs,
    autoRefreshUntilMs,
    syncSuggestionsFromServer,
    registerTask,
    unregisterTask,
    setAutoRefreshUntilMs,
  ]);

  // Update interval when pollIntervalMs changes
  useEffect(() => {
    if (profileId && suggestionsEnabled) {
      updateTask('sync-suggestions', { intervalMs: pollIntervalMs });
    }
  }, [pollIntervalMs, profileId, suggestionsEnabled, updateTask]);

  // Handle accepting a suggestion using server action
  const handleAcceptSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<LinkItem | null> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return null;
      }

      const suggestionId = suggestion.suggestionId;
      if (!suggestionId) {
        return null;
      }

      try {
        // Use server action instead of fetch
        const result = await updateLinkState(profileId, suggestionId, 'accept');

        if (!result.success) {
          throw new Error(result.error || 'Failed to accept link');
        }

        if (result.link) {
          const [detected] = convertDbLinksToLinkItems([result.link]);
          setSuggestedLinks(prev =>
            prev.filter(s => s.suggestionId !== suggestionId)
          );
          if (detected) {
            setLinks(prev => [...prev, detected]);
          }
          toast.success('Link added to your list');
          return detected ?? null;
        }
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to accept link'
        );
      }
      return null;
    },
    [profileId, setLinks, setSuggestedLinks]
  );

  // Handle dismissing a suggestion using server action
  const handleDismissSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<void> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      if (!suggestion.suggestionId) {
        return;
      }

      try {
        // Use server action instead of fetch
        const result = await updateLinkState(
          profileId,
          suggestion.suggestionId,
          'dismiss'
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to dismiss link');
        }

        setSuggestedLinks(prev =>
          prev.filter(s => s.suggestionId !== suggestion.suggestionId)
        );
        toast.success('Suggestion dismissed');
      } catch (error) {
        console.error(error);
        toast.error(
          error instanceof Error ? error.message : 'Failed to dismiss link'
        );
      }
    },
    [profileId, setSuggestedLinks]
  );

  return {
    syncSuggestionsFromServer,
    handleAcceptSuggestion,
    handleDismissSuggestion,
    isUpdating,
  };
}
