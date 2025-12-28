/**
 * useSuggestionSync Hook
 *
 * Custom hook for syncing link suggestions from the server.
 * Handles polling, version tracking, and accept/dismiss API calls.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions';
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
}

/**
 * Custom hook for syncing suggestions with the server
 *
 * Features:
 * - Polling with configurable interval
 * - Auto-refresh after ingestable URLs
 * - Accept/dismiss API integration
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
  // Abort controller for canceling in-flight requests
  const suggestionSyncAbortRef = useRef<AbortController | null>(null);

  // Polling interval depends on whether we're in auto-refresh mode
  const pollIntervalMs = useMemo(
    () => (autoRefreshUntilMs ? 2000 : 4500),
    [autoRefreshUntilMs]
  );

  // Sync suggestions from server
  const syncSuggestionsFromServer = useCallback(async () => {
    if (!profileId || !suggestionsEnabled) return;

    suggestionSyncAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionSyncAbortRef.current = controller;

    try {
      const response = await fetch(
        `/api/dashboard/social-links?profileId=${profileId}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!response.ok) return;

      const data = (await response.json().catch(() => null)) as {
        links?: ProfileSocialLink[];
      } | null;

      if (!data?.links) return;

      // Update version from server response
      const serverVersions = data.links
        .map(l => l.version ?? 1)
        .filter(v => typeof v === 'number');
      if (serverVersions.length > 0) {
        const serverVersion = Math.max(...serverVersions);
        setLinksVersion(prev => Math.max(prev, serverVersion));
      }

      const nextSuggestions = convertDbLinksToSuggestions(
        data.links.filter(link => link.state === 'suggested')
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

  // Handle accepting a suggestion
  const handleAcceptSuggestion = useCallback(
    async (
      suggestion: DetectedLink & { suggestionId?: string }
    ): Promise<LinkItem | null> => {
      if (!profileId) {
        toast.error('Missing profile id; please refresh and try again.');
        return null;
      }

      try {
        const suggestionId = suggestion.suggestionId;
        if (!suggestionId) {
          return null;
        }

        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestionId,
            action: 'accept',
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || 'Failed to accept link');
        }

        const data = (await response.json()) as {
          link?: ProfileSocialLink;
        };

        if (data.link) {
          const [detected] = convertDbLinksToLinkItems([data.link]);
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

  // Handle dismissing a suggestion
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
        const response = await fetch('/api/dashboard/social-links', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            linkId: suggestion.suggestionId,
            action: 'dismiss',
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || 'Failed to dismiss link');
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
  };
}
